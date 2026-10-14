/* 내 명함첩 — 오프라인에서도 앱 화면이 열리도록 파일을 기기에 보관합니다. */
const SHELL_CACHE = "cardbook-shell-v1";
const CDN_CACHE = "cardbook-cdn-v1";
const SHELL = ["./", "index.html", "ocr.js", "firebase-config.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"];
const CDN_HOSTS = ["www.gstatic.com", "cdnjs.cloudflare.com", "cdn.jsdelivr.net", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== SHELL_CACHE && k !== CDN_CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // 앱 파일: 새 버전을 먼저 받고, 인터넷이 없으면 보관본을 씁니다.
  if (url.origin === self.location.origin) {
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(SHELL_CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match("index.html"))));
    return;
  }

  // 외부 도구(로그인·엑셀·글꼴·글자 인식 프로그램): 보관본을 바로 쓰고 뒤에서 새로 받습니다.
  // 글자 인식 데이터(.traineddata)는 인식 도구가 따로 보관하므로 여기서는 건너뜁니다.
  if (CDN_HOSTS.includes(url.hostname) && !/traineddata/.test(url.pathname)) {
    e.respondWith(caches.open(CDN_CACHE).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(res => { if (res.ok || res.type === "opaque") c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
  }
});
