class AppController {
  constructor(rootId) {
    this.rootId = rootId;
    this.root = document.getElementById(rootId);
    this.currentMode = '2d'; // '2d' 또는 'conveyor'
    this.activeRenderer = null;

    this.startDistance = 0;
    this.isPinching = false;

    this.initGlobalEvents();
  }

  async start() {
    this.root.innerHTML = '';
    if (this.currentMode === '2d') {
      this.activeRenderer = new Infinite2DRenderer(this.rootId, this);
    } else {
      this.activeRenderer = new InfiniteConveyorRenderer(this.rootId, this);
    }
    await this.activeRenderer.init();
  }

  // [기능 확장] 전환 시 타겟 좌표(dIdx, mIdx)를 받아 동기화할 수 있도록 지원
  async switchMode(targetMode, targetDayIdx = null, targetMealIdx = null) {
    if (this.currentMode === targetMode) return;
    this.currentMode = targetMode;
    
    // 클릭된 위치가 있다면 글로벌 인덱스 갱신
    if (targetDayIdx !== null) currentDayIdx = targetDayIdx;
    if (targetMealIdx !== null) currentMealIdx = targetMealIdx;

    this.root.style.opacity = '0';
    this.root.style.transition = 'opacity 0.2s ease';

    setTimeout(async () => {
      this.activeRenderer.destroy?.();
      await this.start();
      this.root.style.opacity = '1';
    }, 200);
  }

  initGlobalEvents() {
    const getDistance = (t1, t2) => {
      const dx = t1.clientX - t2.clientX;
      const dy = t1.clientY - t2.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    window.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        this.isPinching = true;
        this.startDistance = getDistance(e.touches[0], e.touches[1]);
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (!this.isPinching || e.touches.length !== 2) return;

      const currentDistance = getDistance(e.touches[0], e.touches[1]);
      const diff = currentDistance - this.startDistance;

      if (Math.abs(diff) > 60) {
        if (diff < 0 && this.currentMode === '2d') {
          this.isPinching = false; 
          this.switchMode('conveyor');
        } else if (diff > 0 && this.currentMode === 'conveyor') {
          this.isPinching = false;
          this.switchMode('2d');
        }
      }
    }, { passive: true });

    window.addEventListener('touchend', () => {
      this.isPinching = false;
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === '-' || e.key === '_') {
        this.switchMode('conveyor');
      } else if (e.key === '=' || e.key === '+') {
        this.switchMode('2d');
      }
    });
  }
}

/**
 * 1. Infinite2DRenderer (2D 무한 스크롤)
 */
class Infinite2DRenderer {
  constructor(rootId, controller) {
    this.root = document.getElementById(rootId);
    this.controller = controller;
    
    this.root.style.touchAction = 'none';
    this.root.style.overflow = 'hidden';

    this.colorValueMap = { 빨강: '#FFD6D6', 노랑: '#FFF3B0', 파랑: '#CDE7FF', 초록: '#D6FFD6' };
    this.teamColorMap = {};
    this.mealLabelMap = { morning: '☀️ 조식', afternoon: '🍚 중식', evening: '🌙 석식' };
    this.slider = null;
    this.eventListeners = [];
  }

  async init() {
    try {
      const res = await fetch('data/meals.json', { cache: 'no-store' });
      const data = await res.json();

      const today = new Date();
      const nowInfo = this.getYearWeek(today);
      const generatedDate = new Date(data.meta.generatedAt);
      const generatedInfo = this.getYearWeek(generatedDate);

      if (nowInfo.year !== generatedInfo.year || nowInfo.week !== generatedInfo.week) {
        this.renderComingSoon();
        return;
      }

      this.buildTeamColorMap(data.meta.teamColor);
      this.renderInfiniteGrid(data.days);
      
      // 최초 실행(App 시작 시)에만 시간 기준 초기화, 이후엔 컨트롤러에 저장된 값 유지
      if (isFirstLoad) {
        this.setInitialPosition();
        isFirstLoad = false;
      } else {
        this.updateSizes();
      }

      this.addListener(window, 'resize', () => this.updateSizes());
      this.initEvents();

    } catch (err) {
      console.error('데이터 로드 실패:', err);
      this.renderComingSoon();
    }
  }

