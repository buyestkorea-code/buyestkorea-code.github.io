/* 서버 이카운트 재고/품목 자동 불러오기 결과를 브라우저(IndexedDB)에 저장해 두고 재사용한다.
   - 먼저 아주 작은 "기준 시각 확인"(status_only)만 호출 → 서버 수집 시각(as_of)·품목명 갱신 시각(master_ts)이
     저장본과 같으면 저장본을 그대로 쓰고(약 1MB 다운로드 생략), 다르면 새로 받아 저장한다.
   - 툴킷 로그인 정보가 있어야 쓸 수 있다(저장본도 로그인한 사용자만 꺼내 쓴다).
   사용: const d = await ECCache.load('master' | 'all');  → { ok, rows, as_of, age_min, stale, count, fromCache } */
(function(){
  var API = 'https://buyest.co.kr/ecount_qty_lookup_api.php';
  var DB = 'buyest-ec-cache', STORE = 'kv';

  function auth(){
    try{ var a = JSON.parse(localStorage.getItem('buyest.dash.auth') || 'null'); return (a && a.id && a.pass) ? a : null; }catch(e){ return null; }
  }
  function openDb(){
    return new Promise(function(res, rej){
      var r = indexedDB.open(DB, 1);
      r.onupgradeneeded = function(){ r.result.createObjectStore(STORE); };
      r.onsuccess = function(){ res(r.result); };
      r.onerror = function(){ rej(r.error); };
    });
  }
  function idbGet(k){
    return openDb().then(function(db){
      return new Promise(function(res){
        var q = db.transaction(STORE).objectStore(STORE).get(k);
        q.onsuccess = function(){ res(q.result || null); };
        q.onerror = function(){ res(null); };
      });
    }).catch(function(){ return null; });
  }
  function idbPut(k, v){
    return openDb().then(function(db){
      return new Promise(function(res){
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(v, k);
        tx.oncomplete = function(){ res(true); };
        tx.onerror = function(){ res(false); };
      });
    }).catch(function(){ return false; });
  }
  function post(body){
    return fetch(API, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }).then(function(r){ return r.json(); });
  }
  function keyOf(o){ return (o.as_of || 0) + '|' + (o.master_ts || 0); }

  window.ECCache = {
    load: async function(kind, opts){
      opts = opts || {};
      var a = auth();
      if(!a) throw new Error('툴킷에 로그인한 뒤 사용할 수 있어요. 로그인 후 새로고침해 주세요. (엑셀 업로드는 로그인 없이 가능)');
      var st = null;
      try{ st = await post({ status_only: 1 }); }catch(e){}
      if(!opts.force && st && st.ok && st.as_of){
        var c = await idbGet(kind);
        if(c && c.key === keyOf(st) && c.data && c.data.rows){
          var d0 = Object.assign({}, c.data, { as_of: st.as_of, age_min: st.age_min, stale: st.stale, fromCache: true });
          return d0;
        }
      }
      var body = { user: a.id, pass: a.pass }; body[kind] = 1;
      var d = await post(body);
      if(!d.ok) throw new Error(d.error || '불러오기 실패');
      d.fromCache = false;
      if(d.as_of) idbPut(kind, { key: keyOf(d), data: d });
      return d;
    },
    /* 서버가 이카운트에서 재고를 지금 다시 받아 저장하게 한다(크론 시간 밖 수동 갱신). 이카운트 15분 간격 제한으로 거절될 수 있다 → { ok:false, wait, error } */
    refreshNow: async function(){
      var a = auth();
      if(!a) throw new Error('툴킷에 로그인한 뒤 사용할 수 있어요. 로그인 후 새로고침해 주세요.');
      var d = await post({ user: a.id, pass: a.pass, refresh_now: 1 });
      if(!d.ok) throw new Error(d.error || '갱신 실패');
      if(!d.refreshed) throw new Error('서버가 아직 즉시 갱신을 지원하지 않아요. (서버 업데이트 필요)');
      return d;
    },
    clear: function(){ return openDb().then(function(db){ return new Promise(function(res){ var tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).clear(); tx.oncomplete = function(){ res(true); }; }); }).catch(function(){ return false; }); }
  };
})();
