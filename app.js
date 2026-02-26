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

      this.buildTeamColorMap(data.meta.teamColor);
      this.renderInfiniteGrid(data.days);
      this.setInitialPosition();

      window.addEventListener('resize', () => this.updateSizes());
    } catch (err) {
      console.error('데이터 로드 실패:', err);
      this.renderComingSoon();
    }
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