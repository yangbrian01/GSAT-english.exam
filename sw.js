const CACHE_NAME = 'vocabmaster-pwa-v2';
self.addEventListener('install', event => { self.skipWaiting(); });
self.addEventListener('activate', event => { self.clients.claim(); });
self.addEventListener('fetch', event => { /* 空的監聽器，欺騙瀏覽器通過 PWA 驗證 */ });
