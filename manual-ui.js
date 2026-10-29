/* 툴킷 화면 안의 사용 설명서 기능
   1) 도구 화면 위쪽 "📖 사용법" 버튼 → 그 메뉴의 설명서 팝업
   2) 왼쪽 메뉴 "사용 설명서" → 전체 목록 화면(검색 · 카드 · 교육자료 PDF 받기) */
(function(){
  var R = window.ManualR;
  if(!R) return;
  var D = R.data;
  var PDF = 'BUYEST-툴킷-교육자료.pdf';
  var DOC = 'manual.html';

  var topbar = document.querySelector('.topbar');
  var meta = document.querySelector('.topbar-meta');
  var btn = document.createElement('button');
  btn.type = 'button'; btn.id = 'manualBtn'; btn.className = 'mn-topbtn';
  btn.textContent = '📖 사용법';
  btn.setAttribute('aria-label', '이 메뉴 사용법 보기');
  if(topbar) topbar.insertBefore(btn, meta || null);

  var back = document.createElement('div');
  back.className = 'mnm-back'; back.setAttribute('role', 'dialog'); back.setAttribute('aria-modal', 'true');
  back.innerHTML =
    '<div class="mnm-box">' +
      '<div class="mnm-bar"><strong id="mnmTitle">사용법</strong>' +
        '<button type="button" id="mnmList">전체 설명서</button>' +
        '<button type="button" class="x" id="mnmClose" aria-label="닫기">&times;</button></div>' +
      '<div class="mnm-body" id="mnmBody"></div>' +
    '</div>';
  document.body.appendChild(back);

  var current = '';
  function open(id){
    var it = R.find(id);
    if(!it) return;
    document.getElementById('mnmTitle').textContent = it.title + ' · 사용법';
    var body = document.getElementById('mnmBody');
    body.innerHTML = R.itemHTML(it);
    back.classList.add('open');
    back.scrollTop = 0;
    document.body.style.overflow = 'hidden';
  }
  function close(){
    back.classList.remove('open');
    document.body.style.overflow = '';
  }
  back.addEventListener('click', function(e){ if(e.target === back) close(); });
  document.getElementById('mnmClose').addEventListener('click', close);
  document.getElementById('mnmList').addEventListener('click', function(){ close(); location.hash = 'manualHub'; });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && back.classList.contains('open')) close(); });
  btn.addEventListener('click', function(){ if(current) open(current); });

  // 보고 있는 메뉴에 설명서가 있을 때만 버튼을 보여준다
  document.addEventListener('toolkit:viewchange', function(e){
    var v = e && e.detail && e.detail.view;
    current = (v && v !== 'manualHub' && R.find(v)) ? v : '';
    btn.classList.toggle('show', !!current);
    if(v === 'manualHub') renderHub();
  });

  /* ---- 사용 설명서 목록 화면 ---- */
  var hubDone = false;
  function renderHub(){
    var box = document.getElementById('manualHubBox');
    if(!box || hubDone) return;
    hubDone = true;
    var h = '<div class="mn">' +
      '<div class="mnh-hero"><h1>사용 설명서</h1>' +
      '<p>메뉴마다 \"따라 하기\" 순서로 설명했어요. 궁금한 메뉴를 누르거나, 각 도구 화면 위의 <b>📖 사용법</b> 버튼을 눌러도 같은 설명이 나와요.</p>' +
      '<div class="acts"><a href="' + PDF + '" download>전체 교육자료 PDF 받기</a>' +
      '<a class="ghost" href="' + DOC + '" target="_blank" rel="noopener">교육자료 화면으로 보기 · 인쇄</a></div></div>' +
      '<input class="mnh-search" id="mnhSearch" type="search" placeholder="메뉴 이름이나 하고 싶은 일로 찾기 (예: 품절, 바코드, 인보이스)" autocomplete="off">' +
      '<div id="mnhList"></div></div>';
    box.innerHTML = h;
    function draw(q){
      q = (q || '').trim().toLowerCase();
      var out = '';
      D.groups.forEach(function(g){
        var items = D.items.filter(function(it){
          if(it.g !== g.id) return false;
          if(!q) return true;
          return (it.title + ' ' + it.what + ' ' + (it.when || '')).toLowerCase().indexOf(q) !== -1;
        });
        if(!items.length) return;
        out += '<div class="mnh-g"><h3>' + R.esc(g.name) + '</h3><div class="mnh-grid">' +
          items.map(function(it){
            return '<button type="button" class="mnh-card" data-id="' + it.id + '"><b>' + R.esc(it.title) + '</b>' +
              '<span>' + R.esc(it.what) + '</span><i class="' + it.st + '">' + (it.st === 'ok' ? '사용가능' : '시험판') + '</i></button>';
          }).join('') + '</div></div>';
      });
      document.getElementById('mnhList').innerHTML = out || '<p style="color:var(--ink-muted)">찾는 메뉴가 없어요. 다른 단어로 찾아 보세요.</p>';
    }
    draw('');
    document.getElementById('mnhSearch').addEventListener('input', function(){ draw(this.value); });
    document.getElementById('mnhList').addEventListener('click', function(e){
      var c = e.target.closest('.mnh-card');
      if(c) open(c.getAttribute('data-id'));
    });
  }
  // 주소(#메뉴이름)로 바로 들어온 경우에도 버튼이 보이게
  var v0 = location.hash.replace('#', '').split(':')[0];
  if(v0 && v0 !== 'manualHub' && R.find(v0)){ current = v0; btn.classList.add('show'); }
  // 처음부터 #manualHub 주소로 들어온 경우
  if(location.hash.replace('#','') === 'manualHub') setTimeout(renderHub, 0);
})();
