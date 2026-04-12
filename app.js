/**
 * Infinite2DRenderer - 가로(요일) 및 세로(시간) 2D 무한 스크롤 식단표
 * 마우스 드래그, 터치 스와이프, 휠 제어 통합 버전
 */
class Infinite2DRenderer {
  constructor(rootId) {
    this.root = document.getElementById(rootId);
    if (!this.root) throw new Error('today-menu root not found');

    // 브라우저 기본 제스처 방지 및 레이아웃 고정
    this.root.style.touchAction = 'none';
    this.root.style.overflow = 'hidden';

    this.colorValueMap = {
      빨강: '#FFD6D6',
      노랑: '#FFF3B0',
      파랑: '#CDE7FF',
      초록: '#D6FFD6'
    };

    this.teamColorMap = {};
    this.mealLabelMap = {
      morning: '☀️ 조식',
      afternoon: '🍚 중식',
      evening: '🌙 석식'
    };

    this.slider = null;
  }

  async init() {
    try {
      const res = await fetch('data/meals.json', { cache: 'no-store' });
      const data = await res.json();
      // const data = await this.loadMealData();

      // ✅ 날짜 확인 로직만 추가
      const today = new Date();
      const nowInfo = this.getYearWeek(today);

      const generatedDate = new Date(data.meta.generatedAt);
      const generatedInfo = this.getYearWeek(generatedDate);

      if (
        nowInfo.year !== generatedInfo.year ||
        nowInfo.week !== generatedInfo.week
      ) {
        this.renderComingSoon();
        return;
      }

      // ✅ 여기 아래는 기존 2D 코드 그대로 유지
      this.buildTeamColorMap(data.meta.teamColor);
      this.renderInfiniteGrid(data.days);
      this.setInitialPosition();

      window.addEventListener('resize', () => this.updateSizes());

    } catch (err) {
      console.error('데이터 로드 실패:', err);
      this.renderComingSoon();
    }
  }

  async loadMealData() {
    const url =
      'https://docs.google.com/spreadsheets/d/1uoBMtTAW-EFEKtK6Zw--_sAojGop0Eco5JCijkVs5ks/export?format=csv&gid=0';

    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('CSV fetch 실패');

    const csvText = await res.text();
    const rows = this.parseCSV(csvText);

    return this.transformMenu(rows);
  }

  parseCSV(text) {
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

  // ✅ 핵심 수정: teamColor 숫자 정리
  transformMenu(data) {
    const clean = (v) => (v || "").replace(/\r/g, "").trim();

    const header = data[0].map(clean);

    // =============================
    // 팀 컬러 / 팀 번호 매핑
    // =============================
    const colorRow = data[data.length - 2].map(clean); // ["", "빨강", "노랑", ...]
    const teamRow  = data[data.length - 1].map(clean); // ["팀", "1", "2", ...]

    const teamColor = {};

    for (let i = 1; i < colorRow.length; i++) {
      const color = clean(colorRow[i]);
      const team  = Number(clean(teamRow[i]));

      if (color && !isNaN(team)) {
        teamColor[color] = team;
      }
    }

    // =============================
    // 공통 유틸
    // =============================
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

    // =============================
    // days 생성
    // =============================
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

    // =============================
    // 최종 리턴
    // =============================
    return {
      meta: {
        generatedAt: new Date().toISOString(),
        teamColor
      },
      days
    };
  }

  /* ================= ISO WEEK ================= */

  getYearWeek(date) {
    const d = new Date(Date.UTC(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    ));

    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);

    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);

    return {
      year: d.getUTCFullYear(),
      week: week
    };
  }

  buildTeamColorMap(meta) {
    Object.entries(meta).forEach(([color, team]) => {
      this.teamColorMap[team] = this.colorValueMap[color];
    });
    this.teamColorMap[4] = this.colorValueMap["초록"];
  }

  toCircle(n) {
    return ['①','②','③'][n-1] || "";
  }

  createSection(type, label, meal) {
    const s = document.createElement('section');
    s.className = `meal-section ${type}`;
    s.style.backgroundColor = this.teamColorMap[meal.teamNumber];
    
    s.innerHTML = `
      <div class="menu-content">
        <h1>${label}</h1>
        <h2 class="meal-type">${this.mealLabelMap[type]}</h2>
        <ul>${meal.items.map(i => `<li>${i}</li>`).join('')}</ul>
        <div class="team-number">${this.toCircle(meal.teamNumber)}</div>
      </div>
    `;
    return s;
  }

  renderInfiniteGrid(days) {
    this.root.innerHTML = '';
    const slider = document.createElement('div');
    slider.className = 'slider-2d';
    slider.style.display = 'flex';
    this.slider = slider;

    const createDayColumn = (day) => {
      const col = document.createElement('div');
      col.className = 'day-column';
      col.style.cssText = `display:flex; flex-direction:column; width:100vw; flex-shrink:0;`;

      const { morning, afternoon, evening } = day.meals;
      // 세로 무한 루프 구조: [석식클론, 조식, 중식, 석식, 조식클론]
      col.append(
        this.createSection('evening', day.label, evening),
        this.createSection('morning', day.label, morning),
        this.createSection('afternoon', day.label, afternoon),
        this.createSection('evening', day.label, evening),
        this.createSection('morning', day.label, morning)
      );
      return col;
    };

    // 가로 무한 루프 구조: [마지막날클론, 1~7일, 첫날클론]
    const firstDayClone = createDayColumn(days[0]);
    const lastDayClone = createDayColumn(days[days.length - 1]);

    slider.append(lastDayClone); 
    days.forEach(day => slider.append(createDayColumn(day)));
    slider.append(firstDayClone);

    this.root.append(slider);
  }

  setInitialPosition() {
    const d = new Date();
    const dayNum = d.getDay(); 
    currentDayIdx = dayNum === 0 ? 7 : dayNum; // 일요일 보정

    const h = d.getHours();
    if (h < 9) currentMealIdx = 1;
    else if (h < 14) currentMealIdx = 2;
    else currentMealIdx = 3;

    moveTo(currentDayIdx, currentMealIdx, false);
  }

  updateSizes() {
    moveTo(currentDayIdx, currentMealIdx, false);
  }

  renderComingSoon() {
    this.root.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.style.cssText = `
      display:flex;
      flex-direction:column;
      justify-content:center;
      align-items:center;
      height:100vh;
      font-size:24px;
      font-weight:bold;
      background:${this.colorValueMap['초록']};
    `;
    const d = new Date();
    const dayNames = ['일','월','화','수','목','금','토'];
    const h1 = document.createElement('h1');
    h1.textContent = `${dayNames[d.getDay()]}(${d.getMonth()+1}월${d.getDate()}일)`;
    const text = document.createElement('div');
    text.textContent = '식단을 준비중입니다';
    wrap.append(h1, text);
    this.root.append(wrap);
  }
}

