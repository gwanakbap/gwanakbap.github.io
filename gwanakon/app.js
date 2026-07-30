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
    let messaging = null;

    // if ('serviceWorker' in navigator) { ... } (기존 주석 처리된 서비스워커 유지)

    let dutyData = [];
    let lastRawDataJson = localStorage.getItem('duty_cached_data') || "";
    let currentUsername = localStorage.getItem('duty_app_username') || "";

    const now = new Date();
    const todayYear = now.getFullYear();
    const todayMonth = now.getMonth() + 1;
    const todayDay = now.getDate();
    const weekDays = ['일', '월', '화', '수', '목', '금', '토'];

    // 동적 데이터용 연/월 변수 (초기값은 오늘 날짜 기준)
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

    if (notificationToggle) {
        notificationToggle.addEventListener('change', async (e) => {
            if (e.target.checked) {
                await requestNotificationPermission();
            } else {
                localStorage.setItem('duty_notification_enabled', 'false');
            }
        });

        if (Notification.permission === 'granted' && localStorage.getItem('duty_notification_enabled') === 'true') {
            notificationToggle.checked = true;
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

    async function requestNotificationPermission() {
        if (!currentUsername) {
            alert("이름을 먼저 등록하고 저장해 주세요.");
            notificationToggle.checked = false;
            return;
        }

        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            localStorage.setItem('duty_notification_enabled', 'true');
            if (messaging) {
                try {
                    const currentToken = await getToken(messaging, { 
                        vapidKey: 'YOUR_PUBLIC_VAPID_KEY' 
                    });
                    if (currentToken) {
                        await set(ref(db, `push_tokens/${currentUsername}`), {
                            token: currentToken,
                            updatedAt: new Date().toISOString()
                        });
                        console.log("FCM 토큰 DB 등록 성공");
                    }
                } catch (err) {
                    console.error("FCM 토큰 획득 실패:", err);
                }
            }
        } else {
            alert("알림 권한이 거부되었습니다. 브라우저 설정에서 권한을 허용해 주세요.");
            notificationToggle.checked = false;
            localStorage.setItem('duty_notification_enabled', 'false');
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

    // 데이터를 UI에 반영하는 공통 함수 (동적 연/월 파악 포함)
    function applyDataToUI(list, rawHeader) {
        dutyData = list;
        
        // 데이터에서 N월 추출 (예: "당직상황근무지정 8월")
        const headerMatch = rawHeader.match(/(\d+)월/);
        if (headerMatch) {
            targetMonth = parseInt(headerMatch[1], 10);
            
            // 연말/연초 연도 변경 대응 (예: 12월에 접속했는데 데이터가 1월인 경우)
            if (todayMonth === 12 && targetMonth === 1) targetYear = todayYear + 1;
            else if (todayMonth === 1 && targetMonth === 12) targetYear = todayYear - 1;
            else targetYear = todayYear;
        } else {
            targetMonth = todayMonth;
            targetYear = todayYear;
        }

        // 해당 데이터의 월이 현재 월과 다르면 기본 선택일을 1일로 지정
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
            // console.log("캐시된 데이터로 즉시 렌더링 완료 (로딩 없음)");
        } catch (e) {
            // console.error("캐시 데이터 파싱 오류:", e);
            console.error(e);
        }
    }

    const dbRef = ref(db, 'gwanak-on');
    onValue(dbRef, (snapshot) => {
        const val = snapshot.val();
        if (!val) return;

        const currentRawDataJson = JSON.stringify(val);
        
        if (currentRawDataJson === lastRawDataJson) {
            // console.log("데이터 변경 없음: UI 재로딩을 스킵합니다.");
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

        // 달력 동적 계산을 위한 Date 객체 생성
        const firstDayObj = new Date(targetYear, targetMonth - 1, 1);
        const lastDayObj = new Date(targetYear, targetMonth, 0);
        
        const firstDayIndex = firstDayObj.getDay(); // 0(일) ~ 6(토)
        const totalDays = lastDayObj.getDate(); // 이번 달의 총 일수(28, 30, 31 등)
        const prevMonthLastDay = new Date(targetYear, targetMonth - 1, 0).getDate();

        // 1. 이전 달의 꼬리 날짜 채우기
        for (let i = 0; i < firstDayIndex; i++) {
            const emptyDayNum = prevMonthLastDay - firstDayIndex + 1 + i;
            gridHTML += `<div class="day-cell other-month"><span class="day-num">${emptyDayNum}</span></div>`;
        }

        // 2. 이번 달 날짜 채우기
        for (let day = 1; day <= totalDays; day++) {
            const dayDuties = dutyData.filter(d => d.day === day);
            const isToday = (targetYear === todayYear && targetMonth === todayMonth && day === todayDay);
            const dayOfWeekIdx = (firstDayIndex + day - 1) % 7; // 정확한 요일 인덱스
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

        // 3. 다음 달의 머리 날짜 채우기
        const totalCells = firstDayIndex + totalDays;
        const remainingCells = (7 - (totalCells % 7)) % 7;
        for (let i = 1; i <= remainingCells; i++) {
            gridHTML += `<div class="day-cell other-month"><span class="day-num">${i}</span></div>`;
        }

        grid.innerHTML = gridHTML;

        // 날짜 클릭 이벤트 바인딩
        grid.querySelectorAll('.day-cell[data-day]').forEach(cell => {
            cell.addEventListener('click', () => {
                selectedDay = parseInt(cell.getAttribute('data-day'), 10);
                renderDutyInfo();
                goToPage(1);
            });
        });
    }

    // 일(day) 이동 함수 동적 제한
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

        // 선택한 날의 요일 정확히 가져오기
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

        // ---------------- [수정된 부분] 다음 당직 카드 동적 렌더링 ----------------
        const nextDutyCard = document.getElementById('next-duty-card');

        if (!currentUsername) {
            // 이름이 설정되지 않은 경우 유도 화면 출력
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
            // 이름이 설정된 경우 기존 당직 정보 출력
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

    function saveUsername() {
        const input = document.getElementById('username-input');
        // const feedback = document.getElementById('save-feedback');
        const newName = input.value.trim();

        if (!newName) {
            alert('이름을 입력해 주세요.');
            input.focus();
            return;
        }

        currentUsername = newName;
        localStorage.setItem('duty_app_username', newName);

        renderCalendar();
        renderDutyInfo();

        // feedback.classList.acdd('show');
        // setTimeout(() => feedback.lassList.remove('show'), 2000);

        goToPage(1);
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