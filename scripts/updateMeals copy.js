import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set } from 'firebase/database';

const CSV_URL =
  'https://docs.google.com/spreadsheets/d/1uoBMtTAW-EFEKtK6Zw--_sAojGop0Eco5JCijkVs5ks/export?format=csv&gid=0';

// Firebase 설정
const firebaseConfig = {
  apiKey: "AIzaSyDvEGZcUtz8PIyOLg9M_v71dL7aQG1ntwk",
  authDomain: "gwanak-on.firebaseapp.com",
  databaseURL: "https://gwanak-on-default-rtdb.firebaseio.com",
  projectId: "gwanak-on",
  storageBucket: "gwanak-on.firebasestorage.app",
  messagingSenderId: "101226390647",
  appId: "1:101226390647:web:67c72a62b3079c16e4d272",
  measurementId: "G-EQ5GV6GB99"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

async function loadMealData() {
  const res = await fetch(CSV_URL);
  if (!res.ok) throw new Error('CSV fetch 실패');

  const csvText = await res.text();
  const rows = parseCSV(csvText);

  return transformMenu(rows);
}

/* ================= CSV ================= */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && next === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
    } else if (char === '\n' && !inQuotes) {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);

  return rows;
}

/* ================= 핵심 변환 ================= */
function transformMenu(data) {
  const clean = (v) => (v || '').replace(/\r/g, '').trim();

  const header = data[1].map(clean);

  // 💡 [동적 탐색] 하드코딩 대신 '빨강', '노랑', '파랑'이 포함된 행을 찾아 팀 컬러 매핑 동적 생성 (기본값 제거)
  const teamColor = {};
  data.forEach((row, rowIndex) => {
    const cleanedRow = row.map(clean);
    if (cleanedRow.includes('빨강') || cleanedRow.includes('노랑') || cleanedRow.includes('파랑')) {
      const teamRow = (data[rowIndex + 1] || []).map(clean);
      
      cleanedRow.forEach((colVal, colIdx) => {
        if (['빨강', '노랑', '파랑', '초록'].includes(colVal)) {
          const teamNum = Number(teamRow[colIdx]);
          if (!isNaN(teamNum) && teamNum > 0) {
            teamColor[colVal] = teamNum;
          }
        }
      });
    }
  });

  const getItems = (col, start, end) => {
    const items = [];
    for (let r = start; r <= end; r++) {
      const v = clean(data[r]?.[col]);
      if (v) {
        const lines = v.split('\n')
                       .map(item => item.trim())
                       .filter(item => item !== '');
        
        items.push(...lines);
      }
    }
    return items;
  };

  const getTeam = (rowIndex, col) => {
    const v = clean(data[rowIndex]?.[col]);
    return v ? Number(v) : null;
  };

  const days = [];

  for (let col = 1; col < header.length; col++) {
    const label = clean(header[col]);
    if (!label) continue;

    days.push({
      label,
      meals: {
        morning: {
          teamNumber: getTeam(7, col),       // 조식 팀 번호 행
          items: getItems(col, 2, 6)         // 조식 메뉴 행 범위
        },
        afternoon: {
          teamNumber: getTeam(13, col),      // 중식 팀 번호 행
          items: getItems(col, 8, 12)        // 중식 메뉴 행 범위
        },
        evening: {
          teamNumber: getTeam(19, col),      // 석식 팀 번호 행
          items: getItems(col, 14, 18)       // 석식 메뉴 행 범위
        }
      }
    });
  }

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      teamColor
    },
    days
  };
}

/* ================= 실행 (Firebase 전송) ================= */
(async () => {
  try {
    console.log('⏳ 식단 데이터 파싱 중...');
    const data = await loadMealData();

    console.log('⏳ Firebase Realtime Database (gwanakbap)에 저장 중...');
    await set(ref(db, 'gwanakbap'), data);

    console.log('✅ Firebase gwanakbap 경로에 식단 저장 완료');
    process.exit(0);
  } catch (err) {
    console.error('❌ 오류 발생:', err);
    process.exit(1);
  }
})();