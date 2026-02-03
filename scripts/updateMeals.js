import { writeFile } from 'fs/promises';
import path from 'path';

const CSV_URL =
  'https://docs.google.com/spreadsheets/d/1uoBMtTAW-EFEKtK6Zw--_sAojGop0Eco5JCijkVs5ks/export?format=csv&gid=0';
const OUTPUT_PATH = path.resolve('public/meals.json');

async function loadMealData() {
  const res = await fetch(CSV_URL);
  if (!res.ok) throw new Error('CSV fetch 실패');

  const csvText = await res.text();
  const rows = parseCSV(csvText);
  const days = rows[0].slice(1).filter(Boolean);
  const rowMap = buildRowMap(rows);
  const teamColor = extractTeamColor(rows);
  const week = days.map((label, i) => ({
    label,
    meals: {
      morning: parseCell(rowMap['조식']?.[i + 1]),
      afternoon: parseCell(rowMap['중식']?.[i + 1]),
      evening: parseCell(rowMap['석식']?.[i + 1])
    }
  }));

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      teamColor
    },
    days: week
  };
}

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

function buildRowMap(rows) {
  const rowMap = {};

  for (const row of rows) {
    const key = row[0];
    if (!['조식', '중식', '석식'].includes(key)) continue;
    rowMap[key] = [null, ...row.slice(1)];
  }

  return rowMap;
}

function parseCell(cell) {
  if (!cell) return null;

  const lines = cell
    .split('\n')
    .map(v => v.trim())
    .filter(Boolean);

  return {
    teamNumber: Number(lines[0]),
    items: lines.slice(1)
  };
}

function extractTeamColor(rows) {
  let colorRow, teamRow;

  for (const row of rows) {
    if (row[0] === '' && row[1]) colorRow = row;
    if (row[0] === '팀') teamRow = row;
    if (colorRow && teamRow) break;
  }

  if (!colorRow || !teamRow) return {};

  const colors = colorRow.slice(1);
  const numbers = teamRow.slice(1);

  const mapping = {};
  colors.forEach((color, idx) => {
    if (color && numbers[idx]) {
      mapping[color] = Number(numbers[idx]);
    }
  });

  return mapping;
}

(async () => {
  try {
    const data = await loadMealData();
    const json = JSON.stringify(data, null, 2);

    console.log(json)
    await writeFile(OUTPUT_PATH, json, 'utf-8');
  } catch (err) {
    process.exit(1);
  }
})();