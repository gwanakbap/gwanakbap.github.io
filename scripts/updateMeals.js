import { writeFile } from 'fs/promises';
import path from 'path';

const CSV_URL =
  'https://docs.google.com/spreadsheets/d/1uoBMtTAW-EFEKtK6Zw--_sAojGop0Eco5JCijkVs5ks/export?format=csv&gid=0';

const OUTPUT_PATH = path.resolve('data/meals.json');

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

  const header = data[0].map(clean);

  const colorRow = data[data.length - 2].map(clean);
  const teamRow = data[data.length - 1].map(clean);

  const teamColor = {};

  for (let i = 1; i < colorRow.length; i++) {
    const color = clean(colorRow[i]);
    const team = Number(clean(teamRow[i]));

    if (color && !isNaN(team)) {
      teamColor[color] = team;
    }
  }

  const getItems = (col, start, end) => {
    const items = [];
    for (let r = start; r <= end; r++) {
      const v = clean(data[r]?.[col]);
      if (v) items.push(v);
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
          teamNumber: getTeam(6, col),
          items: getItems(col, 1, 5)
        },
        afternoon: {
          teamNumber: getTeam(12, col),
          items: getItems(col, 7, 11)
        },
        evening: {
          teamNumber: getTeam(18, col),
          items: getItems(col, 13, 17)
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

/* ================= 실행 ================= */
(async () => {
  try {
    const data = await loadMealData();
    const json = JSON.stringify(data, null, 2);

    await writeFile(OUTPUT_PATH, json, 'utf-8');
    console.log('✅ meals.json 생성 완료');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();