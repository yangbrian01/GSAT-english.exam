const CACHE_NAME = 'vocabmaster-v3'; // 🎯 升級版本號，強制更新快取
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon.png',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11',
  'https://cdn.jsdelivr.net/npm/chart.js@3.7.1/dist/chart.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=Noto+Sans+TC:wght@400;500;700&display=swap'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // 確保就算有單個靜態資源抓不到，也不會讓整個 Service Worker 當掉
      return Promise.allSettled(
        ASSETS_TO_CACHE.map(url => cache.add(url).catch(err => console.warn(`Cache failed for ${url}`, err)))
      );
    })
  );
  self.skipWaiting();
});

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

self.addEventListener('fetch', event => {
  // 🎯 關鍵修復：如果是 API 請求 (POST)，直接放行，且加上 catch 避免 SW 當機
  if (event.request.method !== 'GET' || event.request.url.includes('script.google.com')) {
      event.respondWith(
          fetch(event.request).catch(err => {
              console.warn('API fetch failed, probably offline:', err);
              // 如果是要求 JSON，回傳一個假的 JSON 避免前端 JSON.parse 報錯
              return new Response(JSON.stringify({ success: false, message: '目前處於離線狀態' }), {
                  headers: { 'Content-Type': 'application/json' }
              });
          })
      );
      return; 
  } 

  // 🎯 靜態資源 (HTML, CSS, JS, 圖片) 的快取策略：先找 Cache，找不到再去網路抓
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).catch(() => {
        // 如果連網路都斷了，又沒有快取，回傳離線提示頁面 (這裡簡化回傳空響應)
        console.warn('Offline and resource not in cache:', event.request.url);
      });
    })
  );
});
