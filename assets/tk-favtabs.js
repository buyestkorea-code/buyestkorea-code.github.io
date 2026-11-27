/* ===== 사이드바 "내 즐겨찾기"(계정별 서버 저장) + 상단 "최근 연 화면" 탭 =====
   index.html 끝에서 불러온다. 개인 설정 저장은 index.html의 window.__tkPrefs(대시보드 개인 데이터와 같은 저장소)를 쓴다.
   - 즐겨찾기: state.favs(메뉴 data-nav 이름 목록), state.favOpen(펼침 여부) → 로그인 계정별로 서버 저장
   - 최근 탭: 이 PC의 localStorage 'buyest.tabs.<아이디>' (최대 8개, 대시보드 탭은 고정) */
(function(){
  var P = window.__tkPrefs; if(!P) return;
  var sidebar = document.getElementById('sidebar'); if(!sidebar) return;
  var SKIP = {miniChat:1, roadmap:1};           // 비밀 메뉴·로드맵은 별/탭 대상에서 뺀다
  var MAX_TABS = 8;

  function origBtn(name){ return sidebar.querySelector('.nav-item[data-nav="' + name + '"]:not([data-fav-clone])'); }
  function labelOf(name){
    var b = origBtn(name); if(!b) return '';
    var c = b.cloneNode(true);
    c.querySelectorAll('.ic,.navst,.chip,.navbadge,.tk-star').forEach(function(x){ x.remove(); });
    return c.textContent.replace(/\s+/g, ' ').trim();
  }
  function usable(name){ var b = origBtn(name); return !!b && !SKIP[name] && !b.hidden; }
  function go(name){ var b = origBtn(name); if(b) b.click(); }
  function el(tag, cls, txt){ var e = document.createElement(tag); if(cls) e.className = cls; if(txt != null) e.textContent = txt; return e; }

  /* ---------- 즐겨찾기 ---------- */
  var box = el('nav', 'nav-group tk-fav'); box.id = 'tkFav';
  var head = el('div', 'tk-fav-head');
  var tog = el('button', 'tk-fav-toggle'); tog.type = 'button';
  tog.innerHTML = '<span>★ 내 즐겨찾기</span><span class="cnt"></span><span class="car">▼</span>';
  var editBtn = el('button', 'tk-fav-edit', '편집'); editBtn.type = 'button';
  var list = el('div', 'tk-fav-list');
  head.appendChild(tog); head.appendChild(editBtn); box.appendChild(head); box.appendChild(list);
  var brand = sidebar.querySelector('.brand');
  brand.parentNode.insertBefore(box, brand.nextSibling);

  var editing = false;
  function favs(){ return (P.get().favs || []).filter(usable); }
  function setFavs(a){ P.get().favs = a; P.save(); renderFav(); syncStars(); }

  tog.addEventListener('click', function(){
    var s = P.get(); s.favOpen = (s.favOpen === false); P.save(); renderFav();
  });
  editBtn.addEventListener('click', function(){ editing = !editing; renderFav(); });

  var dragName = null;
  function renderFav(){
    var s = P.get(), f = favs();
    if(!f.length) editing = false;
    box.classList.toggle('closed', s.favOpen === false);
    box.classList.toggle('editing', editing);
    editBtn.classList.toggle('on', editing);
    editBtn.textContent = editing ? '완료' : '편집';
    editBtn.hidden = !f.length;
    tog.querySelector('.cnt').textContent = f.length ? '(' + f.length + ')' : '';
    tog.title = s.favOpen === false ? '펼치기' : '접기';
    list.innerHTML = '';
    if(!f.length){
      list.appendChild(el('div', 'tk-fav-empty', '메뉴에 마우스를 올리고 오른쪽 ☆을 누르면 여기에 모여요.'));
      return;
    }
    f.forEach(function(name){
      var src = origBtn(name);
      var c = src.cloneNode(true);
      c.setAttribute('data-fav-clone', '1');
      c.removeAttribute('id');
      c.querySelectorAll('.tk-star').forEach(function(x){ x.remove(); });
      c.insertBefore(el('span', 'tk-grip', '⋮⋮'), c.firstChild);
      var x = el('span', 'tk-x', '✕'); x.title = '즐겨찾기에서 빼기'; c.appendChild(x);
      c.classList.toggle('active', src.classList.contains('active'));
      c.addEventListener('click', function(e){
        if(e.target === x){ e.stopPropagation(); setFavs(favs().filter(function(n){ return n !== name; })); return; }
        if(editing) return;
        go(name);
      });
      c.draggable = editing;
      c.addEventListener('dragstart', function(e){ dragName = name; c.classList.add('tk-drag'); try{ e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', name); }catch(_){} });
      c.addEventListener('dragend', function(){ c.classList.remove('tk-drag'); dragName = null; });
      c.addEventListener('dragover', function(e){ if(dragName && dragName !== name) e.preventDefault(); });
      c.addEventListener('drop', function(e){
        e.preventDefault(); if(!dragName || dragName === name) return;
        var a = favs().filter(function(n){ return n !== dragName; });
        var r = c.getBoundingClientRect(), after = (e.clientY - r.top) > r.height / 2;
        a.splice(a.indexOf(name) + (after ? 1 : 0), 0, dragName);
        setFavs(a);
      });
      list.appendChild(c);
    });
  }

  // 원래 메뉴마다 별(☆/★) 붙이기
  sidebar.querySelectorAll('.nav-item[data-nav]').forEach(function(b){
    var name = b.getAttribute('data-nav');
    if(SKIP[name]) return;
    var st = el('span', 'tk-star', '☆'); st.setAttribute('role', 'button');
    st.addEventListener('click', function(e){
      e.stopPropagation(); e.preventDefault();
      var a = (P.get().favs || []).slice(), i = a.indexOf(name);
      if(i > -1) a.splice(i, 1); else { a.push(name); P.get().favOpen = true; }
      setFavs(a);
    });
    b.appendChild(st);
  });
  function syncStars(){
    var f = P.get().favs || [];
    sidebar.querySelectorAll('.nav-item[data-nav]:not([data-fav-clone]) .tk-star').forEach(function(st){
      var on = f.indexOf(st.parentNode.getAttribute('data-nav')) > -1;
      st.classList.toggle('on', on); st.textContent = on ? '★' : '☆';
      st.title = on ? '즐겨찾기에서 빼기' : '내 즐겨찾기에 추가';
    });
  }

  /* ---------- 최근 연 화면 탭 ---------- */
  var bar = el('div', 'tk-tabs'); bar.id = 'tkTabs';
  var topbar = document.querySelector('.topbar');
  topbar.parentNode.insertBefore(bar, topbar.nextSibling);
  var current = 'dashboard';
  function tabKey(){ return 'buyest.tabs.' + (P.user() || '_'); }
  function loadTabs(){ try{ var a = JSON.parse(localStorage.getItem(tabKey()) || '[]'); return Array.isArray(a) ? a.filter(usable) : []; }catch(e){ return []; } }
  function saveTabs(a){ try{ localStorage.setItem(tabKey(), JSON.stringify(a)); }catch(e){} }
  var tabs = loadTabs();

  function addTab(name){
    if(name === 'dashboard' || !usable(name) || tabs.indexOf(name) > -1) return;
    tabs.push(name);
    while(tabs.length > MAX_TABS){
      var drop = -1;
      for(var i = 0; i < tabs.length; i++){ if(tabs[i] !== name){ drop = i; break; } }
      tabs.splice(drop, 1);
    }
    saveTabs(tabs);
  }
  function closeTab(name){
    var i = tabs.indexOf(name); if(i === -1) return;
    tabs.splice(i, 1); saveTabs(tabs);
    if(current === name) go(tabs[i] || tabs[i - 1] || 'dashboard');
    renderTabs();
  }
  function renderTabs(){
    bar.innerHTML = '';
    var home = el('button', 'tk-tab home' + (current === 'dashboard' ? ' on' : ''));
    home.type = 'button'; home.innerHTML = '⌂ <span class="t">대시보드</span>';
    home.addEventListener('click', function(){ go('dashboard'); });
    bar.appendChild(home);
    tabs.forEach(function(name){
      var t = el('button', 'tk-tab' + (current === name ? ' on' : '')); t.type = 'button';
      var lb = el('span', 't', labelOf(name)); t.title = lb.textContent;
      var x = el('span', 'x', '✕'); x.title = '탭 닫기';
      t.appendChild(lb); t.appendChild(x);
      t.addEventListener('click', function(e){ if(e.target === x){ e.stopPropagation(); closeTab(name); return; } go(name); });
      t.addEventListener('auxclick', function(e){ if(e.button === 1){ e.preventDefault(); closeTab(name); } });
      bar.appendChild(t);
    });
    if(tabs.length){
      var all = el('button', 'tk-tabs-all', '모두 닫기'); all.type = 'button';
      all.addEventListener('click', function(){ tabs = []; saveTabs(tabs); if(current !== 'dashboard') go('dashboard'); renderTabs(); });
      bar.appendChild(all);
    }
    var on = bar.querySelector('.tk-tab.on'); if(on && on.scrollIntoView) on.scrollIntoView({block:'nearest', inline:'nearest'});
  }
  // 전체화면 도구(크림 API 등)의 높이 계산에 탭 줄 높이를 포함시킨다
  function fixTbh(){
    if(!document.body.classList.contains('fullframe')) return;
    document.documentElement.style.setProperty('--tbh', (topbar.offsetHeight + (bar.offsetHeight || 0)) + 'px');
  }

  document.addEventListener('toolkit:viewchange', function(e){
    var name = e.detail && e.detail.view; if(!name) return;
    current = name; addTab(name); renderTabs();
    setTimeout(function(){
      list.querySelectorAll('.nav-item').forEach(function(c){ c.classList.toggle('active', c.getAttribute('data-nav') === name); });
      fixTbh();
    }, 0);
  });
  document.addEventListener('toolkit:prefs', function(){ tabs = loadTabs(); renderFav(); syncStars(); renderTabs(); });
  window.addEventListener('resize', fixTbh);

  /* ---------- 왼쪽 메뉴 숨기기/보이기 (이 PC에 기억) ---------- */
  var SIDE_KEY = 'buyest.sideHidden';
  var sideBtn = el('button', 'tk-side-btn'); sideBtn.type = 'button'; sideBtn.id = 'tkSideToggle';
  sideBtn.innerHTML = '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path class="ar" d="M15.5 9.5 13 12l2.5 2.5"/></svg>';
  topbar.insertBefore(sideBtn, topbar.firstChild);
  function setSide(hidden, save){
    document.body.classList.toggle('tk-side-hidden', hidden);
    sideBtn.title = hidden ? '왼쪽 메뉴 보이기' : '왼쪽 메뉴 숨기기';
    sideBtn.setAttribute('aria-label', sideBtn.title);
    sideBtn.querySelector('.ar').setAttribute('d', hidden ? 'M13 9.5 15.5 12 13 14.5' : 'M15.5 9.5 13 12l2.5 2.5');
    if(save){ try{ localStorage.setItem(SIDE_KEY, hidden ? '1' : '0'); }catch(e){} }
    setTimeout(function(){ fixTbh(); window.dispatchEvent(new Event('resize')); }, 200);
  }
  sideBtn.addEventListener('click', function(){ setSide(!document.body.classList.contains('tk-side-hidden'), true); });
  var sideSaved = '0'; try{ sideSaved = localStorage.getItem(SIDE_KEY) || '0'; }catch(e){}
  setSide(sideSaved === '1', false);

  var act = document.querySelector('main.content > section[data-view].active');
  if(act) current = act.getAttribute('data-view');
  addTab(current);
  renderFav(); syncStars(); renderTabs(); setTimeout(fixTbh, 0);
})();
