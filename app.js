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
      morning: '조식',
      afternoon: '중식',
      evening: '석식'
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

    let dayData;

    if (generatedYear === currentYear && generatedWeek === currentWeek) {
      const weekdayIndex = (today.getDay() + 6) % 7;
      dayData = data.days[weekdayIndex];
      this.renderToday(dayData);
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

  buildTeamColorMap(teamColorMeta) {
    Object.entries(teamColorMeta).forEach(([colorName, teamNumber]) => {
      this.teamColorMap[teamNumber] = this.colorValueMap[colorName] || '#eee';
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
    const div = document.createElement('div');
    div.style.display = 'flex';
    div.style.flexDirection = 'column';
    div.style.justifyContent = 'center';
    div.style.alignItems = 'center';
    div.style.height = window.innerHeight + 'px';
    div.style.fontSize = '24px';
    div.style.fontWeight = 'bold';
    div.style.backgroundColor = this.colorValueMap['초록'];

    const today = new Date();
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const dayLabel = `${dayNames[today.getDay()]}(${today.getMonth() + 1}월${today.getDate()}일)`;

    const labelEl = document.createElement('h1');
    labelEl.textContent = dayLabel;

    const textEl = document.createElement('div');
    textEl.textContent = '준비중입니다';

    div.appendChild(labelEl);
    div.appendChild(textEl);

    this.root.appendChild(div);
  }

  createSection(type, label, meal, isClone = false) {
    const section = document.createElement('section');
    section.className = `${type}${isClone ? ' clone' : ''}`;
    section.style.backgroundColor = this.teamColorMap[meal.teamNumber];
    section.innerHTML = `
    <h1>${label}</h1>
    <h2 class="meal-type">${this.mealLabelMap[type]}</h2>
    <ul>${meal.items.map(i => `<li>${i}</li>`).join('')}</ul>
    <div class="team-number">${this.toCircle(meal.teamNumber)}</div>
    `;
    return section;
  }

  toCircle(num) {
    return ['①', '②', '③'][num - 1] || num;
  }

  resizeSections() {
    const sections = document.querySelectorAll('#today-menu section');
    const h = window.innerHeight;
    sections.forEach(s => s.style.height = h + 'px');
    this.sectionHeight = h;
    moveTo(index, false);
  }
}

function getSections() {
  return document.querySelectorAll('#today-menu section');
}

function moveTo(idx, smooth = true) {
  const sections = getSections();
  if (!sections.length) return;
  if (idx < 0) idx = 0;
  if (idx >= sections.length) idx = sections.length - 1;

  const y = idx * window.innerHeight;
  document.documentElement.style.scrollBehavior = smooth ? 'smooth' : 'auto';
  window.scrollTo(0, y);
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
const DELTA_THRESHOLD = 10;

function handleScroll(deltaY) {
  if (isScrolling || isJumping) return;

  if (Math.abs(deltaY) < DELTA_THRESHOLD) return;
  const sections = getSections();
  const lastIndex = sections.length - 1;

  isScrolling = true;
  if (deltaY > 0) {
    index++;
    moveTo(index);
    if (index === lastIndex) {
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
        index = lastIndex - 1;
        moveTo(index, false);
        isJumping = false;
      }, SCROLL_DELAY);
    }
  }

  setTimeout(() => isScrolling = false, SCROLL_DELAY);
}

window.addEventListener('wheel', e => {
  e.preventDefault();
  handleScroll(e.deltaY);
}, { passive: false });

let touchStartY = 0;
window.addEventListener('touchstart', e => touchStartY = e.touches[0].clientY, { passive: true });
window.addEventListener('touchend', e => {
  const touchEndY = e.changedTouches[0].clientY;
  handleScroll(touchStartY - touchEndY);
});

async function checkAppVersion() {
  try {
    const res = await fetch('data/version.json', { cache: 'no-store' });
    const { version } = await res.json();

    const old = localStorage.getItem('appVersion');
    if (old !== version) {
      localStorage.setItem('appVersion', version);
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ action: 'skipWaiting' });
      }
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