/* ---------------- 제어 로직 ---------------- */
let currentDayIdx = 1;  
let currentMealIdx = 1; 
let isAnimating = false;
const ANIM_TIME = 500; 

function moveTo(dIdx, mIdx, animate = true) {
  const slider = document.querySelector('.slider-2d');
  if (!slider) return;
  slider.style.transition = animate ? `transform ${ANIM_TIME}ms cubic-bezier(0.2, 0.8, 0.2, 1)` : 'none';
  slider.style.transform = `translate(-${dIdx * 100}vw, -${mIdx * 100}vh)`;
}

function handleMove(axis, dir) {
  if (isAnimating) return;
  isAnimating = true;

  if (axis === 'x') {
    currentDayIdx += dir;
    moveTo(currentDayIdx, currentMealIdx);
    
    if (currentDayIdx <= 0 || currentDayIdx >= 8) {
      setTimeout(() => {
        currentDayIdx = currentDayIdx <= 0 ? 7 : 1;
        moveTo(currentDayIdx, currentMealIdx, false);
        isAnimating = false;
      }, ANIM_TIME);
      return;
    }
  } else {
    currentMealIdx += dir;
    moveTo(currentDayIdx, currentMealIdx);
    
    if (currentMealIdx <= 0 || currentMealIdx >= 4) {
      setTimeout(() => {
        currentMealIdx = currentMealIdx <= 0 ? 3 : 1;
        moveTo(currentDayIdx, currentMealIdx, false);
        isAnimating = false;
      }, ANIM_TIME);
      return;
    }
  }
  setTimeout(() => isAnimating = false, ANIM_TIME);
}

/* ---------------- 이벤트 리스너 ---------------- */

// 1. 휠/트랙패드 제어
window.addEventListener('wheel', e => {
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
    if (Math.abs(e.deltaX) > 20) handleMove('x', e.deltaX > 0 ? 1 : -1);
  } else {
    if (Math.abs(e.deltaY) > 20) handleMove('y', e.deltaY > 0 ? 1 : -1);
  }
}, { passive: true });

// 2. 마우스 드래그 제어
let isMouseDown = false;
let startX, startY;

window.addEventListener('mousedown', e => {
  isMouseDown = true;
  startX = e.clientX;
  startY = e.clientY;
}, { passive: true });

window.addEventListener('mouseup', e => {
  if (!isMouseDown) return;
  isMouseDown = false;

  const dx = startX - e.clientX;
  const dy = startY - e.clientY;
  const threshold = 50; // 최소 드래그 거리

  if (Math.abs(dx) > Math.abs(dy)) {
    if (Math.abs(dx) > threshold) handleMove('x', dx > 0 ? 1 : -1);
  } else {
    if (Math.abs(dy) > threshold) handleMove('y', dy > 0 ? 1 : -1);
  }
}, { passive: true });

// 3. 모바일 터치 제어
let tsX, tsY;
window.addEventListener('touchstart', e => {
  tsX = e.touches[0].clientX;
  tsY = e.touches[0].clientY;
}, { passive: true });

window.addEventListener('touchend', e => {
  const dx = tsX - e.changedTouches[0].clientX;
  const dy = tsY - e.changedTouches[0].clientY;
  const threshold = 40;

  if (Math.abs(dx) > Math.abs(dy)) {
    if (Math.abs(dx) > threshold) handleMove('x', dx > 0 ? 1 : -1);
  } else {
    if (Math.abs(dy) > threshold) handleMove('y', dy > 0 ? 1 : -1);
  }
});

let deferredPrompt;
const installBtn = document.getElementById('install-btn');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  
  if(deferredPrompt) installBtn.style.display = 'block';
});

installBtn.addEventListener('click', async () => {
  deferredPrompt.prompt();
  
  deferredPrompt = null;
  installBtn.style.display = 'none';
});

window.addEventListener('load', () => {
  const renderer = new Infinite2DRenderer('today-menu');
  renderer.init();
});