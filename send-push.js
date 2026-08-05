import admin from 'firebase-admin';

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error("오류: FIREBASE_SERVICE_ACCOUNT 환경변수가 설정되지 않았습니다.");
  process.exit(1);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://gwanak-on-default-rtdb.firebaseio.com"
});

const db = admin.database();

function sanitizeKey(key) {
  return (key || "").replace(/[.#$\[\]\/]/g, "_");
}

// 만료되었거나 앱 삭제 등으로 유효하지 않은 FCM 토큰 에러 코드 목록
const INVALID_TOKEN_ERROR_CODES = [
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument'
];

async function main() {
  const now = new Date();
  const utcMs = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
  const kstTomorrow = new Date(utcMs + (9 * 60 * 60 * 1000));
  kstTomorrow.setDate(kstTomorrow.getDate() + 1);

  const year = kstTomorrow.getFullYear();
  const month = String(kstTomorrow.getMonth() + 1).padStart(2, '0');
  const day = kstTomorrow.getDate();

  console.log(`[알림 스케줄러 시작] 대상 날짜(내일 KST): ${year}-${month}-${day}`);

  const dutyRef = db.ref(`gwanak-on/${year}-${month}`);
  const tokenRef = db.ref('push_tokens');

  const [dutySnap, tokenSnap] = await Promise.all([
    dutyRef.once('value'),
    tokenRef.once('value')
  ]);

  const dutyRaw = dutySnap.val();
  const tokens = tokenSnap.val() || {};

  if (!dutyRaw) {
    console.log(`[종료] ${year}년 ${month}월 당직 데이터가 DB에 없습니다.`);
    process.exit(0);
  }

  const dutyList = Array.isArray(dutyRaw) ? dutyRaw : Object.values(dutyRaw);

  const tomorrowDuties = dutyList.filter(item => {
    let dateStr = item["dateStr"] || "";
    if (!dateStr) {
      const foundKey = Object.keys(item).find(k => k.includes("당직상황근무지정"));
      if (foundKey) dateStr = item[foundKey];
    }
    const parts = dateStr.split('/');
    const itemDay = parts.length > 1 ? parseInt(parts[1], 10) : 0;
    return itemDay === day;
  });

  if (tomorrowDuties.length === 0) {
    console.log(`[종료] ${day}일 지정된 당직 정보가 없습니다.`);
    process.exit(0);
  }

  const targets = [];
  tomorrowDuties.forEach(d => {
    const shiftType = d["__EMPTY_8"] || d["shiftType"] || "당직";
    const leaderName = (d["__EMPTY_3"] || d["leaderName"] || "").replace(/\s/g, '');
    const worker1Name = (d["__EMPTY_5"] || d["worker1Name"] || "").replace(/\s/g, '');
    const worker2Name = (d["__EMPTY_7"] || d["worker2Name"] || "").replace(/\s/g, '');

    [leaderName, worker1Name, worker2Name].forEach(name => {
      if (name) targets.push({ name, shiftType });
    });
  });

  console.log("내일 근무 예정자:", targets);

  const messages = [];

  for (const target of targets) {
    const safeKey = sanitizeKey(target.name);
    const userTokenData = tokens[safeKey];

    if (!userTokenData) {
      console.log(`[스킵] ${target.name} - DB에 토큰 없음`);
      continue;
    }

    // 메시지 객체 생성 헬퍼
    const buildMessage = (token, deviceId) => ({
      token,
      userName: target.name,
      userKey: safeKey,
      deviceId, // 기기별 삭제를 위해 보관 (null이면 구형 flat 구조)
      notification: {
        title: '[당직 안내]',
        body: `${target.name}님, 내일은 당직 근무일입니다. 근무 시간을 확인해 주세요.`
      },
      webpush: {
        notification: {
          icon: './gwanakonIcon.png'
        },
        fcmOptions: {
          link: "./"
        }
      }
    });

    // 1. 구형(flat) 구조: push_tokens/{safeKey} = { token, enabled, ... }
    if (userTokenData.token) {
      if (userTokenData.enabled !== false) {
        messages.push(buildMessage(userTokenData.token, null));
      }
    } else {
      // 2. 신형(nested) 구조: push_tokens/{safeKey}/{deviceId} = { token, enabled, ... }
      Object.entries(userTokenData).forEach(([deviceId, deviceData]) => {
        // enabled가 false인 기기는 제외
        if (deviceData?.token && deviceData?.enabled !== false) {
          messages.push(buildMessage(deviceData.token, deviceId));
        }
      });

      if (!Object.values(userTokenData).some(d => d?.token && d?.enabled !== false)) {
        console.log(`[스킵] ${target.name} - 유효하거나 활성화된 토큰 없음`);
      }
    }
  }

  if (messages.length === 0) {
    console.log("발송할 유효한 대상 토큰이 없습니다.");
    process.exit(0);
  }

  console.log(`총 ${messages.length}건의 푸시 알림 발송을 시도합니다...`);

  // FCM 페이로드에서 내부 메타데이터(userName, userKey, deviceId) 제거 후 발송
  const fcmPayloads = messages.map(({ userName, userKey, deviceId, ...payload }) => payload);
  const response = await admin.messaging().sendEach(fcmPayloads);

  console.log(`발송 결과 - 성공: ${response.successCount}건, 실패: ${response.failureCount}건`);

  // 2번 방법: 발송 실패 건 중 앱 삭제/토큰 만료 건 DB 정제 처리
  if (response.failureCount > 0) {
    const cleanupPromises = [];

    response.responses.forEach((resp, i) => {
      if (!resp.success) {
        const errCode = resp.error?.code;
        const targetUser = messages[i];
        console.error(`[발송 실패] ${targetUser.userName} (${errCode}):`, resp.error?.message);

        // 무효하거나 삭제된 토큰 에러 감지
        if (INVALID_TOKEN_ERROR_CODES.includes(errCode)) {
          console.log(`[토큰 삭제 예약] ${targetUser.userName}의 무효한 토큰 DB 삭제 진행`);

          if (targetUser.deviceId) {
            // 신형 nested 구조: 해당 기기 노드만 삭제
            cleanupPromises.push(db.ref(`push_tokens/${targetUser.userKey}/${targetUser.deviceId}`).remove());
          } else {
            // 구형 flat 구조: 사용자 노드 전체 삭제
            cleanupPromises.push(db.ref(`push_tokens/${targetUser.userKey}`).remove());
          }
        }
      }
    });

    if (cleanupPromises.length > 0) {
      await Promise.all(cleanupPromises);
      console.log(`[토큰 정리 완료] 유효하지 않은 토큰 노드 ${cleanupPromises.length}개를 DB에서 성공적으로 삭제했습니다.`);
    }
  }

  process.exit(0);
}

main().catch(err => {
  console.error("실행 중 오류 발생:", err);
  process.exit(1);
});