const CACHE = 'cet4-v42';
/* 核心文件：必须缓存到（离线时靠它兜底） */
/* 只预缓存根路径：index.html 现在内置了 8 篇音频（约 3.5MB），
   再单独 add('./index.html') 会把同一份内容下载两次，白耗手机流量。 */
const CORE = ['./', './tailwind.js'];
/* 可选文件：缺失（404）也不影响 Service Worker 安装，逐个容错 */
const OPTIONAL = ['./manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(
        CORE.concat(OPTIONAL).map(u => c.add(u).catch(() => null))
      ))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // 词典API等直接走网络
  /* 音频一律放行给浏览器原生处理：支持 Range 拖动进度条，且绝不能进缓存。
     历史缺陷：曾把 404 的错误页写进缓存，用户补传音频后仍一直报「播放失败」。 */
  const isMedia = /\.(mp3|m4a|wav|ogg|aac)$/i.test(url.pathname);
  if (isMedia || e.request.destination === 'audio' || url.pathname.includes('/listening/') || url.pathname.includes('/psg/')) return;
  const isDoc = e.request.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html');
  if (isDoc) {
    // 页面文档：网络优先，保证改版后立刻生效；离线时回退缓存
    e.respondWith(
      fetch(e.request).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => caches.match(e.request).then(hit => hit || caches.match('./index.html')))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      /* 只缓存真正成功的 200 响应；404/500 一律不缓存，避免污染缓存 */
      if (res && res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => new Response('', { status: 504, statusText: 'Offline' })))
  );
});
