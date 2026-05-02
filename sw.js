// 🚀 真 PWA 離線快取引擎 (支援斷網使用)
const CACHE_NAME = 'vocabmaster-real-pwa-v1';
const STATIC_ASSETS = [
    './',
    './index.html',
    './icon.png',
    './manifest.json',
    'https://cdn.jsdelivr.net/npm/sweetalert2@11',
    'https://cdn.jsdelivr.net/npm/chart.js@3.7.1/dist/chart.min.js',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=Noto+Sans+TC:wght@400;500;700&display=swap'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return Promise.all(
                STATIC_ASSETS.map(url => {
                    return fetch(url).then(response => {
                        if (response.ok) return cache.put(url, response);
                    }).catch(err => console.warn(`無法快取: ${url}`, err));
                })
            );
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.map(key => { if (key !== CACHE_NAME) return caches.delete(key); })
        ))
    );
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET' || event.request.url.includes('script.google.com')) {
        event.respondWith(
            fetch(event.request).catch(() => {
                return new Response(JSON.stringify({ success: false, message: '離線狀態，請求已存入佇列' }), { headers: { 'Content-Type': 'application/json' } });
            })
        );
        return;
    }
    event.respondWith(
        fetch(event.request).then(response => {
            let resClone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
            return response;
        }).catch(() => caches.match(event.request))
    );
});
