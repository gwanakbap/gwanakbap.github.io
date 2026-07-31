if ('serviceWorker' in navigator) {
  let refreshing = false;

  // 서비스 워커가 교체(controllerchange)되면 페이지 자동 새로고침
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });

  // 서비스 워커 등록
  navigator.serviceWorker.register('./sw.js');
}

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, onValue, set } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js";

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
// [수정] Firebase Messaging 객체 정상 초기화
const messaging = getMessaging(app);

let dutyData = [];
let lastRawDataJson = localStorage.getItem('duty_cached_data') || "";
let currentUsername = localStorage.getItem('duty_app_username') || "";

const now = new Date();
const todayYear = now.getFullYear();
const todayMonth = now.getMonth() + 1;
const todayDay = now.getDate();
const weekDays = ['일', '월', '화', '수', '목', '금', '토'];

let targetYear = todayYear;
let targetMonth = todayMonth;
let selectedDay = todayDay;

const track = document.getElementById('track');
const viewport = document.getElementById('viewport');
const navItems = document.querySelectorAll('.nav-item');
const usernameInput = document.getElementById('username-input');
const btnSaveUsername = document.getElementById('btn-save-username');
const notificationToggle = document.getElementById('notification-toggle');

usernameInput.value = currentUsername;

document.getElementById('nav-btn-0').addEventListener('click', () => goToPage(0));
document.getElementById('nav-btn-1').addEventListener('click', () => goToPage(1));
document.getElementById('nav-btn-2').addEventListener('click', () => goToPage(2));
btnSaveUsername.addEventListener('click', saveUsername);

