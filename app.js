class TodayMenuRenderer {
  constructor(rootId) {
    this.root = document.getElementById(rootId);
    if (!this.root) throw new Error('today-menu root not found');

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
  }

  async init() {
    const res = await fetch('data/meals.json', { cache: 'no-store' });
    const data = await res.json();

    this.buildTeamColorMap(data.meta.teamColor);

    const today = new Date();
    const currentYear = today.getFullYear();
    const currentWeek = this.getWeekNumber(today);

    const generatedDate = new Date(data.meta.generatedAt);
    const generatedYear = generatedDate.getFullYear();
    const generatedWeek = this.getWeekNumber(generatedDate);

    if (generatedYear === currentYear && generatedWeek === currentWeek) {
      const weekdayIndex = (today.getDay() + 6) % 7;
      this.renderToday(data.days[weekdayIndex]);
    } else {
      this.renderComingSoon();
    }

    this.resizeSections();
    window.addEventListener('resize', () => this.resizeSections());
  }

  getWeekNumber(day) {
    day = new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()));
    const dayNum = day.getUTCDay() || 7;
    day.setUTCDate(day.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
    return Math.ceil((((day - yearStart) / 86400000) + 1) / 7);
  }

  buildTeamColorMap(meta) {
    Object.entries(meta).forEach(([color, team]) => {
      this.teamColorMap[team] = this.colorValueMap[color] || '#eee';
    });
  }

  renderToday(day) {
    this.root.innerHTML = '';
    const { morning, afternoon, evening } = day.meals;

    this.root.append(
      this.createSection('evening', day.label, evening, true),
      this.createSection('morning', day.label, morning),
      this.createSection('afternoon', day.label, afternoon),
      this.createSection('evening', day.label, evening),
      this.createSection('morning', day.label, morning, true)
    );
  }

  renderComingSoon() {
    this.root.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.style.cssText = `
      display:flex;
      flex-direction:column;
      justify-content:center;
      align-items:center;
      height:100svh;
      font-size:24px;
      font-weight:bold;
      background:${this.colorValueMap['초록']};
    `;

    const d = new Date();
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

    const h1 = document.createElement('h1');
    h1.textContent = `${dayNames[d.getDay()]}(${d.getMonth()+1}월${d.getDate()}일)`;

    const text = document.createElement('div');
    text.textContent = '준비중입니다';

    wrap.append(h1, text);
    this.root.append(wrap);
  }

  createSection(type, label, meal, clone = false) {
    const s = document.createElement('section');
    s.className = `${type}${clone ? ' clone' : ''}`;
    s.style.backgroundColor = this.teamColorMap[meal.teamNumber];
    s.innerHTML = `
      <h1>${label}</h1>
      <h2 class="meal-type">${this.mealLabelMap[type]}</h2>
      <ul>${meal.items.map(i => `<li>${i}</li>`).join('')}</ul>
      <div class="team-number">${this.toCircle(meal.teamNumber)}</div>
    `;
    return s;
  }

  toCircle(n) {
    return ['①', '②', '③'][n - 1] || n;
  }

  resizeSections() {
    const h = document.documentElement.clientHeight;
    document.querySelectorAll('#today-menu section')
      .forEach(s => s.style.height = h + 'px');
    moveTo(index, false);
  }
}

function getSections() {
  return document.querySelectorAll('#today-menu section');
}

function moveTo(i, smooth = true) {
  const h = document.documentElement.clientHeight;
  document.documentElement.style.scrollBehavior = smooth ? 'smooth' : 'auto';
  window.scrollTo(0, i * h);
}

function getStartIndexByTime() {
  const h = new Date().getHours();
  if (h < 9) return 1;
  if (h < 13) return 2;
  return 3;
}

let index = 1;
let isScrolling = false;
let isJumping = false;

const SCROLL_DELAY = 500;
const DELTA_THRESHOLD = 40;

window.addEventListener('wheel', e => {
  e.preventDefault();
  handleScroll(e.deltaY);
}, { passive: false });

let touchStartY = 0;

window.addEventListener('touchstart', e => {
  touchStartY = e.touches[0].clientY;
}, { passive: true });

window.addEventListener('touchmove', e => {
  e.preventDefault();
}, { passive: false });

window.addEventListener('touchend', e => {
  handleScroll(touchStartY - e.changedTouches[0].clientY);
});

['gesturestart','gesturechange','gestureend']
  .forEach(ev => window.addEventListener(ev, e => e.preventDefault()));

function handleScroll(deltaY) {
  if (isScrolling || isJumping || Math.abs(deltaY) < DELTA_THRESHOLD) return;

  const last = getSections().length - 1;
  isScrolling = true;

  if (deltaY > 0) {
    index++;
    moveTo(index);
    if (index === last) {
      isJumping = true;
      setTimeout(() => {
        index = 1;
        moveTo(index, false);
        isJumping = false;
      }, SCROLL_DELAY);
    }
  } else {
    index--;
    moveTo(index);
    if (index === 0) {
      isJumping = true;
      setTimeout(() => {
        index = last - 1;
        moveTo(index, false);
        isJumping = false;
      }, SCROLL_DELAY);
    }
  }

  setTimeout(() => isScrolling = false, SCROLL_DELAY);
}

async function checkAppVersion() {
  try {
    const res = await fetch('data/version.json', { cache: 'no-store' });
    const { version } = await res.json();
    const old = localStorage.getItem('appVersion');

    if (old !== version) {
      localStorage.setItem('appVersion', version);
      navigator.serviceWorker?.controller?.postMessage({ action: 'skipWaiting' });
      setTimeout(() => location.reload(), 1500);
    }
  } catch (e) {
    console.error(e);
  }
}

window.addEventListener('load', async () => {
  const renderer = new TodayMenuRenderer('today-menu');
  await renderer.init();

  index = getStartIndexByTime();
  moveTo(index, false);

  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('./sw.js'); }
    catch (e) { console.error(e); }
  }

  checkAppVersion();
});

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible') {
    const renderer = new TodayMenuRenderer('today-menu');
    await renderer.init();
    moveTo(index, false);
    checkAppVersion();
  }
});
