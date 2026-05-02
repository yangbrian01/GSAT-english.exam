// ==========================================
// PWA 安裝邏輯 (BeforeInstallPrompt)
// ==========================================
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    // 阻止 Chrome 自動顯示預設的安裝提示
    e.preventDefault();
    // 儲存事件，以便稍後觸發
    deferredPrompt = e;
    // 顯示我們自己做的安裝按鈕
    const installBtn = document.getElementById('installAppBtn');
    if(installBtn) installBtn.style.display = 'block';
});

async function installPWA() {
    if (deferredPrompt) {
        // 顯示安裝對話框
        deferredPrompt.prompt();
        // 等待使用者回應
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            console.log('使用者接受安裝 PWA');
        } else {
            console.log('使用者拒絕安裝 PWA');
        }
        // 清除 prompt，因為它只能用一次
        deferredPrompt = null;
        // 隱藏安裝按鈕
        document.getElementById('installAppBtn').style.display = 'none';
    } else {
        // 如果是 iOS，它不支援 beforeinstallprompt 事件，需要手動引導
        Swal.fire({
            title: '安裝 iOS App',
            html: '請點擊瀏覽器下方的 <b>「分享」</b> 按鈕<br>然後選擇 <b>「加入主畫面」</b>',
            icon: 'info',
            confirmButtonText: '我知道了'
        });
    }
}

// 註冊 Service Worker
if ('serviceWorker' in navigator) { 
    window.addEventListener('load', () => { 
        navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('SW registered!', reg))
        .catch(err => console.log('SW failed: ', err)); 
    }); 
}

// ... 下方保留你原本的 AppState 與其他邏輯 ...