// [수정] 알림 토글 상태 관리 개선
if (notificationToggle) {
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

viewport.addEventListener('touchstart', touchStart, { passive: false });
viewport.addEventListener('touchmove', touchMove, { passive: false });
viewport.addEventListener('touchend', touchEnd);
viewport.addEventListener('mousedown', touchStart);
window.addEventListener('mousemove', touchMove);
window.addEventListener('mouseup', touchEnd);

// [수정] 알림 동의 처리 및 토큰/수신상태 DB 저장
async function requestNotificationPermission() {
    if (!currentUsername) {
        alert("이름을 먼저 등록하고 저장해 주세요.");
        if (notificationToggle) notificationToggle.checked = false;
        return;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
        localStorage.setItem('duty_notification_enabled', 'true');
        if (messaging) {
            try {
                // ServiceWorker 등록 상태를 전달하여 안정적 토큰 획득
                const swReg = await navigator.serviceWorker.ready;
                const currentToken = await getToken(messaging, { 
                    vapidKey: 'BBO1aJYgUU6PyJe6ieQButDDavlvq0Yp1w7adMFaOQl13kKLKVNWNKyUJ1MqcWKGPdSmZyJfT806HTWxFvzSe6A', // 웹 푸시 VAPID Key 입력
                    serviceWorkerRegistration: swReg
                });
                if (currentToken) {
                    // enabled: true 값을 함께 저장하여 정기 발송 시 수신 허용 유저 필터링 가능
                    await set(ref(db, `push_tokens/${currentUsername}`), {
                        token: currentToken,
                        enabled: true,
                        updatedAt: new Date().toISOString()
                    });
                    console.log("FCM 토큰 및 수신 동의 DB 등록 성공");
                }
            } catch (err) {
                console.error("FCM 토큰 획득 실패:", err);
            }
        }
    } else {
        alert("알림 권한이 거부되었습니다. 브라우저 설정에서 권한을 허용해 주세요.");
        if (notificationToggle) notificationToggle.checked = false;
        await disableNotificationPermission();
    }
}

// [신규] 알림 비활성화 처리 (DB 상태 변경)
async function disableNotificationPermission() {
    localStorage.setItem('duty_notification_enabled', 'false');
    if (currentUsername) {
        try {
            await set(ref(db, `push_tokens/${currentUsername}/enabled`), false);
            await set(ref(db, `push_tokens/${currentUsername}/updatedAt`), new Date().toISOString());
            console.log("알림 비활성화 상태가 DB에 반영되었습니다.");
        } catch (err) {
            console.error("알림 비활성화 DB 반영 실패:", err);
        }
    }
}

function processRawData(rawData) {
    if (!rawData) return { list: [], rawHeader: '' };
    const list = Array.isArray(rawData) ? rawData : Object.values(rawData);
    let extractedHeader = '';

    const processedList = list.map(item => {
        let dateStr = item["dateStr"] || "";
        if (!dateStr) {
            const foundKey = Object.keys(item).find(k => k.includes("당직상황근무지정"));
            if (foundKey) {
                dateStr = item[foundKey];
                if (!extractedHeader) extractedHeader = foundKey;
            }
        }

        const parts = dateStr.split('/');
        const day = parts.length > 1 ? parseInt(parts[1], 10) : 0;
        
        return {
            dateStr: dateStr,
            day: day,
            dayOfWeek: item["__EMPTY"] || item["dayOfWeek"] || "",
            isHoliday: (item["__EMPTY_1"] === "공휴일") || item["isHoliday"] === true,
            leaderRank: item["__EMPTY_2"] || item["leaderRank"] || "",
            leaderName: (item["__EMPTY_3"] || item["leaderName"] || "").replace(/\s/g, ''),
            worker1Rank: item["__EMPTY_4"] || item["worker1Rank"] || "",
            worker1Name: (item["__EMPTY_5"] || item["worker1Name"] || "").replace(/\s/g, ''),
            worker2Rank: item["__EMPTY_6"] || item["worker2Rank"] || "",
            worker2Name: (item["__EMPTY_7"] || item["worker2Name"] || "").replace(/\s/g, ''),
            shiftType: item["__EMPTY_8"] || item["shiftType"] || "",
            note: item["__EMPTY_9"] || item["note"] || ""
        };
    });

    return { list: processedList, rawHeader: extractedHeader };
}

function applyDataToUI(list, rawHeader) {
    dutyData = list;
    
    const headerMatch = rawHeader.match(/(\d+)월/);
    if (headerMatch) {
        targetMonth = parseInt(headerMatch[1], 10);
        
        if (todayMonth === 12 && targetMonth === 1) targetYear = todayYear + 1;
        else if (todayMonth === 1 && targetMonth === 12) targetYear = todayYear - 1;
        else targetYear = todayYear;
    } else {
        targetMonth = todayMonth;
        targetYear = todayYear;
    }

    if (targetYear === todayYear && targetMonth === todayMonth) {
        selectedDay = todayDay;
    } else {
        selectedDay = 1;
    }

    document.getElementById('app-header').innerText = rawHeader || `당직상황근무지정 ${targetMonth}월`;
    document.getElementById('calendar-title').innerText = `${targetYear}년 ${targetMonth}월`;

    renderCalendar();
    renderDutyInfo();
}

if (lastRawDataJson) {
    try {
        const cachedVal = JSON.parse(lastRawDataJson);
        const { list, rawHeader } = processRawData(cachedVal);
        applyDataToUI(list, rawHeader);
    } catch (e) {
        console.error(e);
    }
}

const currentYearStr = String(todayYear);
const currentMonthStr = String(todayMonth).padStart(2, '0');
const dbPath = `gwanak-on/${currentYearStr}-${currentMonthStr}`;

console.log(`[DB 연결] 대상 경로: ${dbPath}`);
const dbRef = ref(db, dbPath);

onValue(dbRef, (snapshot) => {
    const val = snapshot.val();
    
    if (!val) {
        console.log("해당 월의 당직 데이터가 없습니다.");
        lastRawDataJson = "";
        localStorage.removeItem('duty_cached_data');
        
        applyDataToUI([], "");
        document.getElementById('app-header').innerText = `${todayYear}년 ${todayMonth}월 (업데이트 예정)`;
        return;
    }

    const currentRawDataJson = JSON.stringify(val);
    
    if (currentRawDataJson === lastRawDataJson) {
        return;
    }

    lastRawDataJson = currentRawDataJson;
    localStorage.setItem('duty_cached_data', currentRawDataJson);
    
    const { list, rawHeader } = processRawData(val);
    applyDataToUI(list, rawHeader);
    console.log("새로운 데이터가 감지되어 UI를 갱신하였습니다.");
});

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
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

    const nextDutyCard = document.getElementById('next-duty-card');

    if (!currentUsername) {
        nextDutyCard.innerHTML = `
            <div class="card-title">다음 당직 안내</div>
            <div class="duty-info" style="flex-direction: column; align-items: center; justify-content: center; padding: 10px 0;">
                <p style="color:var(--text-sub); font-size:14px; text-align:center; margin: 0 0 15px 0; line-height: 1.4;">
                    설정에서 본인의 이름을 등록하시면<br>다음 당직일까지 남은 날짜를 알려드립니다.
                </p>
                <button class="btn-save" style="width: auto; padding: 8px 20px; font-size: 14px; border-radius: 20px; cursor: pointer;" onclick="document.getElementById('nav-btn-2').click()">
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
        const myNextDuty = upcomingDuties.length > 0 ? upcomingDuties[0] : null;

        let nextDutyHTML = `
            <div class="card-title">다음 <span>${currentUsername}</span> 님의 당직</div>
            <div class="duty-info">
        `;

        if (myNextDuty) {
            const shiftLabel = myNextDuty.shiftType ? ` (${myNextDuty.shiftType})` : '';
            const nextDutyDateObj = new Date(targetYear, targetMonth - 1, myNextDuty.day);
            const dDayMs = nextDutyDateObj.getTime() - todayTime;
            const dDayVal = Math.ceil(dDayMs / (1000 * 60 * 60 * 24));
            
            nextDutyHTML += `
                <div class="duty-date">${targetMonth}월 ${myNextDuty.day}일 (${myNextDuty.dayOfWeek || weekDays[nextDutyDateObj.getDay()]})${shiftLabel}</div>
                <div class="d-day">${dDayVal === 0 ? "D-Day" : `D-${dDayVal}`}</div>
            `;
        } else {
            nextDutyHTML += `
                <div class="duty-date">일정 없음</div>
                <div class="d-day">D--</div>
            `;
        }
        
        nextDutyHTML += `</div>`;
        nextDutyCard.innerHTML = nextDutyHTML;
    }
}

// [수정] 이름 변경 시 기존 DB 토큰 매핑을 새 이름으로 갱신
function saveUsername() {
    const input = document.getElementById('username-input');
    const newName = input.value.trim();

    if (!newName) {
        alert('이름을 입력해 주세요.');
        input.focus();
        return;
    }

    const oldName = currentUsername;
    currentUsername = newName;
    localStorage.setItem('duty_app_username', newName);

    // 이름을 바꿨을 때 알림 수신이 켜져있다면 DB 노드도 새 이름으로 재등록
    if (oldName && oldName !== newName && notificationToggle && notificationToggle.checked) {
        disableNotificationPermission(); // 기존 이름 노드 비활성화
        requestNotificationPermission(); // 새 이름 노드 동기화
    }

    renderCalendar();
    renderDutyInfo();
    
    const feedback = document.getElementById('save-feedback');
    feedback.classList.add('show');
    setTimeout(() => feedback.classList.remove('show'), 2000);
}

window.addEventListener('load', () => {
    track.style.transition = 'none'; 
    goToPage(1); 
    
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            track.style.transition = ''; 
        });
    });
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