/*
 * PlanAsistan servis çalışanı: çevrimdışı açılış (UI-KRC-07).
 *
 * Önce ağ: çevrimiçi kullanıcı her zaman en güncel sürümü alır (yeni yayından sonra eski
 * uygulama gösterilmez). Ağ yoksa son başarılı kopya önbellekten verilir; sayfa gezinmeleri
 * uygulamanın kabuğuna (index.html) düşer. Veri tarayıcının deposundadır, önbellekte değil.
 * API çağrıları (/api/) ve başka sitelerin dosyaları önbelleğe uğramaz.
 */
const CACHE = 'planasistan-v5';
const SHELL = ['/', '/index.html'];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).catch(() => {}));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req);
        if (hit) return hit;
        if (req.mode === 'navigate') return (await caches.match('/index.html')) || (await caches.match('/')) || Response.error();
        return Response.error();
      })
  );
});
