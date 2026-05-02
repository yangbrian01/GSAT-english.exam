// 🎯 核心：宣告全局狀態物件，隔離全域變數汙染
const AppState = {
    auth: {
        user: localStorage.getItem('user'),
        token: localStorage.getItem('token')
    },
    profile: {
        cache: null,
        level: null,
        targetYear: null,
        isSaving: false
    },
    quiz: {
        data: [],
        currentIndex: 0,
        answers: {},
        total: 0,
        isReviewMode: false,
        timer: null,
        isSubmitting: false,
        spellTemplate: []
    },
    exam: {
        data: null,
        timer: null,
        endTime: 0,
        answers: {}
    },
    review: {
        cards: [],
        currentIndex: 0,
        isFlashcardMode: true
    },
    vocab: {
        level: 0,
        list: [],
        letterList: [],
        cardIndex: 0,
        favorites: new Set(),
        cache: []
    },
    sys: {
        leaderboard: [],
        isDarkMode: localStorage.getItem('darkMode') === 'true',
        touchStartX: 0,
        touchEndX: 0
    }
};

function applyTheme() {
    if (AppState.sys.isDarkMode) { document.body.classList.add('dark-mode'); document.getElementById('themeToggleBtn').textContent = '☀️'; } 
    else { document.body.classList.remove('dark-mode'); document.getElementById('themeToggleBtn').textContent = '🌙'; }
}

function toggleTheme() { 
    AppState.sys.isDarkMode = !AppState.sys.isDarkMode; 
    localStorage.setItem('darkMode', AppState.sys.isDarkMode); 
    applyTheme(); 
}

if ('serviceWorker' in navigator) { window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(err => console.log('SW failed: ', err)); }); }

const API_URL = 'https://script.google.com/macros/s/AKfycbyXAx1jgdExUKrNHWpd4v8crV0KI4QXVMGr4Kzht8OG314UfxZKlPbLKlDYc_YqTVM2/exec';

const showLoading = (text) => { Swal.fire({ title: text, allowOutsideClick: false, didOpen: () => { Swal.showLoading(); }}); };

async function apiCall(action, data = {}) {
    try { 
        data.sessionToken = localStorage.getItem('token') || AppState.auth.token || null;
        let res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, data }) });
        let result = await res.json();
        if (result.success === false && result.message && result.message.includes('登入驗證失效')) {
            Swal.fire({ icon: 'error', title: '連線逾時', text: result.message, confirmButtonText: '重新登入' }).then(() => { handleLogout(); });
        }
        return result;
    } catch (e) { return { success: false, message: "網路連線異常，請檢查網路狀態或確認伺服器是否有正確部署新版本！" }; }
}

function getCurrentSeason() { let now = new Date(); return (now.getMonth() >= 1) ? (now.getFullYear() - 1911) + 1 : (now.getFullYear() - 1911); }
function getBaseAcadYear() { let now = new Date(); return (now.getMonth() >= 7) ? (now.getFullYear() - 1911) : (now.getFullYear() - 1912); }
function calculateTargetYear(offsetStr) { let offset = parseInt(offsetStr); if(isNaN(offset) || offset === -1) return 0; return getBaseAcadYear() + 1 + offset; }

window.onload = async () => { 
    applyTheme(); 
    const promises = [];
    promises.push(new Promise(resolve => setTimeout(resolve, 1200))); 

    const sysPromise = apiCall('getSystemInfo');
    promises.push(sysPromise);

    let profPromise = null;
    if (AppState.auth.user) {
        profPromise = apiCall('getProfileData', { username: AppState.auth.user });
        promises.push(profPromise);
        promises.push(apiCall('getLeaderboardData').then(res => { if(res.success && res.data) AppState.sys.leaderboard = res.data; }));
        promises.push(apiCall('getIncorrectQuestions', { username: AppState.auth.user }).then(res => { if(res.success && res.questions) AppState.review.cards = res.questions; }));
        promises.push(apiCall('getFavorites', { username: AppState.auth.user }).then(res => {
            if(res.success) {
                AppState.vocab.cache = res.words;
                AppState.vocab.favorites.clear();
                res.words.forEach(w => AppState.vocab.favorites.add(w.word));
            }
        }));
    }

    await Promise.all(promises);
    const resSys = await sysPromise;
    let season = getCurrentSeason();
    let examDate;
    if (resSys.success && resSys.gsatDate) {
        season = resSys.season;
        examDate = new Date(resSys.gsatDate);
    } else {
        let examYear = season + 1911;
        examDate = new Date(examYear, 0, 16); 
    }
    
    document.getElementById('currentSeasonText').textContent = season.toString();
    examDate.setHours(0, 0, 0, 0); 
    
    let diffTime = examDate.getTime() - new Date().getTime();
    let diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)); 
    if (diffDays >= 0) {
        document.getElementById('cdDays').textContent = diffDays;
        document.getElementById('gsatCountdown').style.display = 'block';
    }

    if (AppState.auth.user) {
        const resProf = await profPromise;
        if(resProf && resProf.success) { renderGlobalProfile(resProf); }
    }

    document.getElementById('splashScreen').classList.add('hidden');
    if (AppState.auth.user) { showView('setupView', true); } else { showView('loginView'); }
};

// 🎯 這裡補回被我手殘刪掉的年級更新彈跳視窗
function showGradeUpdatePopup() {
    Swal.fire({
        title: '🚀 系統大升級：賽季天梯啟動！',
        html: `
            <div style="text-align:left; margin-bottom:15px; font-size:0.95em; color:var(--text-muted); line-height:1.5;">
                各位 VocabMaster 的老玩家們！我們推出了全新的<b>「學測賽季制」</b>與<b>「同屆排行榜」</b>！<br><br>為了讓你有更公平的競爭環境，請告訴我們你<b>現在的年級</b>：
            </div>
            <select id="swal-upgrade-grade" class="swal2-select" style="width: 100%; max-width: 100%; margin:0;">
                <option value="0">高三 (Senior 3)</option>
                <option value="1">高二 (Senior 2)</option>
                <option value="2">高一 (Senior 1)</option>
                <option value="3">國三 (Junior 3)</option>
                <option value="4">國二 (Junior 2)</option>
                <option value="5">國一 (Junior 1)</option>
                <option value="-1">已畢業 (隱藏排行榜)</option>
            </select>
        `,
        confirmButtonText: '進入新賽季！',
        allowOutsideClick: false,
        allowEscapeKey: false,
        preConfirm: () => {
            const g = document.getElementById('swal-upgrade-grade').value;
            if (!g) { Swal.showValidationMessage('請選擇年級！'); }
            return g;
        }
    }).then((result) => {
        if (result.isConfirmed) {
            showLoading('資料轉移中...');
            let tYear = calculateTargetYear(result.value);
            apiCall('updateUserCredentials', { username: AppState.auth.user, newTargetYear: tYear }).then(r => {
                Swal.close();
                if(r.success) {
                    localStorage.setItem('gradeUpdated_' + AppState.auth.user, 'true');
                    AppState.profile.targetYear = tYear;
                    Swal.fire('升級成功！', '快去排行榜看看你的同屆對手吧！', 'success');
                    showView('profileView'); 
                } else { Swal.fire('錯誤', r.message, 'error'); }
            });
        }
    });
}

function renderGlobalProfile(resProf) {
    AppState.profile.cache = resProf;
    const xp = parseInt(resProf.totalXP) || 0;
    const level = Math.floor(Math.sqrt(xp / 10)) + 1;
    
    if (AppState.profile.level !== null && level > AppState.profile.level) {
        Swal.fire({ title: '🎊 恭喜升級！ 🎊', html: `太神啦！你的等級提升到了 <b>Level ${level}</b>！<br>繼續保持這個氣勢！`, icon: 'success', confirmButtonColor: '#f59e0b', confirmButtonText: '繼續刷題' });
        document.getElementById('quickLevel').classList.add('level-up-anim');
        setTimeout(() => document.getElementById('quickLevel').classList.remove('level-up-anim'), 1500);
    }
    AppState.profile.level = level;
    AppState.profile.targetYear = resProf.targetYear;

    document.getElementById('quickLevel').textContent = `Lv. ${level}`;
    document.getElementById('quickXP').textContent = `${xp} XP`;
    document.getElementById('profileUsernameDisplay').textContent = AppState.auth.user; 

    const av = resProf.avatar || '👤'; 
    const avDiv = document.getElementById('profileAvatarPreview'); 
    if(avDiv) {
        if(av.startsWith('data:image') || av.startsWith('http')){ avDiv.innerHTML = `<img src="${av}" style="width:100px; height:100px; border-radius:50%; object-fit:cover;">`; } else { avDiv.innerHTML = av; } 
    }
    
    const currentLevelBaseXP = Math.pow(level - 1, 2) * 10; 
    const nextLevelXP = Math.pow(level, 2) * 10; 
    const xpProgress = ((xp - currentLevelBaseXP) / (nextLevelXP - currentLevelBaseXP)) * 100; 

    const profileLevelDisplay = document.getElementById('profileLevelDisplay');
    if(profileLevelDisplay) {
        profileLevelDisplay.innerHTML = `<div style="font-size: 1.5em; font-weight: 800; color: var(--secondary-color); margin-bottom: 8px;">Lv. ${level}</div><div style="background: var(--border-color); border-radius: 10px; height: 12px; width: 85%; margin: 0 auto 8px auto; overflow: hidden; position: relative;"><div style="background: var(--secondary-color); width: ${xpProgress}%; height: 100%; border-radius: 10px; transition: 1s ease-out;"></div></div><div style="font-size: 0.9em; font-weight: bold; color: var(--text-muted); margin-bottom: 20px;">XP: ${xp} / ${nextLevelXP}</div>`; 
    }
    
    const profileStatsDisplay = document.getElementById('profileStatsDisplay');
    if(profileStatsDisplay) {
        profileStatsDisplay.innerHTML = `<div style="display:flex; justify-content:center; gap: 40px; margin-bottom: 15px;"><div style="text-align:center;"><div style="font-size:1.6em; font-weight:800; color:var(--text-main);">${resProf.totalAnswered}</div><div style="font-size:0.85em; font-weight:600; color:var(--text-muted);">總答題數</div></div><div style="text-align:center;"><div style="font-size:1.6em; font-weight:800; color:var(--text-main);">${resProf.correctRate}</div><div style="font-size:0.85em; font-weight:600; color:var(--text-muted);">答對率</div></div></div>`; 
    }

    let targetYear = resProf.targetYear;
    let baseYear = getBaseAcadYear(); 
    let offset = targetYear - baseYear - 1;
    let gradeStr = (targetYear === 0 || offset < 0) ? "已畢業" : (offset === 0 ? "高三" : offset === 1 ? "高二" : offset === 2 ? "高一" : offset === 3 ? "國三" : offset === 4 ? "國二" : offset === 5 ? "國一" : "小學或以下");
    
    const profCurrentGrade = document.getElementById('profCurrentGrade');
    if(profCurrentGrade) profCurrentGrade.textContent = (targetYear === 0) ? `已畢業 (不參與排行)` : `${gradeStr} (目標：${targetYear} 學測)`;

    const quotaInfoBox = document.getElementById('quotaInfoBox');
    if(quotaInfoBox && resProf.hasApiKey !== undefined) {
        if (resProf.hasApiKey) { quotaInfoBox.innerHTML = '<div style="color:var(--secondary-color); font-weight:bold; text-align:center; padding:15px;">✅ 您已綁定專屬 API Key，解鎖無限次數！</div>'; } 
        else { document.getElementById('qTutor').textContent = `今日已用: ${resProf.tutorUsed} / 2 次`; document.getElementById('qEssay').textContent = `今日已用: ${resProf.essayUsed} / 1 篇`; } 
    }

    if (resProf.needsGradeUpdate && !localStorage.getItem('gradeUpdated_' + AppState.auth.user)) {
        showGradeUpdatePopup();
    }
}

