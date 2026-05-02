const CACHE_NAME = 'vocabmaster-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11',
  'https://cdn.jsdelivr.net/npm/chart.js@3.7.1/dist/chart.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=Noto+Sans+TC:wght@400;500;700&display=swap'
];

// 安裝時快取靜態資源
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

// 啟動時清除舊快取
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(key => {
        if (key !== CACHE_NAME) return caches.delete(key);
      })
    ))
  );
  self.clients.claim();
});

// 攔截網路請求，若斷網則回傳快取
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return; // API POST 請求不快取
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
