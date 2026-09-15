/* BUYEST Toolkit — 최소 서비스 워커
   목적: (1) 홈 화면 추가/설치가 가능하도록 (크롬은 fetch 핸들러가 있는 서비스워커를 요구),
        (2) 정적 껍데기(HTML/아이콘/라이브러리)를 캐시해서 오프라인이거나 네트워크가
            느릴 때도 앱은 뜨도록.
   절대 하지 않는 것: toolkit_dashboard_api.php 응답 캐싱 — 로그인/캘린더/할일처럼
   실시간으로 바뀌어야 하는 데이터라 여기서 캐시하면 오래된 값을 보여주게 된다. */
var CACHE_NAME = 'buyest-toolkit-shell-v1';
var SHELL_FILES = [
  './index.html',
  './assets/manifest.json',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

self.addEventListener('install', function(e){
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){ return cache.addAll(SHELL_FILES); })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE_NAME; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  var url = e.request.url;
  if (e.request.method !== 'GET') return;                 // POST(API 저장 등)는 그대로 네트워크로
  if (url.indexOf('toolkit_dashboard_api.php') !== -1) return; // 동적 데이터는 절대 캐시 안 함

  e.respondWith(
    fetch(e.request).then(function(res){
      var copy = res.clone();
      caches.open(CACHE_NAME).then(function(cache){ cache.put(e.request, copy); });
      return res;
    }).catch(function(){
      return caches.match(e.request).then(function(cached){ return cached || caches.match('./index.html'); });
    })
  );
});