function refreshProfileData() {
    if (!AppState.auth.user || AppState.auth.user === '訪客' || AppState.profile.isSaving) return;
    apiCall('getProfileData', { username: AppState.auth.user }).then(res => { 
        if(res.success && !AppState.profile.isSaving) { renderGlobalProfile(res); } 
    }); 
}

function toggleMenu() {
    const menu = document.getElementById('navMenu');
    const overlay = document.getElementById('navMenuOverlay');
    if (menu.classList.contains('show')) { menu.classList.remove('show'); overlay.classList.remove('show'); } 
    else { menu.classList.add('show'); overlay.classList.add('show'); }
}

function getPureWord(rawWord) { return rawWord ? rawWord.toString().replace(/\s+\(?\b(adj|adv|n|v|prep|conj|pron|phr|vi|vt|num|art)\b.*$/i, '').trim() : ''; }
function getSpellBaseWord(rawWord) { let w = getPureWord(rawWord); w = w.replace(/\(.*?\)/g, ''); w = w.split('/')[0]; return w.trim(); }
function speakWord(text, rate = 0.85) { if (!('speechSynthesis' in window)) return; window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; u.rate = rate; window.speechSynthesis.speak(u); }
function playCurrentWordAudio(isSlow = false) { speakWord(getSpellBaseWord(AppState.quiz.data[AppState.quiz.currentIndex].correctWord), isSlow ? 0.4 : 0.85); }

const VIEW_IDS = ['loginView', 'registerView', 'setupView', 'quizView', 'resultView', 'reviewPage', 'vocabBookView', 'pastExamsView', 'examTakingView', 'examResultView', 'aiEssayView', 'aiTutorView', 'profileView', 'leaderboardView'];

function showView(viewId, isFromInit = false) {
    const menu = document.getElementById('navMenu');
    const overlay = document.getElementById('navMenuOverlay');
    if(menu) menu.classList.remove('show');
    if(overlay) overlay.classList.remove('show');
    
    VIEW_IDS.forEach(id => document.getElementById(id).classList.remove('active'));
    document.getElementById(viewId).classList.add('active');

    if (AppState.auth.user) {
        document.getElementById('topNavbar').style.display = 'flex';
        document.getElementById('navWelcome').textContent = `👋 ${AppState.auth.user}`;
        if(viewId === 'quizView' || viewId === 'examTakingView') document.getElementById('topNavbar').style.display = 'none';
        document.getElementById('quickName').textContent = AppState.auth.user;
        if (viewId !== 'quizView' && viewId !== 'examTakingView' && !isFromInit) refreshProfileData();
    } else { 
        document.getElementById('topNavbar').style.display = 'none'; 
    }

    if (viewId === 'profileView' && AppState.profile.cache) renderGlobalProfile(AppState.profile.cache);
    if (viewId === 'reviewPage') loadIncorrectQuestions();
    if (viewId === 'leaderboardView') loadLeaderboardData();
    if (viewId === 'vocabBookView') backToVocabHome(); 
    if (viewId === 'pastExamsView') backToExamLobby();
    window.scrollTo(0, 0);
}

// 歷屆試題邏輯
async function fetchExamData(year) {
    document.getElementById('examLobby').style.display = 'none'; document.getElementById('examPreRoom').style.display = 'none'; document.getElementById('examLoading').style.display = 'block';
    try {
        const url = `https://yangbrian01.github.io/GSAT-english.exam/assets/exams/${year}.json?t=${new Date().getTime()}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`考卷 (${year}.json) 還沒準備好喔！`);
        AppState.exam.data = await response.json();
        document.getElementById('examLoading').style.display = 'none';
        document.getElementById('examTitle').textContent = AppState.exam.data.title || `${year} 學年度 英文考科`;
        document.getElementById('examPreRoom').style.display = 'block';
    } catch (e) {
        document.getElementById('examLoading').style.display = 'none'; document.getElementById('examLobby').style.display = 'grid'; Swal.fire('讀取失敗', e.message, 'error');
    }
}

function backToExamLobby() {
    AppState.exam.data = null; clearInterval(AppState.exam.timer);
    if(document.getElementById('examPreRoom')) document.getElementById('examPreRoom').style.display = 'none';
    if(document.getElementById('examLobby')) document.getElementById('examLobby').style.display = 'grid';
    if(document.getElementById('examLoading')) document.getElementById('examLoading').style.display = 'none';
}

function startFullExam() {
    if (!AppState.exam.data) return Swal.fire('錯誤', '沒有考卷資料！', 'error');
    AppState.quiz.isSubmitting = false; 
    document.getElementById('inExamTitleDisplay').textContent = AppState.exam.data.title;
    AppState.exam.answers = {};
    AppState.exam.endTime = Date.now() + 100 * 60 * 1000; 
    
    renderExamPaper(); showView('examTakingView');
    clearInterval(AppState.exam.timer); updateTimerDisplay();
    
    AppState.exam.timer = setInterval(() => {
        let timeLeft = Math.round((AppState.exam.endTime - Date.now()) / 1000);
        if (timeLeft <= 0) { timeLeft = 0; clearInterval(AppState.exam.timer); Swal.fire('時間到！', '考試結束，系統將自動交卷', 'warning').then(() => { processExamSubmission(); }); }
        updateTimerDisplay(timeLeft);
    }, 1000);
}

function updateTimerDisplay(timeLeft) {
    if(timeLeft === undefined) timeLeft = Math.max(0, Math.round((AppState.exam.endTime - Date.now()) / 1000));
    let m = Math.floor(timeLeft / 60); let s = timeLeft % 60;
    document.getElementById('examCountdownText').textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    document.getElementById('examCountdownText').style.color = timeLeft < 600 ? '#991b1b' : 'var(--danger-color)';
}

function buildPassageSection(item, groupId) {
    let sharedOpts = item.options || null;
    let html = `<div class="exam-topic-split"><div class="exam-topic-left">`;
    if (item.title || item.topic) html += `<h3 style="margin-bottom:10px;">${item.title || item.topic}</h3>`;
    if (item.article) html += `<p style="line-height:1.8; font-size:1.05em; color:var(--text-main);">${item.article.replace(/\/n|\n/g, '<br>')}</p>`;
    if (item.articleImageUrl) html += `<img src="${item.articleImageUrl}" style="max-width:100%; border-radius:8px; margin-top:15px;">`;
    if (sharedOpts) {
        html += `<div style="background:var(--bg-color); padding: 15px; border-radius: 8px; margin-top: 15px; border: 1px solid var(--border-color);"><strong style="color:var(--primary-color);">【選項區】</strong><br>`;
        sharedOpts.forEach(opt => { html += `<span style="display:inline-block; margin-right: 15px; margin-top: 5px; font-weight:600;">${opt}</span>`; });
        html += `</div>`;
    }
    html += `</div><div class="exam-topic-right">`;
    if (item.questions) { item.questions.forEach(q => { html += buildExamQuestionHtml(q, sharedOpts, groupId); }); }
    html += `</div></div>`;
    return html;
}

function renderExamPaper() {
    const container = document.getElementById('examPaperContent'); let html = '';
    if(AppState.exam.data && AppState.exam.data.examData) {
        AppState.exam.data.examData.forEach(part => {
            html += `<h2 class="exam-section-title">${part.section}</h2>`;
            if(part.questions && !part.topics && !part.article) part.questions.forEach(q => { html += buildExamQuestionHtml(q); });
            if(part.topics) part.topics.forEach(topic => { html += buildPassageSection(topic, 'topic_' + (topic.id ? topic.id.replace(/\W/g, '_') : Math.floor(Math.random()*1000))); });
            if(part.article && !part.topics) html += buildPassageSection(part, 'part_' + Math.floor(Math.random()*1000));
            if(part.translation) {
                html += `<div class="exam-topic-split"><div class="exam-topic-left" style="border:none;"><h3 style="margin-bottom:15px;">中譯英</h3>`;
                part.translation.forEach(t => { html += `<p style="font-weight:bold; margin-bottom:10px;">${t.id}. ${t.chinese}</p><textarea class="exam-text-input" id="exam_ans_${t.id}" onchange="AppState.exam.answers['${t.id}'] = this.value" placeholder="請在此輸入英文翻譯..."></textarea>`; });
                html += `</div></div>`;
            }
            if(part.essay) {
                html += `<div class="exam-topic-split" style="flex-direction:column;"><h3 style="margin-bottom:10px;">英文作文: ${part.essay.topic}</h3><p style="margin-bottom:15px; color:var(--text-muted);">${part.essay.description}</p>`;
                if(part.essay.imageUrls) { html += `<div style="display:flex; gap:10px; margin-bottom:15px; flex-wrap:wrap;">`; part.essay.imageUrls.forEach(img => html += `<img src="${img}" style="max-width:30%; border-radius:8px;">`); html += `</div>`; }
                html += `<textarea class="exam-text-input" id="exam_ans_essay" style="min-height:250px;" onchange="AppState.exam.answers['essay'] = this.value" placeholder="請在此撰寫您的英文作文..."></textarea></div>`;
            }
        });
    }
    container.innerHTML = html;
}

function buildExamQuestionHtml(q, sharedOptions, groupId) {
    let qTitleText = q.question ? q.question.replace(/\/n|\n/g, '<br>') : '請依據左文選出 / 填寫最適當的答案：';
    let qHtml = `<div class="exam-q-block"><div class="exam-q-title">${q.id}. ${qTitleText}</div>`;
    if(q.questionImageUrl) qHtml += `<img src="${q.questionImageUrl}" style="max-width:100%; border-radius:8px; margin-bottom:10px;">`;
    
    if (q.answers) {
        Object.keys(q.answers).forEach(k => { qHtml += `<div style="margin-bottom: 10px; display:flex; align-items:center; gap: 10px;"><strong style="font-size: 1.1em; color:var(--primary-color);">${k}.</strong> <input type="text" class="exam-text-input" style="margin-bottom: 0;" placeholder="輸入第 ${k} 格答案" onchange="AppState.exam.answers['${k}'] = this.value"></div>`; });
    } else if (q.options) {
        q.options.forEach((opt, idx) => {
            let optContent = opt;
            if(q.optionImageUrls && q.optionImageUrls[idx]) optContent = `<span>${opt}</span><br><img src="${q.optionImageUrls[idx]}" style="max-width:150px; margin-top:5px; border-radius:5px;">`;
            let val = opt.match(/\(([A-Z])\)/) ? opt.match(/\(([A-Z])\)/)[1] : opt;
            qHtml += `<label class="exam-radio-label"><input type="radio" name="exam_q_${q.id}" value="${val}" onchange="AppState.exam.answers['${q.id}'] = this.value"> <span>${optContent}</span></label>`;
        });
    } else if (sharedOptions && sharedOptions.length > 0) {
        qHtml += `<select class="exam-text-input shared-dropdown-${groupId}" onchange="handleSharedDropdownChange('${groupId}', '${q.id}', this)" style="cursor:pointer; background-color: var(--card-bg);"><option value="">請選擇...</option>`;
        sharedOptions.forEach(opt => { let val = opt.match(/\(([A-Z])\)/) ? opt.match(/\(([A-Z])\)/)[1] : opt.split(' ')[0]; qHtml += `<option value="${val}">${opt}</option>`; });
        qHtml += `</select>`;
    } else { qHtml += `<input type="text" class="exam-text-input" placeholder="輸入答案 (如 ADE 或單字)" onchange="AppState.exam.answers['${q.id}'] = this.value">`; }
    return qHtml + `</div>`;
}

function handleSharedDropdownChange(groupId, qId, selectElem) {
    AppState.exam.answers[qId] = selectElem.value;
    let selects = document.querySelectorAll(`.shared-dropdown-${groupId}`);
    let selectedValues = Array.from(selects).map(s => s.value).filter(v => v);
    selects.forEach(s => {
        s.querySelectorAll('option').forEach(opt => {
            if (opt.value === "") return;
            if (selectedValues.includes(opt.value) && s.value !== opt.value) { opt.disabled = true; opt.style.color = '#94a3b8'; } 
            else { opt.disabled = false; opt.style.color = ''; }
        });
    });
}

function forceSubmitExam() { Swal.fire({ title: '確定要交卷嗎？', text: "交卷後無法修改答案，未作答的題目將以 0 分計算。", icon: 'warning', showCancelButton: true, confirmButtonColor: '#10b981', confirmButtonText: '確定交卷', cancelButtonText: '繼續作答' }).then((result) => { if (result.isConfirmed) { clearInterval(AppState.exam.timer); processExamSubmission(); } }); }
function getQuestionScoreInfo(qId) { let id = parseInt(qId); if (isNaN(id)) return { max: 0, type: 'none' }; if (id >= 1 && id <= 30) return { max: 1, type: 'single' }; if (id >= 31 && id <= 46) return { max: 2, type: 'single' }; if (id === 47 || id === 48 || id === 50) return { max: 2, type: 'fill' }; if (id === 49) return { max: 4, type: 'multi', opts: 5 }; return { max: 0, type: 'none' }; }

async function processExamSubmission() {
    if (AppState.quiz.isSubmitting) return; AppState.quiz.isSubmitting = true;
    showLoading('正在為您閱卷與結算分數 (包含 AI 手寫批改)...');
    let rawScore = 0; let detailHtml = ''; let flatQuestions = [];
    
    AppState.exam.data.examData.forEach(part => {
        const addQ = (q) => { if (q.answers) { for(let k in q.answers) { flatQuestions.push({ id: k, answer: q.answers[k], explanation: q.explanation }); } } else if (q.answer) { flatQuestions.push({ id: q.id, answer: q.answer, explanation: q.explanation }); } };
        if(part.questions) part.questions.forEach(addQ);
        if(part.topics) part.topics.forEach(t => t.questions && t.questions.forEach(addQ));
    });

    flatQuestions.forEach(q => {
        if(q.id.startsWith('Q') || q.id.startsWith('T') || q.id === 'essay' || isNaN(parseInt(q.id))) return; 
        let rawUAns = (AppState.exam.answers[q.id] || '').trim(); let rawCAns = String(q.answer).trim();
        let uAns = rawUAns.toUpperCase(); let cAns = rawCAns.toUpperCase();
        let info = getQuestionScoreInfo(q.id); let qScore = 0; let isCorr = false;

        if (info.type === 'single' || info.type === 'fill') { if (uAns === cAns && uAns !== '') { qScore = info.max; isCorr = true; } } 
        else if (info.type === 'multi') {
            let uArr = uAns.replace(/[^A-E]/g, '').split(''); let cArr = cAns.replace(/[^A-E]/g, '').split('');
            let allOptions = "ABCDE".substring(0, info.opts).split(''); let k = 0; 
            allOptions.forEach(opt => { if (uArr.includes(opt) !== cArr.includes(opt)) k++; });
            qScore = ((info.opts - 2 * k) / info.opts) * info.max;
            if (qScore < 0 || uArr.length === 0) qScore = 0; 
            if (qScore === info.max) isCorr = true; else if (qScore > 0) isCorr = 'partial';
        }
        rawScore += qScore;
        let icon = isCorr === true ? '<span style="color:#10b981;">✔ 答對</span>' : isCorr === 'partial' ? `<span style="color:#d97706;">(部分給分得 ${qScore} 分)</span>` : '<span style="color:#ef4444;">✘ 答錯</span>';
        detailHtml += `<div style="padding: 15px; border-bottom: 1px solid var(--border-color); margin-bottom: 10px; background: var(--card-bg); border-radius: 8px;"><h4 style="margin-bottom: 8px; color: var(--text-main);">第 ${q.id} 題 ${icon}</h4><p style="font-size: 0.95em; color: var(--text-muted); margin-bottom: 8px;">你的答案: <span style="color:${isCorr?'#10b981':'#ef4444'}; font-weight:bold;">${rawUAns||'未作答'}</span> | 正確答案: <strong style="color:var(--text-main);">${rawCAns}</strong></p><div style="font-size: 0.9em; color: var(--text-muted); background: var(--bg-color); padding: 10px; border-radius: 5px;">${q.explanation||'無提供解析'}</div></div>`;
    });

    let transData = []; let essayUserText = AppState.exam.answers['essay'] || ''; let essayTopicText = '';
    AppState.exam.data.examData.forEach(part => {
        if(part.translation) part.translation.forEach(t => { transData.push({ id: t.id, chinese: t.chinese, correct: t.answer, user: AppState.exam.answers[t.id] || '' }); });
        if(part.essay) essayTopicText = part.essay.topic + " " + part.essay.description;
    });

    let transScoreTotal = 0; let essayScoreFinal = 0;
    let hasHandwritten = transData.some(t => t.user.trim().length > 0) || essayUserText.trim().length > 0;

    if (hasHandwritten && AppState.auth.user !== '訪客') {
        try {
            let aiRes = await apiCall('aiMockExamGrading', { username: AppState.auth.user, translations: transData, essayText: essayUserText, essayTopic: essayTopicText });
            if (aiRes.success && aiRes.data) {
                detailHtml += `<div style="margin-top:20px; border-top: 3px solid var(--border-color); padding-top: 20px;"><h3 style="color:var(--primary-color); margin-bottom: 15px;">✍️ AI 手寫題批改結果</h3>`;
                if (aiRes.data.translations) {
                    aiRes.data.translations.forEach((tr, idx) => {
                        let tInfo = transData[idx]; transScoreTotal += tr.score;
                        detailHtml += `<div style="padding: 15px; border-bottom: 1px solid var(--border-color); margin-bottom: 10px; background: var(--card-bg); border-radius: 8px;"><h4 style="margin-bottom: 8px; color: var(--text-main);">翻譯第 ${idx+1} 題 <span style="color:var(--secondary-color); margin-left:5px;">得分: ${tr.score} / 4</span></h4><p style="font-size: 0.9em; color: var(--text-muted); margin-bottom: 5px;">題目: ${tInfo.chinese}</p><p style="font-size: 0.95em; color: var(--text-muted); margin-bottom: 8px;">你的作答: <span style="font-weight:bold; color:var(--text-main);">${tInfo.user || '未作答'}</span></p><p style="font-size: 0.95em; color: #10b981; margin-bottom: 8px;">標準答案: <strong>${tInfo.correct}</strong></p><div style="font-size: 0.9em; color: var(--text-muted); background: var(--bg-color); padding: 10px; border-radius: 5px;">🤖 AI 建議: ${tr.feedback}</div></div>`;
                    });
                }
                if (aiRes.data.essay) {
                    essayScoreFinal = aiRes.data.essay.score;
                    detailHtml += `<div style="padding: 15px; border-bottom: 1px solid var(--border-color); margin-bottom: 10px; background: var(--card-bg); border-radius: 8px;"><h4 style="margin-bottom: 8px; color: var(--text-main);">英文作文 <span style="color:var(--secondary-color); margin-left:5px;">得分: ${essayScoreFinal} / 20</span></h4><div style="font-size: 0.9em; color: var(--text-muted); background: var(--bg-color); padding: 10px; border-radius: 5px; margin-bottom: 10px; max-height: 100px; overflow-y:auto;">你的作答: ${essayUserText || '未作答'}</div><div style="font-size: 0.95em; color: #b45309; background: #fef3c7; padding: 10px; border-radius: 5px; font-weight:600;">🤖 AI 總評: ${aiRes.data.essay.feedback}</div></div>`;
                }
                detailHtml += `</div>`;
            } else { detailHtml += `<div style="color: var(--danger-color); padding: 10px; font-weight:bold;">AI 批改失敗，手寫題暫以 0 分計算。(${aiRes.message})</div>`; }
        } catch(e) { detailHtml += `<div style="color: var(--danger-color); padding: 10px; font-weight:bold;">AI 連線異常，手寫題暫以 0 分計算。</div>`; }
    } else if (hasHandwritten && AppState.auth.user === '訪客') { detailHtml += `<div style="color: var(--danger-color); padding: 10px; font-weight:bold;">訪客模式不支援 AI 手寫批改，手寫題以 0 分計算。請註冊登入。</div>`; } 
    else { detailHtml += `<div style="color: var(--text-muted); padding: 10px; font-weight:bold; background:var(--bg-color); border-radius:8px; text-align:center; margin-top:20px;">未作答手寫題，以 0 分計算。</div>`; }

    rawScore += transScoreTotal + essayScoreFinal; rawScore = parseFloat(rawScore.toFixed(2));
    let finalLevel = 1; const curve = AppState.exam.data.gradingCurve;
    for(let i=15; i>=1; i--) {
        let rangeStr = curve[`level${i}`]; if(!rangeStr) continue;
        let matches = rangeStr.match(/([\d\.]+)\s*<\s*X\s*≤\s*([\d\.]+)/);
        if(matches) { let min = parseFloat(matches[1]); let max = parseFloat(matches[2]); if(rawScore > min && rawScore <= max) { finalLevel = i; break; } }
    }

    Swal.close();
    let selectScoreDisplay = rawScore - (transScoreTotal + essayScoreFinal);
    document.getElementById('examRawScore').innerHTML = `選擇與混合題得分: <strong style="color:var(--primary-color);">${selectScoreDisplay.toFixed(2)} / 72</strong><br>手寫題得分: <strong style="color:var(--primary-color);">${(transScoreTotal + essayScoreFinal)} / 28</strong><br>總原始分: <span style="font-size:1.3em; font-weight:800;">${rawScore}</span>`;
    document.getElementById('examLevelScore').textContent = `${finalLevel} 級分`;
    document.getElementById('examDetailResults').innerHTML = detailHtml;
    
    if (AppState.auth.user !== '訪客') {
        let gainedXP = Math.floor(rawScore);
        document.getElementById('examXPReward').textContent = `🔥 歷屆通關獎勵：賺取 +${gainedXP} XP`;
        if(gainedXP > 0) {
            let mockSubmitData = []; for(let i=0; i<gainedXP; i++) mockSubmitData.push({ isCorrect: true, level: 1 });
            if (AppState.profile.cache) {
                AppState.profile.cache.totalXP = parseInt(AppState.profile.cache.totalXP || 0) + gainedXP;
                renderGlobalProfile(AppState.profile.cache); 
            }
            AppState.profile.isSaving = true; 
            apiCall('saveQuizResult', { username: AppState.auth.user, quizSubmissionData: mockSubmitData, isReviewMode: false }).then(() => {
                AppState.profile.isSaving = false; refreshProfileData(); 
            });
        }
    }
    showView('examResultView');
}

// 🎯 一般測驗邏輯
function startGame(isReview = false) { 
    AppState.quiz.isSubmitting = false; AppState.quiz.isReviewMode = isReview; const activeMode = isReview ? '1' : document.getElementById('quizModeSelect').value; 
    if (isReview) { showLoading('生成記憶複習卷...'); apiCall('getReviewQuestions', { username: AppState.auth.user }).then(res => processQuizData(res)); } 
    else { const num = parseInt(document.getElementById('numQuestionsInput').value); const diff = document.getElementById('difficultySelect').value; if (isNaN(num) || num < 1) return Swal.fire('錯誤', '題數無效', 'warning'); showLoading('抽取題目中...'); apiCall('getAllQuestions', { numQuestions: num, sessionToken: AppState.auth.token, mode: diff, quizType: activeMode }).then(res => processQuizData(res)); } 
}
function processQuizData(res) { Swal.close(); if (res.error || !res.success && res.message) { Swal.fire('提示', res.error || res.message, 'info'); return; } AppState.quiz.data = res.questions; AppState.quiz.total = res.totalQuestions; if (AppState.quiz.data.length > 0) { AppState.quiz.currentIndex = 0; AppState.quiz.answers = {}; document.getElementById('totalQNum').textContent = AppState.quiz.total; showView('quizView'); renderQuestion(0); } }

document.addEventListener('selectionchange', () => { if (document.activeElement && document.activeElement.id === 'typingInput') updateSpellVisual(); });

function initSpellTemplate(word) { 
    const pureWord = getSpellBaseWord(word); AppState.quiz.spellTemplate = []; 
    for(let i=0; i<pureWord.length; i++) { 
        const char = pureWord[i]; 
        if (/[^a-zA-Z]/.test(char)) { AppState.quiz.spellTemplate.push(char); } 
        else { 
            let start = i, end = i; 
            while(start > 0 && /[a-zA-Z]/.test(pureWord[start-1])) start--; 
            while(end < pureWord.length - 1 && /[a-zA-Z]/.test(pureWord[end+1])) end++; 
            if (end - start + 1 <= 2 || i === start || i === end) AppState.quiz.spellTemplate.push(char); else AppState.quiz.spellTemplate.push('_'); 
        } 
    } 
}
function updateSpellVisual() { const input = document.getElementById('typingInput'); const val = input.value.toLowerCase(); const cursorPos = input.selectionStart || 0; let displayStr = ""; let typedIndex = 0; for(let i=0; i<AppState.quiz.spellTemplate.length; i++) { if (AppState.quiz.spellTemplate[i] === ' ') { displayStr += "&nbsp;&nbsp;"; continue; } if (AppState.quiz.spellTemplate[i] !== '_') { displayStr += AppState.quiz.spellTemplate[i] + " "; continue; } if (typedIndex === cursorPos) displayStr += `<span class="spell-cursor"></span>`; if (typedIndex < val.length) displayStr += `<span style="color:var(--danger-color); pointer-events: auto; cursor:pointer;" onclick="setSpellCursor(${typedIndex}, event)">${val[typedIndex]}</span> `; else displayStr += `<span style="color:var(--text-muted); opacity: 0.5; pointer-events: auto; cursor:pointer;" onclick="setSpellCursor(${val.length}, event)">_</span> `; typedIndex++; } if (cursorPos === typedIndex) displayStr += `<span class="spell-cursor"></span>`; document.getElementById('spellVisual').innerHTML = displayStr; }
function focusTypingInput(e) { const input = document.getElementById('typingInput'); input.focus(); setTimeout(() => { const len = input.value.length; input.setSelectionRange(len, len); updateSpellVisual(); }, 10); }
function setSpellCursor(index, event) { if (event) { event.preventDefault(); event.stopPropagation(); } const input = document.getElementById('typingInput'); input.focus(); setTimeout(() => { input.setSelectionRange(index, index); updateSpellVisual(); }, 10); }
function getSpellAnswer() { return document.getElementById('typingInput').value.trim(); }

function renderQuestion(index) { document.getElementById('nextButton').disabled = false; clearTimeout(AppState.quiz.timer); AppState.quiz.currentIndex = index; const q = AppState.quiz.data[index]; document.getElementById('currentQNum').textContent = index + 1; document.getElementById('quizInstruction').textContent = (AppState.quiz.isReviewMode ? `🧠 記憶覆測：` : '') + q.instruction; const meaningDisplay = document.getElementById('meaningDisplay'); const optContainer = document.getElementById('optionsContainer'); const spellArea = document.getElementById('spellVisualArea'); const typingInput = document.getElementById('typingInput'); optContainer.style.display = 'none'; spellArea.style.display = 'none'; meaningDisplay.style.display = 'block'; if (q.qType === 'listen') { meaningDisplay.innerHTML = `<div style="display: flex; justify-content: center; align-items: center; gap: 20px; margin-bottom: 10px;"><div class="audio-only-btn" onclick="playCurrentWordAudio(false)" style="margin-bottom: 0; width: 120px; height: 120px;">🎧 <span style="font-size:0.25em; margin-top:8px; color:var(--text-muted);">正常</span></div><div class="audio-only-btn" onclick="playCurrentWordAudio(true)" style="margin-bottom: 0; width: 90px; height: 90px; font-size: 2em; border-color: var(--secondary-color);">🐌 <span style="font-size:0.3em; margin-top:5px; color:var(--text-muted);">慢速</span></div></div>`; setTimeout(() => playCurrentWordAudio(false), 400); optContainer.style.display = 'block'; renderOptionsUI(q, optContainer); } else if (q.qType === 'spell') { meaningDisplay.textContent = q.questionText; spellArea.style.display = 'flex'; initSpellTemplate(q.correctWord); typingInput.value = AppState.quiz.answers[q.id] || ''; typingInput.maxLength = AppState.quiz.spellTemplate.filter(c => c === '_').length; updateSpellVisual(); setTimeout(() => { typingInput.focus(); const len = typingInput.value.length; typingInput.setSelectionRange(len, len); updateSpellVisual(); }, 100); typingInput.onkeydown = function(e) { if (e.key === 'Enter') { e.preventDefault(); handleNextQuestion(); } }; typingInput.onkeyup = updateSpellVisual; typingInput.onclick = updateSpellVisual; } else { meaningDisplay.textContent = q.questionText; optContainer.style.display = 'block'; renderOptionsUI(q, optContainer); } updateNavButtons(); }
function renderOptionsUI(q, container) { container.innerHTML = ''; q.options.forEach(word => { const btn = document.createElement('button'); btn.className = `option-btn ${AppState.quiz.answers[q.id] === word ? 'selected' : ''}`; btn.textContent = word; btn.onclick = () => { AppState.quiz.answers[q.id] = word; Array.from(container.children).forEach(b => b.classList.remove('selected')); btn.classList.add('selected'); clearTimeout(AppState.quiz.timer); AppState.quiz.timer = setTimeout(() => { handleNextQuestion(); }, 400); }; container.appendChild(btn); }); }
function handleNextQuestion() { clearTimeout(AppState.quiz.timer); const q = AppState.quiz.data[AppState.quiz.currentIndex]; if (q.qType === 'spell') { AppState.quiz.answers[q.id] = getSpellAnswer(); } if (AppState.quiz.currentIndex < AppState.quiz.data.length - 1) { changeQuestion(1); } else { submitQuiz(); } }
function changeQuestion(delta) { const q = AppState.quiz.data[AppState.quiz.currentIndex]; if (q.qType === 'spell') { AppState.quiz.answers[q.id] = getSpellAnswer(); } const newIdx = AppState.quiz.currentIndex + delta; if (newIdx >= 0 && newIdx < AppState.quiz.data.length) renderQuestion(newIdx); }
function updateNavButtons() { const isLast = AppState.quiz.currentIndex === AppState.quiz.data.length - 1; document.getElementById('prevButton').disabled = AppState.quiz.currentIndex === 0; const nextBtn = document.getElementById('nextButton'); nextBtn.textContent = isLast ? '交卷送出' : '下一題'; nextBtn.className = isLast ? 'btn btn-success' : 'btn btn-primary'; }

function submitQuiz() { 
    document.getElementById('nextButton').disabled = true; 
    const q = AppState.quiz.data[AppState.quiz.currentIndex]; 
    if (q.qType === 'spell') AppState.quiz.answers[q.id] = getSpellAnswer(); 
    
    const unans = AppState.quiz.data.length - Object.keys(AppState.quiz.answers).filter(k => AppState.quiz.answers[k].trim() !== '').length; 
    if (unans > 0) { 
        Swal.fire({ title: `還有 ${unans} 題未完整作答！`, text: '確定要提早交卷嗎？', icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: '確定交卷', cancelButtonText: '繼續作答' }).then(r => { 
            if(r.isConfirmed) { processSubmit(); } else { document.getElementById('nextButton').disabled = false; } 
        }); 
    } else { processSubmit(); } 
}

function processSubmit() { 
    if (AppState.quiz.isSubmitting) return; AppState.quiz.isSubmitting = true;
    try {
        document.getElementById('nextButton').disabled = false; 
        let correctCount = 0; let gainedXP = 0; const submitData = []; const detailDiv = document.getElementById('detailResults'); detailDiv.innerHTML = ''; 
        AppState.quiz.data.forEach((q, i) => { 
            let uAns = AppState.quiz.answers[q.id] || ''; let isCorr = false; let displayUAns = uAns; 
            if (q.qType === 'spell') { 
                const pureWord = getSpellBaseWord(q.correctAnswer); let tempTypedIndex = 0; let reconstructedAnswer = ""; 
                for(let j=0; j<pureWord.length; j++) { 
                    let c = pureWord[j]; 
                    if (/[^a-zA-Z]/.test(c)) { reconstructedAnswer += c; } 
                    else { 
                        let start = j, end = j; 
                        while(start > 0 && /[a-zA-Z]/.test(pureWord[start-1])) start--; 
                        while(end < pureWord.length - 1 && /[a-zA-Z]/.test(pureWord[end+1])) end++; 
                        const wordLen = end - start + 1; 
                        if (wordLen <= 2 || j === start || j === end) { reconstructedAnswer += c; } else { reconstructedAnswer += (tempTypedIndex < uAns.length) ? uAns[tempTypedIndex] : "_"; tempTypedIndex++; } 
                    } 
                } 
                displayUAns = reconstructedAnswer; isCorr = (reconstructedAnswer.toLowerCase() === pureWord.toLowerCase()); 
            } else { isCorr = (uAns === q.correctAnswer); } 
            
            if (isCorr) { correctCount++; let base = parseInt(q.level) || 1; let bonus = q.qType === 'listen' ? 2 : (q.qType === 'spell' ? 5 : 0); gainedXP += (base + bonus); } 
            
            submitData.push({ questionId: q.id, qType: q.qType, level: q.level, questionText: q.qType === 'listen' ? '(🎧 純聽力題)' : q.questionText, userAnswer: displayUAns, correctAnswer: q.correctAnswer, correctWord: q.correctWord, correctMeaning: q.correctMeaning, isCorrect: isCorr }); 
            const safeEnWord = getPureWord(q.correctWord).replace(/'/g, "\\'"); 
            const displayTitle = q.qType === 'listen' ? `🎧 聽力題：<span style="color:var(--primary-color);">${q.correctWord}</span> <button onclick="speakWord('${safeEnWord}')" style="background:none;border:none;cursor:pointer;font-size:1.1em;vertical-align:middle;padding:0 5px;" title="重新聽一次">🔊</button>` : q.questionText; 
            detailDiv.innerHTML += `<div style="padding: 15px; border-bottom: 1px solid var(--border-color); margin-bottom: 10px; background: var(--card-bg); border-radius: 8px;"><h4 style="margin-bottom: 8px; color: var(--text-main); line-height: 1.4;">${i+1}. ${displayTitle} <span style="color:${isCorr?'#10b981':'#ef4444'}; margin-left:5px;">${isCorr?'✔':'✘'}</span></h4><p style="font-size: 0.9em; color: var(--text-muted);">正解: <strong style="color:var(--text-main);">${q.correctAnswer}</strong> ${!isCorr && displayUAns ? ` | 你答: <span style="color:#ef4444;">${displayUAns}</span>` : ''}</p></div>`; 
        }); 
        
        let hasBonus = false; 
        if (correctCount === AppState.quiz.total && AppState.quiz.total >= 10 && !AppState.quiz.isReviewMode) { hasBonus = true; } 
        if (correctCount === AppState.quiz.total && AppState.quiz.total >= 5 && !AppState.quiz.isReviewMode && AppState.auth.user !== '訪客') { Swal.fire('太神啦！', '滿分通關！', 'success'); } 
        else if (AppState.quiz.isReviewMode && correctCount > 0) { Swal.fire('記憶升級！', `成功推進了 ${correctCount} 題的進度！`, 'success'); } 
        
        if (AppState.auth.user !== '訪客' && AppState.profile.cache) {
            if (!AppState.quiz.isReviewMode) {
                let oldAns = parseInt(AppState.profile.cache.totalAnswered) || 0;
                let oldCorr = parseInt(AppState.profile.cache.totalCorrect) || 0;
                let oldXP = parseInt(AppState.profile.cache.totalXP) || 0;
                AppState.profile.cache.totalAnswered = oldAns + AppState.quiz.total;
                AppState.profile.cache.totalCorrect = oldCorr + correctCount;
                let finalXP = gainedXP + (hasBonus ? 20 : 0);
                AppState.profile.cache.totalXP = oldXP + finalXP;
                if(AppState.profile.cache.totalAnswered > 0) { AppState.profile.cache.correctRate = ((AppState.profile.cache.totalCorrect / AppState.profile.cache.totalAnswered) * 100).toFixed(2) + '%'; }
            }
            renderGlobalProfile(AppState.profile.cache); 
        }

        const xpDisplay = document.getElementById('xpGainedDisplay'); 
        if (!AppState.quiz.isReviewMode && AppState.auth.user !== '訪客' && (gainedXP > 0 || hasBonus)) { 
            if (hasBonus) { xpDisplay.innerHTML = `⚡ 狂賺 +${gainedXP} XP <div style="font-size: 0.55em; color: var(--secondary-color); margin-top: 8px;">🎉 10題全對額外紅利 +20 XP</div>`; } 
            else { xpDisplay.innerHTML = `⚡ 狂賺 +${gainedXP} XP`; } 
            xpDisplay.style.display = 'block'; 
        } else { xpDisplay.style.display = 'none'; } 
        
        document.getElementById('summary').textContent = `答對 ${correctCount} 題 / 共 ${AppState.quiz.total} 題`; showView('resultView'); 
        document.getElementById('scorePercentage').textContent = Math.round((correctCount / AppState.quiz.total) * 100) + '%'; drawChart(correctCount, AppState.quiz.total - correctCount); 
        
        if (AppState.auth.user !== '訪客') { 
            AppState.profile.isSaving = true; 
            apiCall('saveQuizResult', { username: AppState.auth.user, quizSubmissionData: submitData, isReviewMode: AppState.quiz.isReviewMode }).then(() => { AppState.profile.isSaving = false; refreshProfileData(); }); 
        } 
    } catch (e) { Swal.fire('發生錯誤', '交卷結算時發生異常：' + e.message, 'error'); console.error(e); }
}

function drawChart(correct, wrong) { const ctx = document.getElementById('scoreChart'); if (window.myChart) window.myChart.destroy(); window.myChart = new Chart(ctx, { type: 'doughnut', data: { labels: ['答對', '答錯'], datasets: [{ data: [correct, wrong], backgroundColor: ['#6366f1', '#e2e8f0'], borderWidth: 0 }] }, options: { responsive: true, cutout: '75%', plugins: { legend: { display: false } } } }); }

// 🎯 單字本與 AI 字典
function loadVocabFavorites() { 
    AppState.vocab.level = 0; document.getElementById('vocabHomeGrid').style.display = 'none'; 
    const renderFavs = (list) => {
        if (list.length === 0) { Swal.fire('空空如也', '目前還沒有收藏任何單字喔！', 'info'); backToVocabHome(); } 
        else { AppState.vocab.letterList = list; AppState.vocab.cardIndex = 0; document.getElementById('vocabFlashcardArea').style.display = 'block'; document.getElementById('vbBackToAzBtn').style.display = 'inline-block'; document.getElementById('vbBackToAzBtn').textContent = '返回首頁'; renderSingleVocabCard(); }
    };
    if (AppState.vocab.cache && AppState.vocab.cache.length > 0) { renderFavs(AppState.vocab.cache); } else { document.getElementById('vocabLoading').style.display = 'block'; }
    apiCall('getFavorites', { username: AppState.auth.user }).then(res => { 
        document.getElementById('vocabLoading').style.display = 'none'; 
        if (res.success) { 
            AppState.vocab.favorites.clear(); res.words.forEach(w => AppState.vocab.favorites.add(w.word)); AppState.vocab.cache = res.words;
            if (document.getElementById('vocabFlashcardArea').style.display === 'none' && !document.getElementById('vocabHomeGrid').style.display.includes('grid')) { renderFavs(res.words); }
        } 
    }); 
}
function backToVocabHome() { document.getElementById('vocabHomeGrid').style.display = 'grid'; document.getElementById('vocabNavArea').style.display = 'none'; document.getElementById('vocabFlashcardArea').style.display = 'none'; }
function backToAzGrid() { if (AppState.vocab.level === 0) backToVocabHome(); else { document.getElementById('vocabFlashcardArea').style.display = 'none'; document.getElementById('vocabNavArea').style.display = 'block'; } }
function loadVocabLevel(level) { AppState.vocab.level = level; document.getElementById('vocabHomeGrid').style.display = 'none'; document.getElementById('vocabLoading').style.display = 'block'; apiCall('getVocabByLevel', { level }).then(res => { document.getElementById('vocabLoading').style.display = 'none'; if (res.success && res.words.length > 0) { AppState.vocab.list = res.words; renderAzGrid(level); } else { Swal.fire('讀取失敗', '此級別尚無單字', 'error'); backToVocabHome(); } }); }
function renderAzGrid(level) { document.getElementById('vocabListTitle').textContent = `Level ${level} 單字庫`; document.getElementById('vocabNavArea').style.display = 'block'; const existingLetters = new Set(AppState.vocab.list.map(w => w.firstLetter)); const azGrid = document.getElementById('azGrid'); azGrid.innerHTML = ''; for (let i = 65; i <= 90; i++) { const char = String.fromCharCode(i); const btn = document.createElement('button'); btn.textContent = char; if (existingLetters.has(char)) { btn.className = 'az-btn'; btn.onclick = () => showLetterCards(char); } else { btn.className = 'az-btn disabled'; btn.disabled = true; } azGrid.appendChild(btn); } }
function showLetterCards(letter) { AppState.vocab.letterList = AppState.vocab.list.filter(w => w.firstLetter === letter); AppState.vocab.cardIndex = 0; document.getElementById('vocabNavArea').style.display = 'none'; document.getElementById('vocabFlashcardArea').style.display = 'block'; document.getElementById('vbBackToAzBtn').style.display = 'inline-block'; renderSingleVocabCard(); }
function openVocabSearch() { AppState.vocab.level = 0; Swal.fire({ title: '🔍 查單字', input: 'text', inputPlaceholder: '請輸入想查詢的單字', showCancelButton: true, confirmButtonText: '使用 AI 查詢', background: 'var(--card-bg)', color: 'var(--text-main)' }).then((result) => { if (result.isConfirmed && result.value) { AppState.vocab.letterList = [{ word: result.value, pureWord: getPureWord(result.value), meaning: '點擊展開 AI 解析' }]; AppState.vocab.cardIndex = 0; document.getElementById('vocabHomeGrid').style.display = 'none'; document.getElementById('vocabFlashcardArea').style.display = 'block'; document.getElementById('vbBackToAzBtn').textContent = '返回單字書首頁'; renderSingleVocabCard(); setTimeout(() => { document.getElementById('vbContainer').classList.add('flipped'); loadAiForCard(AppState.vocab.letterList[0].pureWord); }, 500); } }); }
function addCustomVocab() { Swal.fire({ title: '✍️ 加入自訂單字', html: '<input id="swal-word" class="swal2-input" placeholder="英文單字">' + '<input id="swal-meaning" class="swal2-input" placeholder="中文意思 (選填)">', focusConfirm: false, showCancelButton: true, confirmButtonText: '加入我的不熟單字', background: 'var(--card-bg)', color: 'var(--text-main)', preConfirm: () => { const w = document.getElementById('swal-word').value.trim(); if (!w) Swal.showValidationMessage('單字不能為空！'); return { word: w, meaning: document.getElementById('swal-meaning').value.trim() }; } }).then((result) => { if (result.isConfirmed) { const { word, meaning } = result.value; apiCall('toggleFavorite', { username: AppState.auth.user, word: word, meaning: meaning, isAdding: true }).then(() => { AppState.vocab.favorites.add(word); Swal.fire('已加入', '', 'success'); }); } }); }
function renderSingleVocabCard() { try { if (AppState.vocab.letterList.length === 0) return; const q = AppState.vocab.letterList[AppState.vocab.cardIndex]; const area = document.getElementById('vbCardContainer'); document.getElementById('vbCounter').textContent = `${AppState.vocab.cardIndex + 1} / ${AppState.vocab.letterList.length}`; document.getElementById('vbPrev').disabled = AppState.vocab.cardIndex === 0; document.getElementById('vbNext').disabled = AppState.vocab.cardIndex === AppState.vocab.letterList.length - 1; const isFav = AppState.vocab.favorites.has(q.word); const cleanWord = getPureWord(q.word); const safeEnWord = cleanWord.replace(/'/g, "\\'"); area.innerHTML = `<div class="flashcard-container" id="vbContainer" onclick="this.classList.toggle('flipped')"><div class="flashcard-inner"><div class="flashcard-front"><button class="speak-btn" style="position:absolute; top:15px; right:15px;" onclick="event.stopPropagation(); speakWord('${safeEnWord}')">🔊</button><button style="position:absolute; top:15px; left:15px; background:none; border:none; font-size:1.8em; cursor:pointer; color:${isFav?'#ef4444':'#cbd5e1'};" onclick="event.stopPropagation(); toggleFavOnCard('${q.word}', '${q.meaning}')" id="cardFavBtn">${isFav?'❤️':'🤍'}</button><div class="fc-word">${cleanWord}</div><div class="fc-hint">點擊翻面</div></div><div class="flashcard-back" style="overflow-y: auto;"><div class="fc-word" style="font-size:1.5em; margin-bottom:5px;">${q.meaning}</div><div id="aiBlock-${q.pureWord}" style="margin-top:15px; width:100%; text-align:left; font-size:0.9em; line-height:1.5; display:none;"><div id="aiSpinner-${q.pureWord}" style="text-align:center;"><div class="spinner" style="width:25px;height:25px;border-width:2px;"></div></div><div id="aiContent-${q.pureWord}" style="display:none; color: var(--text-main);"></div></div><button class="btn btn-secondary" style="margin-top: 15px; padding: 8px 15px; font-size:0.9em; width:auto;" onclick="event.stopPropagation(); loadAiForCard('${q.pureWord}')" id="aiBtn-${q.pureWord}">🤖 展開 AI 深度解析</button></div></div></div>`; const cardElement = document.getElementById('vbContainer'); cardElement.addEventListener('touchstart', e => { AppState.sys.touchStartX = e.changedTouches[0].screenX; }, {passive: true}); cardElement.addEventListener('touchend', e => { AppState.sys.touchEndX = e.changedTouches[0].screenX; if (AppState.sys.touchEndX < AppState.sys.touchStartX - 40 && AppState.vocab.cardIndex < AppState.vocab.letterList.length - 1) document.getElementById('vbNext').click(); if (AppState.sys.touchEndX > AppState.sys.touchStartX + 40 && AppState.vocab.cardIndex > 0) document.getElementById('vbPrev').click(); }, {passive: true}); } catch(e) { console.error(e); } }
function changeVocabCard(delta) { const newIdx = AppState.vocab.cardIndex + delta; if (newIdx >= 0 && newIdx < AppState.vocab.letterList.length) { AppState.vocab.cardIndex = newIdx; const wrapper = document.getElementById('vbSlideWrapper'); wrapper.classList.remove('slide-left', 'slide-right'); void wrapper.offsetWidth; wrapper.classList.add(delta > 0 ? 'slide-left' : 'slide-right'); renderSingleVocabCard(); } }
function toggleFavOnCard(word, meaning) { const btn = document.getElementById('cardFavBtn'); const isFav = AppState.vocab.favorites.has(word); if (isFav) { AppState.vocab.favorites.delete(word); btn.textContent = '🤍'; btn.style.color = '#cbd5e1'; } else { AppState.vocab.favorites.add(word); btn.textContent = '❤️'; btn.style.color = '#ef4444'; } apiCall('toggleFavorite', { username: AppState.auth.user, word: word, meaning: meaning, isAdding: !isFav }); }
function loadAiForCard(pureWord) { const btn = document.getElementById(`aiBtn-${pureWord}`); const block = document.getElementById(`aiBlock-${pureWord}`); const spinner = document.getElementById(`aiSpinner-${pureWord}`); const content = document.getElementById(`aiContent-${pureWord}`); if (btn) btn.style.display = 'none'; block.style.display = 'block'; if (content.innerHTML !== '') return; apiCall('aiDictionary', { username: AppState.auth.user, word: pureWord }).then(res => { spinner.style.display = 'none'; if (res.success && res.data) { content.innerHTML = `<div style="margin-bottom:8px;"><strong>📌 意思：</strong> <span style="color:var(--primary-color);">${res.data.primary}</span></div><div style="margin-bottom:8px;"><strong>🌱 衍生：</strong> <span>${res.data.derived}</span></div><div style="margin-bottom:8px;"><strong>💬 例句：</strong> <span style="font-weight:600;">${res.data.example}</span></div><div><strong style="color:var(--danger-color);">⚠️ 混淆：</strong> <span style="font-size:0.95em;">${res.data.confused}</span></div>${res.cached ? '<div style="text-align:right; font-size:0.7em; color:var(--text-muted); margin-top:5px;">⚡ 快取秒讀</div>' : ''}`; content.style.display = 'block'; } else { content.innerHTML = `<span style="color:var(--danger-color);">${res.message}</span>`; content.style.display = 'block'; if (btn) btn.style.display = 'block'; } }); }

// 🎯 AI 功能區
function gradeAiEssay() { const text = document.getElementById('essayInput').value.trim(); const topic = document.getElementById('essayTopicInput').value.trim(); if (text.length < 15) return Swal.fire('請認真作答', '內容太少啦！', 'warning'); const btn = document.getElementById('btnGradeEssay'); btn.disabled = true; document.getElementById('essayResult').style.display = 'none'; document.getElementById('essayLoading').style.display = 'block'; apiCall('aiEssayGrading', { username: AppState.auth.user, topic: topic, essayText: text }).then(res => { btn.disabled = false; document.getElementById('essayLoading').style.display = 'none'; if (res.success && res.data && res.data.scores) { document.getElementById('resEssayScore').textContent = `${res.data.scores.total} / 20`; document.getElementById('resEssayLevel').textContent = `整體評定：${res.data.level}`; document.getElementById('resEssayOverall').textContent = res.data.overallComment; document.getElementById('s-content').textContent = `${res.data.scores.content.score} / 5`; document.getElementById('a-content').textContent = res.data.scores.content.analysis; document.getElementById('s-org').textContent = `${res.data.scores.organization.score} / 5`; document.getElementById('a-org').textContent = res.data.scores.organization.analysis; document.getElementById('s-lang').textContent = `${res.data.scores.language.score} / 4`; document.getElementById('a-lang').textContent = res.data.scores.language.analysis; document.getElementById('s-gram').textContent = `${res.data.scores.grammar.score} / 3`; document.getElementById('a-gram').textContent = res.data.scores.grammar.analysis; document.getElementById('s-spell').textContent = `${res.data.scores.spelling.score} / 3`; document.getElementById('a-spell').textContent = res.data.scores.spelling.analysis; document.getElementById('resEssaySuggestions').textContent = res.data.suggestions; document.getElementById('resEssayKey').innerHTML = (res.data.keyImprovements || "").replace(/\n/g, '<br>'); document.getElementById('essayResult').style.display = 'block'; refreshProfileData(); } else { Swal.fire('批改失敗', res.message || 'AI 產生的格式異常，請再試一次（額度已退還）', 'error'); } }).catch(e => { btn.disabled = false; document.getElementById('essayLoading').style.display = 'none'; Swal.fire('網路錯誤', '無法連線到伺服器', 'error'); }); }
function askAiTutor() { const context = document.getElementById('tutorContextInput').value.trim(); const doubt = document.getElementById('tutorDoubtInput').value.trim(); if (!context || !doubt) return Swal.fire('請填寫完整', '請貼上題目與你想問的問題', 'warning'); const btn = document.getElementById('btnAskTutor'); btn.disabled = true; document.getElementById('tutorResult').style.display = 'none'; document.getElementById('tutorLoading').style.display = 'block'; apiCall('aiTutor', { username: AppState.auth.user, question: context, doubt: doubt }).then(res => { btn.disabled = false; document.getElementById('tutorLoading').style.display = 'none'; if (res.success && res.data) { document.getElementById('resTutorExplanation').innerHTML = res.data.replace(/\n/g, '<br>'); document.getElementById('tutorResult').style.display = 'block'; refreshProfileData(); } else { Swal.fire('呼叫老師失敗', res.message, 'error'); } }).catch(e => { btn.disabled = false; document.getElementById('tutorLoading').style.display = 'none'; Swal.fire('網路錯誤', '無法連線到伺服器', 'error'); }); }

// 🎯 記憶系統區
function setupReviewUI() { let dueCount = 0, pendingCount = 0; AppState.review.cards.forEach(q => q.isDue ? dueCount++ : pendingCount++); document.getElementById('dueCountLabel').textContent = dueCount; document.getElementById('pendingCountLabel').textContent = pendingCount; if(dueCount > 0) document.getElementById('startReviewBtn').style.display = 'block'; else document.getElementById('startReviewBtn').style.display = 'none'; AppState.review.currentIndex = 0; renderReviewUI(); }
function loadIncorrectQuestions() { document.getElementById('flashcardModeContainer').style.display = 'none'; document.getElementById('listModeContainer').style.display = 'none'; document.getElementById('startReviewBtn').style.display = 'none'; const area = document.getElementById('singleFlashcardArea'); if (AppState.review.cards && AppState.review.cards.length > 0) { document.getElementById('flashcardModeContainer').style.display = 'block'; setupReviewUI(); } else { document.getElementById('flashcardModeContainer').style.display = 'block'; area.innerHTML = '<div class="loading-box"><div class="spinner"></div><p style="margin-top:15px;">讀取記憶庫中...</p></div>'; } apiCall('getIncorrectQuestions', { username: AppState.auth.user }).then(res => { if (res.success) { AppState.review.cards = res.questions || []; if(document.getElementById('reviewPage').classList.contains('active')) { if (AppState.review.cards.length > 0) { setupReviewUI(); } else { document.getElementById('dueCountLabel').textContent = '0'; document.getElementById('pendingCountLabel').textContent = '0'; area.innerHTML = '<p style="text-align:center; padding: 20px; color: var(--text-muted); font-weight: 600;">記憶庫已清空，無錯題紀錄 🎉</p>'; } } } }).catch(err => { if (!AppState.review.cards || AppState.review.cards.length === 0) { area.innerHTML = `<p style="text-align:center; padding: 20px; color: var(--danger-color); font-weight: 600;">網路連線失敗</p>`; } }); }
function toggleFlashcardMode() { AppState.review.isFlashcardMode = !AppState.review.isFlashcardMode; renderReviewUI(); }
function renderReviewUI() { if (AppState.review.isFlashcardMode) { document.getElementById('listModeContainer').style.display = 'none'; document.getElementById('flashcardModeContainer').style.display = 'block'; renderSingleFlashcard(); } else { document.getElementById('flashcardModeContainer').style.display = 'none'; document.getElementById('listModeContainer').style.display = 'block'; renderListMode(); } }
function renderSingleFlashcard() { try { if (AppState.review.cards.length === 0) return; const q = AppState.review.cards[AppState.review.currentIndex]; if (!q) throw new Error("找不到該卡片"); const area = document.getElementById('singleFlashcardArea'); document.getElementById('fcCounter').textContent = `${AppState.review.currentIndex + 1} / ${AppState.review.cards.length}`; document.getElementById('fcPrev').disabled = AppState.review.currentIndex === 0; document.getElementById('fcNext').disabled = AppState.review.currentIndex === AppState.review.cards.length - 1; const safeQuestionStr = String(q.question || ''); const safeCorrectAnsStr = String(q.correctAnswer || ''); const hasChinese = /[\u4E00-\u9FFF]/.test(safeQuestionStr); const chWord = hasChinese ? safeQuestionStr : safeCorrectAnsStr; const enWord = hasChinese ? safeCorrectAnsStr : safeQuestionStr; const stageText = q.stage === 0 ? '🔴 待複習' : q.stage === 1 ? '🟠 1天後' : q.stage === 2 ? '🟡 3天後' : '🟢 7天後'; const cleanWord = getPureWord(enWord); const safeEnWord = cleanWord.replace(/'/g, "\\'"); area.innerHTML = `<div class="flashcard-container" id="fcContainer" onclick="this.classList.toggle('flipped')" style="opacity: ${q.isDue ? '1' : '0.6'};"><div class="flashcard-inner"><div class="flashcard-front"><div class="fc-word" style="font-size: 1.8em;">${chWord}</div><div style="position:absolute; top:15px; left:15px; font-weight:bold; color:var(--text-muted); font-size:0.9em;">${stageText}</div><div class="fc-hint">點擊卡片翻面看英文</div></div><div class="flashcard-back"><button class="speak-btn" style="position:absolute; top:15px; right:15px; font-size:1.5em; width:50px; height:50px;" onclick="event.stopPropagation(); speakWord('${safeEnWord}')">🔊</button><div class="fc-word">${cleanWord}</div>${!q.isDue ? `<div style="font-size:0.8em; margin-top:20px;">解鎖: ${new Date(q.nextReview).toLocaleDateString()}</div>` : ''}</div></div></div>`; const cardElement = document.getElementById('fcContainer'); cardElement.addEventListener('touchstart', e => { AppState.sys.touchStartX = e.changedTouches[0].screenX; }, {passive: true}); cardElement.addEventListener('touchend', e => { AppState.sys.touchEndX = e.changedTouches[0].screenX; if (AppState.sys.touchEndX < AppState.sys.touchStartX - 40) { if (AppState.review.currentIndex < AppState.review.cards.length - 1) document.getElementById('fcNext').click(); } if (AppState.sys.touchEndX > AppState.sys.touchStartX + 40) { if (AppState.review.currentIndex > 0) document.getElementById('fcPrev').click(); } }, {passive: true}); } catch(e) { Swal.fire('卡片渲染錯誤', e.message, 'error'); } }
function changeFlashcard(delta) { const newIdx = AppState.review.currentIndex + delta; if (newIdx >= 0 && newIdx < AppState.review.cards.length) { AppState.review.currentIndex = newIdx; const wrapper = document.getElementById('slideWrapper'); wrapper.classList.remove('slide-left', 'slide-right'); void wrapper.offsetWidth; wrapper.classList.add(delta > 0 ? 'slide-left' : 'slide-right'); renderSingleFlashcard(); } }
function renderListMode() { let html = ''; AppState.review.cards.forEach((q, i) => { const stageText = q.stage === 0 ? '🔴 待複習' : q.stage === 1 ? '🟠 1天後' : q.stage === 2 ? '🟡 3天後' : '🟢 7天後'; const hasChinese = /[\u4E00-\u9FFF]/.test(String(q.question || '')); const chWord = hasChinese ? q.question : q.correctAnswer; const enWord = hasChinese ? q.correctAnswer : q.question; const cleanWord = getPureWord(enWord); const safeEnWord = cleanWord.replace(/'/g, "\\'"); html += `<div class="review-list-item" style="opacity: ${q.isDue ? '1' : '0.6'};"><div style="flex: 1;"><strong style="font-size: 1.1em;">${chWord}</strong> <span style="font-size:0.8em; margin-left:10px; color:var(--text-muted);">${stageText}</span><br><span style="color:var(--secondary-color); font-weight: 600; display: inline-block; margin-top: 5px;">✅ ${cleanWord}</span></div><button class="list-speak-btn" onclick="speakWord('${safeEnWord}')">🔊</button></div>`; }); document.getElementById('listModeContainer').innerHTML = html; }

// 🎯 帳號與安全區 (這裡補回被刪掉的超重要 Function)
function handleRegister() { const u=document.getElementById('regUsername').value.trim(); const p=document.getElementById('regPassword').value; const gradeOffset = document.getElementById('regGrade').value; if(u.length<3||p.length<4) return Swal.fire('錯誤','帳號至少3碼, 密碼4碼','warning'); showLoading('註冊中'); let tYear = calculateTargetYear(gradeOffset); apiCall('registerUser',{username:u, password:p, targetYear: tYear}).then(res=>{ if(res.success){Swal.fire('成功','請登入','success');showView('loginView');document.getElementById('loginUsername').value=u;} else Swal.fire('失敗',res.message,'error'); }); }
function handleLogin() { const u=document.getElementById('loginUsername').value.trim(); const p=document.getElementById('loginPassword').value; showLoading('登入中'); apiCall('loginUser',{username:u, password:p}).then(res=>{if(res.success){AppState.auth.user=res.user;AppState.auth.token=res.token;localStorage.setItem('user',u);localStorage.setItem('token',res.token);Swal.close();showView('setupView');applyTheme(); }else Swal.fire('失敗',res.message,'error');}); }
function handleLogout() { Swal.fire({title:'登出？', showCancelButton:true, confirmButtonColor:'#ef4444'}).then(r=>{if(r.isConfirmed){AppState.auth.user=null;localStorage.clear();showView('loginView');}}); }

function handleAvatarFile(event) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
            const MAX_SIZE = 400; let width = img.width; let height = img.height;
            if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } } else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }
            canvas.width = width; canvas.height = height; ctx.drawImage(img, 0, 0, width, height);
            const base64Data = canvas.toDataURL('image/jpeg', 0.9);
            document.getElementById('profileAvatarPreview').innerHTML = `<img src="${base64Data}" style="width:100px; height:100px; border-radius:50%; object-fit:cover;">`;
            showLoading('上傳至雲端空間中...');
            apiCall('uploadAvatarToDrive', { username: AppState.auth.user, base64Img: base64Data }).then(r => {
                Swal.close();
                if(r.success) {
                    Swal.fire('成功', '大頭貼已上傳並產生網址！', 'success');
                    if(AppState.profile.cache) AppState.profile.cache.avatar = r.url; 
                } else Swal.fire('失敗', r.message, 'error');
            });
        }; img.src = e.target.result;
    }; reader.readAsDataURL(file);
}

function handleCredentialUpdate() {
    const newU = document.getElementById('profNewUsername').value.trim();
    const newP = document.getElementById('profNewPassword').value;
    const newG = document.getElementById('profNewGrade').value;

    if (!newU && !newP && !newG) return;
    if (newU && newU.length < 3) return Swal.fire('錯誤', '新帳號至少3碼', 'warning');
    if (newP && newP.length < 4) return Swal.fire('錯誤', '新密碼至少4碼', 'warning');

    let tYear = null;
    if (newG !== "") { tYear = calculateTargetYear(newG); }

    showLoading('更新中...');
    apiCall('updateUserCredentials', { username: AppState.auth.user, newUsername: newU, newPassword: newP, newTargetYear: tYear }).then(res => {
        if(res.success) {
            Swal.fire('成功', '帳號資料已更新', 'success');
            AppState.auth.user = res.newUsername;
            localStorage.setItem('user', AppState.auth.user);
            document.getElementById('profNewUsername').value = '';
            document.getElementById('profNewPassword').value = '';
            document.getElementById('profNewGrade').value = '';
            if (tYear !== null) AppState.profile.targetYear = tYear;
            refreshProfileData();
        } else Swal.fire('失敗', res.message, 'error');
    });
}

function handleApiKeyUpdate() {
    const k = document.getElementById('profApiKey').value.trim();
    if (!k || !k.startsWith('AIza')) return Swal.fire('格式錯誤', '請輸入有效的 API Key (以 AIza 開頭)', 'warning');
    showLoading('綁定中...');
    apiCall('updateApiKey', { username: AppState.auth.user, apiKey: k }).then(res => {
        if(res.success) {
            Swal.fire('成功', res.message, 'success');
            refreshProfileData();
            document.getElementById('profApiKey').value='';
        } else Swal.fire('失敗', '綁定失敗', 'error');
    });
}

// 🎯 排行榜區
function loadLeaderboardData() { const container = document.getElementById('leaderboardTableContainer'); if (AppState.sys.leaderboard && AppState.sys.leaderboard.length > 0) { renderRank(); } else { container.innerHTML = '<div class="loading-box"><div class="spinner"></div><p style="margin-top:15px;">讀取排行榜中...</p></div>'; } apiCall('getLeaderboardData').then(res => { if (res.success && res.data) { AppState.sys.leaderboard = res.data; if(document.getElementById('leaderboardView').classList.contains('active')) renderRank(); } else if (!AppState.sys.leaderboard || AppState.sys.leaderboard.length === 0) { container.innerHTML = '<p style="text-align:center; padding:20px; font-weight:bold; color:var(--text-muted);">伺服器無回應</p>'; } }); }
function renderRank() { const rankType = document.getElementById('rankSelector').value; const cohortType = document.getElementById('cohortSelector').value; const container = document.getElementById('leaderboardTableContainer'); let filteredData = AppState.sys.leaderboard.filter(p => { if (cohortType === 'peer' && window.userTargetYear) { if (p.targetYear !== window.userTargetYear) return false; } if (rankType === 'all') return true; if (rankType === 'king' && p.level >= 26) return true; if (rankType === 'silver' && p.level >= 11 && p.level <= 25) return true; if (rankType === 'bronze' && p.level <= 10) return true; return false; }); if(filteredData.length > 0) { let html = '<table class="data-table"><tr><th>排名</th><th style="text-align:left;">玩家</th><th>Level</th><th>經驗值 (XP)</th></tr>'; filteredData.forEach((d, i) => { const rank = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i+1; const isMe = String(d.username).trim().toLowerCase() === String(AppState.auth.user).trim().toLowerCase(); const bgColor = isMe ? (AppState.sys.isDarkMode ? 'rgba(16,185,129,0.1)' : '#d1fae5') : (AppState.sys.isDarkMode ? 'transparent' : (i === 0 ? '#ffedd5' : i === 1 ? '#fef9c3' : i === 2 ? '#e0f2fe' : 'transparent')); const borderStyle = isMe ? 'border: 2px solid var(--secondary-color);' : ''; let badgeHtml = d.badges ? `<span style="font-size:0.8em; margin-left:5px;" title="歷史成就">${d.badges}</span>` : ''; const nameDisplay = isMe ? `<span style="color:var(--secondary-color);">${d.username} (你)</span>${badgeHtml}` : `${d.username}${badgeHtml}`; html += `<tr class="${isMe?'me-row':''}" style="background-color: ${bgColor}; ${borderStyle}"><td style="font-weight:700; text-align:center;">${rank}</td><td style="text-align:left; font-weight:600; white-space:nowrap;">${d.avatar} ${nameDisplay}</td><td style="color:var(--secondary-color); font-weight:800; text-align:center;">Lv.${d.level}</td><td style="color:var(--primary-color); font-weight:700; text-align:center;">${d.totalXP}</td></tr>`; }); container.innerHTML = html + '</table>'; } else { container.innerHTML = '<p style="text-align:center; padding:20px; font-weight:bold; color:var(--text-muted);">此階級/屆別尚無玩家資料，趕快去刷題搶佔第一！</p>'; } }
