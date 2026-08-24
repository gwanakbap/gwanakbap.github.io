if ('serviceWorker' in navigator) {
  let swRegistration;

  // 1. 서비스 워커 등록 및 객체 저장
  navigator.serviceWorker.register('./sw.js').then(reg => {
    swRegistration = reg;
  });

  // 2. 백그라운드 -> 포그라운드 복귀 시 즉시 서버의 sw.js 업데이트 체크
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && swRegistration) {
      swRegistration.update();
    }
  });

  // 3. 새 서비스 워커가 제어권을 잡으면(controllerchange) 화면 즉시 새로고침
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
}

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, onValue, set, update, get, remove } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js";

const firebaseConfig = {
  apiKey: "AIzaSyDvEGZcUtz8PIyOLg9M_v71dL7aQG1ntwk",
  authDomain: "gwanak-on.firebaseapp.com",
  databaseURL: "https://gwanak-on-default-rtdb.firebaseio.com",
  projectId: "gwanak-on",
  storageBucket: "gwanak-on.firebasestorage.app",
  messagingSenderId: "101226390647",
  appId: "1:101226390647:web:67c72a62b3079c16e4d272"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const messaging = getMessaging(app);

// iOS Safari는 Notification API 자체가 없으므로 존재 여부를 먼저 확인
const notifSupported = typeof Notification !== 'undefined';

// Firebase RTDB 키 특수문자 변환 (. # $ [ ] /)
function sanitizeKey(key) {
  return (key || "").replace(/[.#$\[\]\/]/g, "_");
}

// 기기 고유 ID 생성 및 관리
function getOrCreateDeviceId() {
  let deviceId = localStorage.getItem('duty_device_id');
  if (!deviceId) {
    deviceId = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('duty_device_id', deviceId);
  }
  return deviceId;
}

let dutyData = [];
let currentUsername = localStorage.getItem('duty_app_username') || "";

const now = new Date();
const todayYear = now.getFullYear();
const todayMonth = now.getMonth() + 1;
const todayDay = now.getDate();
const weekDays = ['일', '월', '화', '수', '목', '금', '토'];

// 탭 조회를 위한 상태 관리 (0: 이번 달, 1: 다음 달)
let currentViewOffset = 0; 
let currentDbUnsubscribe = null;
let lastRawDataJson = "";

let targetYear = todayYear;
let targetMonth = todayMonth;
let selectedDay = todayDay;

const track = document.getElementById('track');
const viewport = document.getElementById('viewport');
const navItems = document.querySelectorAll('.nav-item');
const usernameInput = document.getElementById('username-input');
const btnSaveUsername = document.getElementById('btn-save-username');
const notificationToggle = document.getElementById('notification-toggle');

// 탭 스위치 버튼 엘리먼트
const btnThisMonth = document.getElementById('btn-this-month');
const btnNextMonth = document.getElementById('btn-next-month');

if (usernameInput) usernameInput.value = currentUsername;

document.getElementById('nav-btn-0')?.addEventListener('click', () => goToPage(0));
document.getElementById('nav-btn-1')?.addEventListener('click', () => goToPage(1));
document.getElementById('nav-btn-2')?.addEventListener('click', () => goToPage(2));
btnSaveUsername?.addEventListener('click', saveUsername);

// 탭 스위치 클릭 이벤트 바인딩
btnThisMonth?.addEventListener('click', () => switchMonthTab(0));
btnNextMonth?.addEventListener('click', () => switchMonthTab(1));

// 앱 오픈(Foreground) 중 알림 수신
if (messaging) {
  onMessage(messaging, (payload) => {
    console.log('[Foreground Push Received]:', payload);
    const title = payload.notification?.title || '[당직 안내]';
    const body = payload.notification?.body || '새로운 알림이 도착했습니다.';
    alert(`${title}\n\n${body}`);
  });
}

// 알림 토글 스위치 이벤트
if (notificationToggle) {
  if (!notifSupported) {
    notificationToggle.disabled = true;
    notificationToggle.checked = false;
  } else {
    notificationToggle.addEventListener('change', async (e) => {
      if (e.target.checked) {
        await requestNotificationPermission();
      } else {
        await disableNotificationPermission();
      }
    });

    if (Notification.permission === 'granted' && localStorage.getItem('duty_notification_enabled') === 'true') {
      notificationToggle.checked = true;
    } else {
      notificationToggle.checked = false;
    }
  }
}

let currentIndex = 1;
const totalPages = 3;

function goToPage(index) {
  if (index < 0 || index >= totalPages) return;
  currentIndex = index;
  const translateVal = -currentIndex * viewport.offsetWidth;
  track.classList.remove('dragging');
  track.style.transform = `translateX(${translateVal}px)`;
  navItems.forEach((item, idx) => item.classList.toggle('active', idx === currentIndex));
}

window.addEventListener('resize', () => {
  goToPage(currentIndex);
});

let startX = 0, startY = 0, currentTranslate = 0, prevTranslate = 0, isDragging = false, isHorizontalSwipe = null;

function getPositionX(e) { return e.type.includes('mouse') ? e.clientX : e.touches[0].clientX; }
function getPositionY(e) { return e.type.includes('mouse') ? e.clientY : e.touches[0].clientY; }

function touchStart(e) {
  isDragging = true;
  isHorizontalSwipe = null;
  startX = getPositionX(e);
  startY = getPositionY(e);
  prevTranslate = -currentIndex * viewport.offsetWidth;
  track.classList.add('dragging');
}

function touchMove(e) {
  if (!isDragging) return;
  const currentX = getPositionX(e);
  const currentY = getPositionY(e);
  const diffX = currentX - startX;
  const diffY = currentY - startY;

  if (isHorizontalSwipe === null) {
    if (Math.abs(diffX) > 8 || Math.abs(diffY) > 8) {
      isHorizontalSwipe = Math.abs(diffX) > Math.abs(diffY);
    }
  }

  if (isHorizontalSwipe === true) {
    if (e.cancelable && e.type.startsWith('touch')) e.preventDefault();
    let moveAmount = diffX;
    if ((currentIndex === 0 && diffX > 0) || (currentIndex === totalPages - 1 && diffX < 0)) {
      moveAmount = diffX * 0.3;
    }
    currentTranslate = prevTranslate + moveAmount;
    track.style.transform = `translateX(${currentTranslate}px)`;
  }
}

function touchEnd() {
  if (!isDragging) return;
  isDragging = false;
  if (isHorizontalSwipe === true) {
    const movedBy = currentTranslate - prevTranslate;
    const threshold = viewport.offsetWidth * 0.2;
    if (movedBy < -threshold && currentIndex < totalPages - 1) currentIndex += 1;
    else if (movedBy > threshold && currentIndex > 0) currentIndex -= 1;
  }
  goToPage(currentIndex);
}

if (viewport) {
  viewport.addEventListener('touchstart', touchStart, { passive: false });
  viewport.addEventListener('touchmove', touchMove, { passive: false });
  viewport.addEventListener('touchend', touchEnd);
  viewport.addEventListener('mousedown', touchStart);
}
window.addEventListener('mousemove', touchMove);
window.addEventListener('mouseup', touchEnd);

// 동일 토큰 복수 노드 정리
async function cleanDuplicateTokens(targetToken, keepSafeKey, keepDeviceId) {
  if (!targetToken) return;
  try {
    const snapshot = await get(ref(db, 'push_tokens'));
    if (!snapshot.exists()) return;

    const updates = {};
    snapshot.forEach((userSnap) => {
      const userKey = userSnap.key;
      const userData = userSnap.val();
      if (!userData || typeof userData !== 'object') return;

      if (userData.token) {
        if (userData.token === targetToken) {
          updates[`push_tokens/${userKey}`] = null;
        }
        return;
      }

      userSnap.forEach((deviceSnap) => {
        const deviceId = deviceSnap.key;
        const deviceData = deviceSnap.val();
        if (deviceData?.token === targetToken) {
          if (userKey === keepSafeKey && deviceId === keepDeviceId) return;
          updates[`push_tokens/${userKey}/${deviceId}`] = null;
        }
      });
    });

    if (Object.keys(updates).length > 0) {
      await update(ref(db), updates);
      console.log("동일 토큰을 가진 이전 노드 삭제 완료:", Object.keys(updates));
    }
  } catch (err) {
    console.error("중복 토큰 정리 중 오류 발생:", err);
  }
}

async function requestNotificationPermission() {
  if (!notifSupported) {
    alert('이 환경에서는 알림을 지원하지 않습니다.\n설치(홈 화면에 추가) 후 이용해 주세요.');
    if (notificationToggle) notificationToggle.checked = false;
    return false;
  }

  if (!currentUsername) {
    alert('이름을 먼저 설정해주세요.');
    if (notificationToggle) notificationToggle.checked = false;
    const input = document.getElementById('username-input');
    if (input) input.focus();
    return false;
  }

  try {
    const permission = await Notification.requestPermission();

    if (permission === 'granted') {
      localStorage.setItem('duty_notification_enabled', 'true');

      if (messaging) {
        const swReg = await navigator.serviceWorker.ready;
        const currentToken = await getToken(messaging, {
          vapidKey: 'BBO1aJYgUU6PyJe6ieQButDDavlvq0Yp1w7adMFaOQl13kKLKVNWNKyUJ1MqcWKGPdSmZyJfT806HTWxFvzSe6A',
          serviceWorkerRegistration: swReg
        });

        if (currentToken) {
          const safeKey = sanitizeKey(currentUsername);
          const deviceId = getOrCreateDeviceId();

          await set(ref(db, `push_tokens/${safeKey}/${deviceId}`), {
            token: currentToken,
            enabled: true,
            updatedAt: new Date().toISOString()
          });

          await cleanDuplicateTokens(currentToken, safeKey, deviceId);
          console.log(`[성공] FCM 토큰 등록 및 DB 저장 완료: ${safeKey}`);
        }
      }
      return true;
    } else {
      alert("알림 권한이 거부되었습니다. 브라우저 설정에서 권한을 허용해 주세요.");
      if (notificationToggle) notificationToggle.checked = false;
      await disableNotificationPermission();
      return false;
    }
  } catch (err) {
    console.error("FCM 토큰 획득/저장 실패:", err);
    if (notificationToggle) notificationToggle.checked = false;
    return false;
  }
}

async function disableNotificationPermission() {
  localStorage.setItem('duty_notification_enabled', 'false');

  const deviceId = getOrCreateDeviceId();
  let currentToken = null;

  try {
    if (notifSupported && messaging) {
      const swReg = await navigator.serviceWorker.ready;
      currentToken = await getToken(messaging, {
        vapidKey: 'BBO1aJYgUU6PyJe6ieQButDDavlvq0Yp1w7adMFaOQl13kKLKVNWNKyUJ1MqcWKGPdSmZyJfT806HTWxFvzSe6A',
        serviceWorkerRegistration: swReg
      });
    }
  } catch (e) {}

  try {
    const updates = {};

    if (currentUsername) {
      const safeKey = sanitizeKey(currentUsername);
      updates[`push_tokens/${safeKey}/${deviceId}`] = null;
    }

    if (currentToken) {
      const snapshot = await get(ref(db, 'push_tokens'));
      if (snapshot.exists()) {
        snapshot.forEach((userSnap) => {
          const userKey = userSnap.key;
          const userData = userSnap.val();
          if (!userData) return;

          if (userData.token === currentToken) {
            updates[`push_tokens/${userKey}`] = null;
            return;
          }

          if (typeof userData === 'object' && !userData.token) {
            userSnap.forEach((deviceSnap) => {
              if (deviceSnap.val()?.token === currentToken) {
                updates[`push_tokens/${userKey}/${deviceSnap.key}`] = null;
              }
            });
          }
        });
      }
    }

    if (Object.keys(updates).length > 0) {
      await update(ref(db), updates);
      console.log("알림 비활성화: 현재 기기 토큰 데이터 삭제 완료");
    }
  } catch (err) {
    console.error("알림 비활성화 데이터 삭제 실패:", err);
  }
}

// ─────────────────────────────────────────────────────────────────
// [변경] admin.html이 이미 가공된 { list, rawHeader } 구조로 저장하므로
//        앱에서는 해당 구조를 그대로 읽어 반환하기만 합니다.
//        기존의 __EMPTY 키 매핑 및 헤더 추출 로직은 모두 제거되었습니다.
// ─────────────────────────────────────────────────────────────────
function processRawData(rawData) {
  if (!rawData) return { list: [], rawHeader: '' };

  // Firebase에 저장된 포맷: { list: [...], rawHeader: '...' }
  const rawHeader = rawData.rawHeader || '';
  const rawList   = rawData.list;

  if (!rawList) return { list: [], rawHeader };

  const arr = Array.isArray(rawList) ? rawList : Object.values(rawList);

  const list = arr
    .filter(item => item && String(item.dateStr || '').trim() !== '')
    .map(item => ({
      dateStr:     String(item.dateStr    || '').trim(),
      day:         Number(item.day)       || 0,
      dayOfWeek:   String(item.dayOfWeek  || '').trim(),
      isHoliday:   item.isHoliday === true,
      leaderRank:  String(item.leaderRank  || '').trim(),
      leaderName:  String(item.leaderName  || '').replace(/\s/g, ''),
      worker1Rank: String(item.worker1Rank || '').trim(),
      worker1Name: String(item.worker1Name || '').replace(/\s/g, ''),
      worker2Rank: String(item.worker2Rank || '').trim(),
      worker2Name: String(item.worker2Name || '').replace(/\s/g, ''),
      shiftType:   String(item.shiftType   || '').trim(),
      note:        String(item.note        || '').trim(),
    }));

  return { list, rawHeader };
}

// [수정] targetYear/targetMonth를 외부에서 변경하지 않고 렌더링에만 집중하도록 수정
function applyDataToUI(list, rawHeader) {
  dutyData = list;

  // 오늘 날짜 선택 여부 결정 (현재 보고 있는 년/월이 이번 달인 경우 오늘 날짜 선택)
  if (targetYear === todayYear && targetMonth === todayMonth) {
    selectedDay = todayDay;
  } else {
    selectedDay = 1;
  }

  const headerElem = document.getElementById('app-header');
  const titleElem = document.getElementById('calendar-title');
  if (headerElem) headerElem.innerText = rawHeader || `당직상황근무지정 ${targetMonth}월`;
  if (titleElem) titleElem.innerText = `${targetYear}년 ${targetMonth}월`;

  renderCalendar();
  renderDutyInfo();
}

// 선택된 탭(0: 이번 달, 1: 다음 달) 데이터 연동 처리
function switchMonthTab(offset) {
  currentViewOffset = offset;

  // 탭 버튼 UI 업데이트
  if (btnThisMonth) btnThisMonth.classList.toggle('active', offset === 0);
  if (btnNextMonth) btnNextMonth.classList.toggle('active', offset === 1);

  // 연월 계산
  let calcMonth = todayMonth + offset;
  let calcYear = todayYear;
  if (calcMonth > 12) {
    calcMonth -= 12;
    calcYear += 1;
  }

  targetYear = calcYear;
  targetMonth = calcMonth;

  // 이전 실시간 리스너 구독 해제
  if (currentDbUnsubscribe) {
    currentDbUnsubscribe();
    currentDbUnsubscribe = null;
  }

  // 월별 캐시 데이터 로드
  const cacheKey = `duty_cached_data_${targetYear}_${targetMonth}`;
  const cachedJson = localStorage.getItem(cacheKey) || "";
  lastRawDataJson = cachedJson;

  if (cachedJson) {
    try {
      const cachedVal = JSON.parse(cachedJson);
      const { list, rawHeader } = processRawData(cachedVal);
      applyDataToUI(list, rawHeader);
    } catch (e) {
      console.error(e);
    }
  } else {
    applyDataToUI([], "");
    const headerElem = document.getElementById('app-header');
    if (headerElem) headerElem.innerText = `${targetYear}년 ${targetMonth}월 (불러오는 중...)`;
  }

  // 새로운 월 Firebase RTDB 연동
  const currentYearStr = String(targetYear);
  const currentMonthStr = String(targetMonth).padStart(2, '0');
  const dbPath = `gwanak-on/${currentYearStr}-${currentMonthStr}`;
  const dbRef = ref(db, dbPath);

  // 현재 요청한 탭의 offset 저장
  const requestedOffset = offset;

  // [수정된 부분] gwanak-on 데이터가 없을 경우 gwanakon/defaultData/YYYY-MM을 바로 조회하도록 수정
  currentDbUnsubscribe = onValue(dbRef, async (snapshot) => {
    // [비동기 안전 검증] 사용자가 클릭한 현재 탭과 응답이 일치하지 않으면 무시
    if (currentViewOffset !== requestedOffset) return;

    let val = snapshot.val();

    // 1. gwanak-on/YYYY-MM 에 데이터가 없을 경우 gwanakon/defaultData/YYYY-MM 조회
    if (!val) {
      try {
        // 경로 수정됨: gwanakon/defaultData/
        const defaultDbPath = `gwanak-on/defaultData/${currentYearStr}-${currentMonthStr}`;
        const defaultSnap = await get(ref(db, defaultDbPath));
        val = defaultSnap.val();
      } catch (err) {
        console.error("defaultData 조회 중 오류 발생:", err);
      }
    }

    // 2. gwanakon/defaultData/YYYY-MM 에도 데이터가 없다면 '업데이트 예정' 처리
    if (!val) {
      lastRawDataJson = "";
      localStorage.removeItem(cacheKey);
      applyDataToUI([], "");
      const headerElem = document.getElementById('app-header');
      if (headerElem) headerElem.innerText = `${targetYear}년 ${targetMonth}월 (업데이트 예정)`;
      return;
    }

    // 3. 데이터를 성공적으로 불러온 경우 UI 적용 및 캐시 저장
    const currentRawDataJson = JSON.stringify(val);
    if (currentRawDataJson === lastRawDataJson && dutyData.length > 0) return;

    lastRawDataJson = currentRawDataJson;
    localStorage.setItem(cacheKey, currentRawDataJson);

    const { list, rawHeader } = processRawData(val);
    applyDataToUI(list, rawHeader);
  });
}

// 최초 실행: 기본값으로 '이번 달(0)' 로드
switchMonthTab(0);

function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  if (!grid) return;

  let gridHTML = `
    <div class="day-header sun">일</div><div class="day-header">월</div><div class="day-header">화</div>
    <div class="day-header">수</div><div class="day-header">목</div><div class="day-header">금</div>
    <div class="day-header sat">토</div>
  `;

  const firstDayObj = new Date(targetYear, targetMonth - 1, 1);
  const lastDayObj = new Date(targetYear, targetMonth, 0);

  const firstDayIndex = firstDayObj.getDay();
  const totalDays = lastDayObj.getDate();
  const prevMonthLastDay = new Date(targetYear, targetMonth - 1, 0).getDate();

  for (let i = 0; i < firstDayIndex; i++) {
    const emptyDayNum = prevMonthLastDay - firstDayIndex + 1 + i;
    gridHTML += `<div class="day-cell other-month"><span class="day-num">${emptyDayNum}</span></div>`;
  }

  for (let day = 1; day <= totalDays; day++) {
    const dayDuties = dutyData.filter(d => d.day === day);
    const isToday = (targetYear === todayYear && targetMonth === todayMonth && day === todayDay);
    const dayOfWeekIdx = (firstDayIndex + day - 1) % 7;
    const isHoliday = dayDuties.some(d => d.isHoliday);

    let dayClass = "";
    if (dayOfWeekIdx === 0 || isHoliday) dayClass = "sun";
    else if (dayOfWeekIdx === 6) dayClass = "sat";

    let dutyBadgesHTML = "";
    dayDuties.forEach(d => {
      if (d.shiftType) {
        let shiftClass = "";
        if (d.shiftType.includes("일직")) shiftClass = "shift-day";
        else if (d.shiftType.includes("숙직")) shiftClass = "shift-night";

        dutyBadgesHTML += `<span class="duty-badge ${shiftClass}">[${d.shiftType}]</span>`;
      }
      [d.leaderName, d.worker1Name, d.worker2Name].forEach(name => {
        if (!name) return;
        const isMe = name === currentUsername;
        dutyBadgesHTML += `<span class="duty-badge ${isMe ? 'my-duty' : ''}">${name}</span>`;
      });
    });

    gridHTML += `
      <div class="day-cell ${dayClass} ${isToday ? 'today' : ''}" data-day="${day}">
        <span class="day-num">${day}</span>
        <div class="duty-list">${dutyBadgesHTML}</div>
      </div>
    `;
  }

  const totalCells = firstDayIndex + totalDays;
  const remainingCells = (7 - (totalCells % 7)) % 7;
  for (let i = 1; i <= remainingCells; i++) {
    gridHTML += `<div class="day-cell other-month"><span class="day-num">${i}</span></div>`;
  }

  grid.innerHTML = gridHTML;

  grid.querySelectorAll('.day-cell[data-day]').forEach(cell => {
    cell.addEventListener('click', () => {
      selectedDay = parseInt(cell.getAttribute('data-day'), 10);
      renderDutyInfo();
      goToPage(1);
    });
  });
}

window.changeDay = function(delta) {
  const maxDays = new Date(targetYear, targetMonth, 0).getDate();
  const nextDay = selectedDay + delta;
  if (nextDay >= 1 && nextDay <= maxDays) {
    selectedDay = nextDay;
    renderDutyInfo();
  }
};

window.selectDayFromNextDuty = function(day) {
  selectedDay = day;
  renderDutyInfo();
  goToPage(1);
};

function renderDutyInfo() {
  const currentDataList = dutyData.filter(d => d.day === selectedDay);
  const todayCard = document.getElementById('today-card');

  const targetDateObj = new Date(targetYear, targetMonth - 1, selectedDay);
  const currentDayOfWeekStr = weekDays[targetDateObj.getDay()];

  const isToday = (targetYear === todayYear && targetMonth === todayMonth && selectedDay === todayDay);
  const isHoliday = currentDataList.some(d => d.isHoliday);

  let shiftsHTML = "";

  if (currentDataList.length > 0) {
    currentDataList.forEach(d => {
      const shiftTitle = d.shiftType || "당직";
      let badgeClass = "";
      if (shiftTitle.includes("일직")) badgeClass = "day";
      else if (shiftTitle.includes("숙직")) badgeClass = "night";

      let workersHTML = "";
      if (d.worker1Name && d.worker2Name) {
        workersHTML = `${d.worker1Name} <span class="rank">(${d.worker1Rank})</span>&nbsp;&nbsp;${d.worker2Name} <span class="rank">(${d.worker2Rank})</span>`;
      } else if (d.worker1Name) {
        workersHTML = `${d.worker1Name} <span class="rank">(${d.worker1Rank})</span>`;
      } else if (d.worker2Name) {
        workersHTML = `${d.worker2Name} <span class="rank">(${d.worker2Rank})</span>`;
      } else {
        workersHTML = "-";
      }

      shiftsHTML += `
        <div class="shift-section">
          <div class="shift-header"><span class="shift-badge ${badgeClass}">${shiftTitle}</span></div>
          <div class="duty-row"><div class="duty-role">상황책임관</div><div class="duty-name">${d.leaderName ? `${d.leaderName} <span class="rank">(${d.leaderRank})</span>` : '-'}</div></div>
          <div class="duty-row"><div class="duty-role">상황근무자</div><div class="duty-name">${workersHTML}</div></div>
        </div>
      `;
    });
  } else {
    shiftsHTML = `<p style="color:var(--text-sub); font-size:14px; padding: 12px 0; text-align: center;">지정된 근무 데이터가 없습니다.</p>`;
  }

  if (todayCard) {
    todayCard.innerHTML = `
      <div class="date-nav-header">
        <button class="date-btn" onclick="changeDay(-1)">‹</button>
        <div class="greeting">
          ${targetMonth}월 ${selectedDay}일 (${currentDataList[0]?.dayOfWeek || currentDayOfWeekStr})
          ${isToday ? '<span class="today-tag">오늘</span>' : ''}
          ${isHoliday ? '<span class="holiday">(공휴일)</span>' : ''}
        </div>
        <button class="date-btn" onclick="changeDay(1)">›</button>
      </div>
      ${shiftsHTML}
    `;
  }

  const nextDutyCard = document.getElementById('next-duty-card');

  if (nextDutyCard) {
    if (!currentUsername) {
      nextDutyCard.innerHTML = `
        <div class="card-title">내 당직 안내</div>
        <div class="duty-info" style="flex-direction: column; align-items: center; justify-content: center; padding: 10px 0;">
          <p style="color:var(--text-sub); font-size:14px; text-align:center; margin: 0 0 15px 0; line-height: 1.4;">
            설정에서 본인의 이름을 등록하시면<br>이번 달 남은 당직일을 모두 알려드립니다.
          </p>
          <button class="btn-save" style="width: auto; padding: 8px 20px; font-size: 14px; border-radius: 20px; cursor: pointer;" onclick="document.getElementById('nav-btn-2')?.click()">
            ⚙️ 이름 설정하러 가기
          </button>
        </div>
      `;
    } else {
      const todayTime = new Date(todayYear, todayMonth - 1, todayDay).getTime();
      const upcomingDuties = dutyData.filter(d => {
        const dutyTime = new Date(targetYear, targetMonth - 1, d.day).getTime();
        return dutyTime >= todayTime &&
               (d.leaderName === currentUsername || d.worker1Name === currentUsername || d.worker2Name === currentUsername);
      });

      upcomingDuties.sort((a, b) => a.day - b.day);

      let nextDutyHTML = `
        <div class="card-title"><span>${currentUsername}</span> 님의 남은 당직</div>
        <div class="duty-list-container" style="display: flex; flex-direction: column; gap: 8px; margin-top: 15px;">
      `;

      if (upcomingDuties.length > 0) {
        upcomingDuties.forEach(myDuty => {
          const shiftLabel = myDuty.shiftType ? ` (${myDuty.shiftType})` : '';
          const nextDutyDateObj = new Date(targetYear, targetMonth - 1, myDuty.day);
          const dDayMs = nextDutyDateObj.getTime() - todayTime;
          const dDayVal = Math.round(dDayMs / (1000 * 60 * 60 * 24));

          nextDutyHTML += `
            <div class="duty-info" style="cursor: pointer;" onclick="selectDayFromNextDuty(${myDuty.day})">
              <div class="duty-date">${targetMonth}월 ${myDuty.day}일 (${myDuty.dayOfWeek || weekDays[nextDutyDateObj.getDay()]})${shiftLabel}</div>
              <div class="d-day">${dDayVal === 0 ? "D-Day" : `D-${dDayVal}`}</div>
            </div>
          `;
        });
      } else {
        nextDutyHTML += `
          <div class="duty-info">
            <div class="duty-date">남은 일정 없음</div>
            <div class="d-day">D--</div>
          </div>
        `;
      }

      nextDutyHTML += `</div>`;
      nextDutyCard.innerHTML = nextDutyHTML;
    }
  }
}

function isNameInDutyData(name) {
  return dutyData.some(d =>
    d.leaderName === name ||
    d.worker1Name === name ||
    d.worker2Name === name
  );
}

async function saveUsername() {
  const input = document.getElementById('username-input');
  if (!input) return;

  const newName = input.value.trim();
  if (!newName) {
    alert('이름을 입력해 주세요.');
    input.focus();
    return;
  }

  if (dutyData.length === 0) {
    alert('당직 데이터를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.');
    return;
  }

  if (!isNameInDutyData(newName)) {
    alert(`'${newName}'은(는) 이번 달 당직 명단에 없는 이름입니다.\n정확한 이름을 입력해 주세요.`);
    input.focus();
    return;
  }

  const oldName = currentUsername;
  currentUsername = newName;
  localStorage.setItem('duty_app_username', newName);

  const isNotificationEnabled = localStorage.getItem('duty_notification_enabled') === 'true';
  const deviceId = getOrCreateDeviceId();

  try {
    if (oldName && oldName !== newName) {
      const oldSafeKey = sanitizeKey(oldName);
      await remove(ref(db, `push_tokens/${oldSafeKey}/${deviceId}`));
    }

    if (isNotificationEnabled && notifSupported && Notification.permission === 'granted' && messaging) {
      const swReg = await navigator.serviceWorker.ready;
      const currentToken = await getToken(messaging, {
        vapidKey: 'BBO1aJYgUU6PyJe6ieQButDDavlvq0Yp1w7adMFaOQl13kKLKVNWNKyUJ1MqcWKGPdSmZyJfT806HTWxFvzSe6A',
        serviceWorkerRegistration: swReg
      });

      if (currentToken) {
        const newSafeKey = sanitizeKey(newName);

        await set(ref(db, `push_tokens/${newSafeKey}/${deviceId}`), {
          token: currentToken,
          enabled: true,
          updatedAt: new Date().toISOString()
        });

        await cleanDuplicateTokens(currentToken, newSafeKey, deviceId);
        console.log(`[성공] 새 이름(${newName})으로 토큰 DB 등록 완료`);
      }
    }
  } catch (err) {
    console.error("이름 저장 후 알림 처리 중 오류 발생:", err);
  }

  renderCalendar();
  renderDutyInfo();

  const feedback = document.getElementById('save-feedback');
  if (feedback) {
    feedback.classList.add('show');
    setTimeout(() => feedback.classList.remove('show'), 2000);
  }
}

window.addEventListener('load', () => {
  if (track) {
    track.style.transition = 'none';
    goToPage(1);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        track.style.transition = '';
      });
    });
  }
});

let deferredPrompt;
const installBtn = document.getElementById('install-btn');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (deferredPrompt && installBtn) installBtn.style.display = 'block';
});

if (installBtn) {
  installBtn.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt = null;
      installBtn.style.display = 'none';
    }
  });
}