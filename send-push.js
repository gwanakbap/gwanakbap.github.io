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

async function main() {
  // 1. 한국 표준시(KST) 기준 '내일' 연/월/일 구하기 [수정]
  const kstDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  kstDate.setDate(kstDate.getDate() + 1); // 👈 오늘 날짜에 +1일 추가

  const year = kstDate.getFullYear();
  const month = String(kstDate.getMonth() + 1).padStart(2, '0');
  const day = kstDate.getDate();

  console.log(`[알림 스케줄러 시작] 대상 날짜(내일 KST): ${year}-${month}-${day}`);

  // 2. DB에서 당직 데이터 및 토큰 조회
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

  // 3. 내일 날짜 당직 데이터 필터링
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

  // 4. 내일 근무자 이름 및 근무 유형 추출
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

  // 5. 알림 수신을 허용한(enabled === true) 대상자만 메시지 구성
  const messages = [];

  for (const target of targets) {
    const userTokenData = tokens[target.name];

    // 수신 동의(enabled: true) 여부 체크
    if (userTokenData && userTokenData.enabled === true && userTokenData.token) {
      messages.push({
        token: userTokenData.token,
        notification: {
          title: '[당직 안내]', // 👈 문구 수정
          body: `${target.name}님, 내일은 당직 근무일입니다. 근무 시간을 확인해 주세요.` // 👈 문구 수정
        },
        webpush: {
          notification: {
            icon: './gwanakonIcon.png' // 👈 서버에서 알림 아이콘 지정
          },
          fcmOptions: {
            link: "./"
          }
        }
      });
    } else {
      console.log(`[스킵] ${target.name} - 토큰 없음 또는 알림 비활성화 상태`);
    }
  }

  if (messages.length === 0) {
    console.log("발송할 유효한 대상 토큰이 없습니다.");
    process.exit(0);
  }

  // 6. FCM 메시지 일괄 발송
  console.log(`총 ${messages.length}건의 푸시 알림 발송을 시도합니다...`);
  const response = await admin.messaging().sendEach(messages);
  console.log(`발송 결과 - 성공: ${response.successCount}건, 실패: ${response.failureCount}건`);

  process.exit(0);
}

main().catch(err => {
  console.error("실행 중 오류 발생:", err);
  process.exit(1);
});