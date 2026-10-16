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

const INVALID_TOKEN_ERROR_CODES = [
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument'
];

// 알림 종류 정의
const NOTIFY_TYPES = [
  {
    label: '하루 전',
    offsetDays: 1,
    // 구버전 토큰(dayBefore 필드 없음)은 하루 전 알림 ON으로 간주
    isEnabled: (d) => d?.token && d.enabled !== false && d.dayBefore !== false,
    body: (name) => `${name}님, 내일은 당직 근무일입니다. 일정을 확인해 주세요.`
  },
  {
    label: '일주일 전',
    offsetDays: 7,
    isEnabled: (d) => d?.token && d.enabled !== false && d.weekBefore === true,
    body: (name) => `${name}님, 일주일 뒤에 당직 근무일입니다. 일정을 확인해 주세요.`
  }
];

// KST 기준 offset일 뒤 날짜
function getKstDate(offsetDays) {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  kst.setUTCDate(kst.getUTCDate() + offsetDays);
  return {
    year: kst.getUTCFullYear(),
    month: String(kst.getUTCMonth() + 1).padStart(2, '0'),
    day: kst.getUTCDate()
  };
}

async function collectMessages(type, tokens, monthCache) {
  const { year, month, day } = getKstDate(type.offsetDays);
  const monthKey = `${year}-${month}`;
  console.log(`[${type.label}] 대상 날짜(KST): ${year}-${month}-${day}`);

  if (!(monthKey in monthCache)) {
    const snap = await db.ref(`gwanak-on/${monthKey}/list`).once('value');
    monthCache[monthKey] = snap.val();
  }

  const dutyRaw = monthCache[monthKey];
  if (!dutyRaw) {
    console.log(`[${type.label}] ${monthKey} 당직 데이터가 DB에 없습니다.`);
    return [];
  }

  const dutyList = Array.isArray(dutyRaw) ? dutyRaw : Object.values(dutyRaw);

  const duties = dutyList.filter(item => {
    if (!item) return false;
    const parts = (item.dateStr || "").split('/');
    const itemDay = parts.length > 1 ? parseInt(parts[1], 10) : item.day;
    return itemDay === day;
  });

  if (duties.length === 0) {
    console.log(`[${type.label}] ${day}일 지정된 당직 정보가 없습니다.`);
    return [];
  }

  // 같은 날 일직/숙직 중복 근무자는 한 번만
  const names = new Set();
  duties.forEach(d => {
    [d.leaderName, d.worker1Name, d.worker2Name].forEach(n => {
      const name = (n || "").replace(/\s/g, '');
      if (name) names.add(name);
    });
  });

  console.log(`[${type.label}] 근무 예정자:`, [...names]);

  const messages = [];

  const buildMessage = (token, name, userKey, deviceId) => ({
    token,
    userName: name,
    userKey,
    deviceId,
    notification: {
      title: '[당직 안내]',
      body: type.body(name)
    },
    webpush: {
      notification: { icon: '/gwanakon/gwanakonIcon-512.png' },
      fcmOptions: { link: "./" }
    }
  });

  for (const name of names) {
    const userKey = sanitizeKey(name);
    const userTokenData = tokens[userKey];

    if (!userTokenData) {
      console.log(`[스킵][${type.label}] ${name} DB에 토큰 없음`);
      continue;
    }

    if (userTokenData.token) {
      // 구버전 구조 (기기 구분 없음)
      if (type.isEnabled(userTokenData)) {
        messages.push(buildMessage(userTokenData.token, name, userKey, null));
      }
    } else {
      let found = false;
      Object.entries(userTokenData).forEach(([deviceId, deviceData]) => {
        if (type.isEnabled(deviceData)) {
          messages.push(buildMessage(deviceData.token, name, userKey, deviceId));
          found = true;
        }
      });
      if (!found) {
        console.log(`[스킵][${type.label}] ${name} 해당 알림이 활성화된 토큰 없음`);
      }
    }
  }

  return messages;
}

async function main() {
  const tokenSnap = await db.ref('push_tokens').once('value');
  const tokens = tokenSnap.val() || {};

  const monthCache = {};
  const messages = [];

  for (const type of NOTIFY_TYPES) {
    messages.push(...await collectMessages(type, tokens, monthCache));
  }

  if (messages.length === 0) {
    console.log("발송할 유효한 대상 토큰이 없습니다.");
    process.exit(0);
  }

  console.log(`총 ${messages.length}건의 푸시 알림 발송을 시도합니다...`);

  const fcmPayloads = messages.map(({ userName, userKey, deviceId, ...payload }) => payload);
  const response = await admin.messaging().sendEach(fcmPayloads);

  console.log(`발송 결과 - 성공: ${response.successCount}건, 실패: ${response.failureCount}건`);

  if (response.failureCount > 0) {
    const cleanupPaths = new Set();

    response.responses.forEach((resp, i) => {
      if (resp.success) return;
      const errCode = resp.error?.code;
      const t = messages[i];
      console.error(`[발송 실패] ${t.userName} (${errCode}):`, resp.error?.message);

      if (INVALID_TOKEN_ERROR_CODES.includes(errCode)) {
        cleanupPaths.add(t.deviceId
          ? `push_tokens/${t.userKey}/${t.deviceId}`
          : `push_tokens/${t.userKey}`);
      }
    });

    if (cleanupPaths.size > 0) {
      await Promise.all([...cleanupPaths].map(p => db.ref(p).remove()));
      console.log(`[토큰 정리 완료] 유효하지 않은 토큰 노드 ${cleanupPaths.size}개 삭제`);
    }
  }

  process.exit(0);
}

main().catch(err => {
  console.error("실행 중 오류 발생:", err);
  process.exit(1);
});