  addListener(target, type, listener, options) {
    target.addEventListener(type, listener, options);
    this.eventListeners.push({ target, type, listener, options });
  }

  destroy() {
    this.eventListeners.forEach(({ target, type, listener, options }) => {
      target.removeEventListener(type, listener, options);
    });
    this.eventListeners = [];
  }

  getYearWeek(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return { year: d.getUTCFullYear(), week: week };
  }

  buildTeamColorMap(meta) {
    Object.entries(meta).forEach(([color, team]) => {
      this.teamColorMap[team] = this.colorValueMap[color];
    });
    this.teamColorMap[4] = this.colorValueMap["초록"];
  }

  toCircle(n) { return ['①','②','③'][n-1] || ""; }

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
      col.append(
        this.createSection('evening', day.label, evening),
        this.createSection('morning', day.label, morning),
        this.createSection('afternoon', day.label, afternoon),
        this.createSection('evening', day.label, evening),
        this.createSection('morning', day.label, morning)
      );
      return col;
    };

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
    currentDayIdx = dayNum === 0 ? 7 : dayNum;

    const h = d.getHours();
    if (h < 9) currentMealIdx = 1;
    else if (h < 14) currentMealIdx = 2;
    else currentMealIdx = 3;

    moveTo(currentDayIdx, currentMealIdx, false);
  }

  updateSizes() {
    moveTo(currentDayIdx, currentMealIdx, false);
  }

  initEvents() {
    this.addListener(window, 'wheel', e => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        if (Math.abs(e.deltaX) > 20) handleMove('x', e.deltaX > 0 ? 1 : -1);
      } else {
        if (Math.abs(e.deltaY) > 20) handleMove('y', e.deltaY > 0 ? 1 : -1);
      }
    }, { passive: true });

    let isMouseDown = false;
    let startX, startY;

    this.addListener(window, 'mousedown', e => {
      isMouseDown = true;
      startX = e.clientX;
      startY = e.clientY;
    }, { passive: true });

    this.addListener(window, 'mouseup', e => {
      if (!isMouseDown) return;
      isMouseDown = false;
      const dx = startX - e.clientX;
      const dy = startY - e.clientY;
      const threshold = 50;

      if (Math.abs(dx) > Math.abs(dy)) {
        if (Math.abs(dx) > threshold) handleMove('x', dx > 0 ? 1 : -1);
      } else {
        if (Math.abs(dy) > threshold) handleMove('y', dy > 0 ? 1 : -1);
      }
    }, { passive: true });

    let tsX, tsY;
    this.addListener(window, 'touchstart', e => {
      if (e.touches.length > 1) return;
      tsX = e.touches[0].clientX;
      tsY = e.touches[0].clientY;
    }, { passive: true });

    this.addListener(window, 'touchend', e => {
      if (e.touches.length > 0) return;
      const dx = tsX - e.changedTouches[0].clientX;
      const dy = tsY - e.changedTouches[0].clientY;
      const threshold = 40;

      if (Math.abs(dx) > Math.abs(dy)) {
        if (Math.abs(dx) > threshold) handleMove('x', dx > 0 ? 1 : -1);
      } else {
        if (Math.abs(dy) > threshold) handleMove('y', dy > 0 ? 1 : -1);
      }
    }, { passive: true });
  }

  renderComingSoon() {
    this.root.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.style.cssText = `display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh; font-size:24px; font-weight:bold; background:${this.colorValueMap['초록']};`;
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

/**
 * 2. InfiniteConveyorRenderer (연속 관성 무한 가로 스크롤 카드 뷰)
 */
class InfiniteConveyorRenderer {
  constructor(rootId, controller) {
    this.root = document.getElementById(rootId);
    this.controller = controller;
    this.root.style.touchAction = 'none';

    this.colorValueMap = { 빨강: '#FFD6D6', 노랑: '#FFF3B0', 파랑: '#CDE7FF', 초록: '#D6FFD6' };
    this.teamColorMap = {};
    this.mealLabelMap = { morning: '☀️ 조식', afternoon: '🍚 중식', evening: '🌙 석식' };

    this.posX = 0;
    this.vx = 0;
    this.isDragging = false;
    this.startX = 0;
    this.dragStartX = 0;
    this.railWidth = 0;
    this.itemWidth = 0;
    this.slider = null;
    
    this.daysData = [];
    this.animationId = null;
    this.eventListeners = [];

    // 드래그 판단용 임계값 변수
    this.totalDragDist = 0;
    this.startTouchX = 0;
    this.startTouchY = 0;
  }

  async init() {
    try {
      const res = await fetch('data/meals.json', { cache: 'no-store' });
      const data = await res.json();

      this.daysData = data.days;
      this.buildTeamColorMap(data.meta.teamColor);
      
      this.renderConveyor();
      this.initEngine();
      this.setInitialScrollPosition();

    } catch (err) {
      console.error('데이터 로드 실패:', err);
      this.renderComingSoon();
    }
  }

  addListener(target, type, listener, options) {
    target.addEventListener(type, listener, options);
    this.eventListeners.push({ target, type, listener, options });
  }

  destroy() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.eventListeners.forEach(({ target, type, listener, options }) => {
      target.removeEventListener(type, listener, options);
    });
    this.eventListeners = [];
  }

  buildTeamColorMap(meta) {
    Object.entries(meta).forEach(([color, team]) => {
      this.teamColorMap[team] = this.colorValueMap[color];
    });
    this.teamColorMap[4] = this.colorValueMap["초록"];
  }

  toCircle(n) { return ['①','②','③'][n-1] || ""; }

  createMealCard(type, label, meal, dayIndex, mealIndex) {
    const s = document.createElement('section');
    s.className = `meal-section ${type}`;
    s.style.backgroundColor = this.teamColorMap[meal.teamNumber] || '#ffffff';
    
    s.setAttribute('data-day-idx', dayIndex);
    s.setAttribute('data-meal-idx', mealIndex);

    s.innerHTML = `
      <div class="menu-content" style="pointer-events: none;">
        <h1 style="display: none;">${label}</h1>
        <h2 class="meal-type">${this.mealLabelMap[type]}</h2>
        <ul>${meal.items.map(i => `<li>${i}</li>`).join('')}</ul>
        <div class="team-number">${this.toCircle(meal.teamNumber)}</div>
      </div>
    `;
    return s;
  }

  renderConveyor() {
    this.root.innerHTML = '';
    
    const slider = document.createElement('div');
    slider.className = 'slider-2d conveyor-mode';
    this.slider = slider;

    const createColumn = (day, dIdx) => {
      const col = document.createElement('div');
      col.className = 'day-column';

      const header = document.createElement('div');
      header.className = 'column-header-day';
      header.textContent = day.label;

      col.append(
        header,
        this.createMealCard('morning', day.label, day.meals.morning, dIdx, 1),
        this.createMealCard('afternoon', day.label, day.meals.afternoon, dIdx, 2),
        this.createMealCard('evening', day.label, day.meals.evening, dIdx, 3)
      );
      return col;
    };

    // 💡 [수정] 5번 반복 생성하던 노드를 단 1 세트(월~일)만 생성하도록 변경!
    const nodes = this.daysData.map((day, i) => createColumn(day, i + 1));
    slider.append(...nodes);

    this.root.append(slider);

    this.updateDimensions();
    this.addListener(window, 'resize', () => this.updateDimensions());
  }

  updateDimensions() {
    if(!this.slider || this.slider.children.length === 0) return;
    const firstChild = this.slider.children[0];
    this.itemWidth = firstChild.getBoundingClientRect().width + 30; // 마진 포함 기둥 폭
    this.railWidth = this.itemWidth * this.daysData.length;
  }

  setInitialScrollPosition() {
    const todayOffset = (currentDayIdx - 1) * this.itemWidth;
    const centerPadding = (window.innerWidth - this.itemWidth) / 2;
    
    // 💡 [수정] 1세트 기준 현재 요일 카드가 중앙에 오도록 초기 좌표 설정
    this.posX = -(todayOffset - centerPadding);

    const totalWidth = this.slider ? this.slider.scrollWidth : this.railWidth;
    
    // 경계 초과 방지 안전장치
    const maxScroll = 0;
    const minScroll = Math.min(0, window.innerWidth - totalWidth);

    this.posX = Math.max(minScroll, Math.min(maxScroll, this.posX));
    this.slider.style.transform = `translateX(${this.posX}px)`;
  }

  initEngine() {
    const update = () => {
      if (!this.isDragging) {
        this.vx *= 0.92; // 감속
        this.posX += this.vx;
        if (Math.abs(this.vx) < 0.1) this.vx = 0;
      } else {
        this.vx = this.posX - this.prevX;
        this.prevX = this.posX;
      }

      // 💡 [핵심] 렌더링된 slider.scrollWidth를 실시간 기준값으로 사용
      const maxScroll = 0; 
      const totalWidth = this.slider ? this.slider.scrollWidth : this.railWidth;
      const minScroll = Math.min(0, window.innerWidth - totalWidth);

      if (this.posX > maxScroll) {
        this.posX = maxScroll;
        this.vx = 0;
      } else if (this.posX < minScroll) {
        this.posX = minScroll;
        this.vx = 0;
      }

      if(this.slider) {
        this.slider.style.transform = `translateX(${this.posX}px)`;
      }

      this.animationId = requestAnimationFrame(update);
    };

    this.animationId = requestAnimationFrame(update);
    this.initEvents();
  }

  initEvents() {
    const getX = e => e.touches ? e.touches[0].clientX : e.clientX;
    const getY = e => e.touches ? e.touches[0].clientY : e.clientY;

    const onStart = e => {
      if (e.touches && e.touches.length > 1) return;
      this.isDragging = true;
      this.startX = getX(e);
      this.dragStartX = this.posX;
      this.prevX = this.posX;
      this.vx = 0;

      this.startTouchX = getX(e);
      this.startTouchY = getY(e);
      this.totalDragDist = 0;
    };

    const onMove = e => {
      if (!this.isDragging) return;
      const currentX = getX(e);
      const currentY = getY(e);
      
      const diffX = currentX - this.startX;
      this.posX = this.dragStartX + diffX;

      this.totalDragDist += Math.abs(currentX - this.startTouchX) + Math.abs(currentY - this.startTouchY);
    };

    const onEnd = () => {
      this.isDragging = false;
    };

    const onClickCard = (e) => {
      if (this.totalDragDist > 10) return; 

      const card = e.target.closest('.meal-section');
      if (!card) return;

      const dayIdx = parseInt(card.getAttribute('data-day-idx'), 10);
      const mealIdx = parseInt(card.getAttribute('data-meal-idx'), 10);

      if (!isNaN(dayIdx) && !isNaN(mealIdx)) {
        this.controller.switchMode('2d', dayIdx, mealIdx);
      }
    };

    this.addListener(window, 'mousedown', onStart);
    this.addListener(window, 'mousemove', onMove);
    this.addListener(window, 'mouseup', onEnd);
    this.addListener(this.root, 'click', onClickCard);

    this.addListener(window, 'touchstart', onStart, { passive: true });
    this.addListener(window, 'touchmove', onMove, { passive: true });
    this.addListener(window, 'touchend', onEnd, { passive: true });

    this.addListener(window, 'wheel', e => {
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      this.vx -= delta * 0.15;
    }, { passive: true });
  }

  renderComingSoon() {
    this.root.innerHTML = `<div style="text-align:center; padding:50px;">식사 데이터를 불러올 수 없습니다.</div>`;
  }
}

/* ---------------- 2D 렌더러용 글로벌 변수 & 함수 ---------------- */
let currentDayIdx = 1; 
let currentMealIdx = 1; 
let isAnimating = false;
let isFirstLoad = true; // 최초 진입 판단 플래그
const ANIM_TIME = 500;

function moveTo(dIdx, mIdx, animate = true) {
  const slider = document.querySelector('.slider-2d:not(.conveyor-mode)');
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

/* ---------------- 초기 실행부 ---------------- */
window.addEventListener('load', () => {
  const app = new AppController('today-menu');
  app.start();
});