/* 대시보드 "내 정보" 카드 아래 — 급여명세서 받기 · 근로계약서 서명 (본인 것만).
   서버(toolkit_hr_api.php)가 로그인한 이름의 자료만 돌려주므로, 여기서는 받은 것을 보여주기만 한다. */
(function(root){
  var API = '', AUTH = null, host = null;

  function post(action, extra){
    var b = {action:action, user:AUTH.id, pass:AUTH.pass};
    for(var k in extra) b[k] = extra[k];
    return fetch(API, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(b)}).then(function(r){ return r.json(); });
  }
  function el(tag, cls, html){ var e = document.createElement(tag); if(cls) e.className = cls; if(html != null) e.innerHTML = html; return e; }
  function esc(t){ return String(t == null ? '' : t).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function loadPdf(){
    if(root.HRPDF) return Promise.resolve();
    return new Promise(function(res, rej){ var s = document.createElement('script'); s.src = 'assets/hr-pdf.js'; s.onload = res; s.onerror = function(){ rej(new Error('PDF 도구를 불러오지 못했어요')); }; document.head.appendChild(s); });
  }

  var css = '.hrme{display:flex;flex-direction:column;gap:10px;margin-top:2px}' +
    '.hrme .sec{padding-top:10px;border-top:1px solid rgba(255,255,255,.14)}' +
    '.hrme .t{font-size:12px;color:rgba(243,239,227,.78);margin-bottom:6px;font-weight:600}' +
    '.hrme .rw{display:flex;gap:6px}' +
    '.hrme select,.hrme button{font:inherit;font-size:12.5px;border-radius:9px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.1);color:#F3EFE3;padding:7px 10px}' +
    '.hrme select{flex:1;min-width:0}.hrme select option{color:#20241F}' +
    '.hrme button{cursor:pointer;font-weight:700;white-space:nowrap}.hrme button:hover{background:rgba(255,255,255,.18)}' +
    '.hrme button.go{background:#6FCB80;border-color:#6FCB80;color:#0f2a18}' +
    '.hrme .msg{font-size:11.5px;margin-top:6px;color:#FFD9A0;line-height:1.5}.hrme .msg.ok{color:#9FE3B8}' +
    '.hrme .alert{padding:10px 12px;border-radius:10px;background:rgba(255,203,138,.16);border:1px solid rgba(255,203,138,.4);font-size:12.5px;color:#FFE7BF}' +
    '.hrme .alert button{margin-top:8px;width:100%}' +
    '.hrov{position:fixed;inset:0;z-index:99990;background:rgba(10,16,14,.62);display:flex;align-items:center;justify-content:center;padding:14px}' +
    '.hrov .bx{background:#fff;color:#20241F;border-radius:16px;max-width:640px;width:100%;max-height:94vh;overflow:auto;padding:18px 20px;box-shadow:0 20px 60px rgba(0,0,0,.4)}' +
    '.hrov h3{margin:0 0 4px;font-size:17px}.hrov .sub{font-size:12px;color:#5C6259;margin-bottom:10px}' +
    '.hrov .doc{white-space:pre-wrap;word-break:keep-all;font-size:13px;line-height:1.75;background:#F7F5EF;border:1px solid #DBD5C7;border-radius:10px;padding:12px 14px;max-height:36vh;overflow:auto}' +
    '.hrov canvas{display:block;width:100%;height:190px;border:2px dashed #b9b4a4;border-radius:10px;background:#fff;touch-action:none;cursor:crosshair;margin-top:6px}' +
    '.hrov .row{display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap}.hrov .row .sp{flex:1}' +
    '.hrov button{font:inherit;font-size:13px;font-weight:700;border-radius:9px;border:1px solid #DBD5C7;background:#fff;padding:8px 14px;cursor:pointer}' +
    '.hrov button.pri{background:#2F5D53;border-color:#2F5D53;color:#fff}' +
    '.hrov .err{color:#B23B3B;font-size:12.5px;margin-top:8px;min-height:16px}' +
    '.hrov img.sg{height:80px;border:1px solid #DBD5C7;border-radius:8px;background:#fff;margin-top:6px}';

  function monthOptions(mine){
    var have = {}, list = [], d = new Date();
    mine.forEach(function(m){ have[m.ym] = 1; });
    var seen = {};
    function add(ym){ if(seen[ym]) return; seen[ym] = 1; list.push(ym); }
    for(var i = 1; i <= 18; i++){ var x = new Date(d.getFullYear(), d.getMonth() - i + 1, 1); add(x.getFullYear() + '-' + ('0' + (x.getMonth() + 1)).slice(-2)); }
    Object.keys(have).forEach(add);
    list.sort().reverse();
    return {list:list, have:have};
  }

  function renderPay(box){
    box.innerHTML = '<div class="t">급여명세서</div><div class="rw"><select></select><button class="go" type="button">받기</button></div><div class="msg" hidden></div>';
    var sel = box.querySelector('select'), btn = box.querySelector('button'), msg = box.querySelector('.msg');
    function say(t, ok){ msg.hidden = !t; msg.textContent = t || ''; msg.className = 'msg' + (ok ? ' ok' : ''); }
    post('payroll_my_months', {}).then(function(r){
      var mine = (r && r.ok) ? r.mine : [], o = monthOptions(mine);
      sel.innerHTML = o.list.map(function(ym){ return '<option value="' + ym + '">' + ym.slice(0, 4) + '년 ' + ym.slice(5) + '월' + (o.have[ym] ? ' ✓' : '') + '</option>'; }).join('');
      var first = o.list.filter(function(ym){ return o.have[ym]; })[0];
      if(first) sel.value = first;
    }).catch(function(){ say('명세서 목록을 불러오지 못했어요'); });
    btn.addEventListener('click', function(){
      var ym = sel.value; say('');
      btn.disabled = true; btn.textContent = '만드는 중…';
      post('payroll_my', {ym:ym}).then(function(r){
        if(!r || !r.ok){ say((r && r.error) || '불러오지 못했어요'); return; }
        if(!r.month_exists){ say(ym.slice(0, 4) + '년 ' + ym.slice(5) + '월 급여명세서가 아직 등록되지 않았어요. 관리자에게 문의해 주세요.'); return; }
        if(!r.slips.length){ say('이 달 명세서에서 내 급여 내역을 찾지 못했어요. 관리자에게 문의해 주세요.'); return; }
        return loadPdf().then(function(){
          var els = r.slips.map(function(s){ return root.HRPDF.payslipEl(s); });
          return root.HRPDF.download(els, '급여명세서_' + ym + '_' + AUTH.id + '.pdf').then(function(){ els.forEach(function(e){ e.remove(); }); say('PDF를 내려받았어요', true); }, function(e){ els.forEach(function(x){ x.remove(); }); throw e; });
        });
      }).catch(function(e){ say('만들지 못했어요: ' + (e && e.message || e)); })
        .then(function(){ btn.disabled = false; btn.textContent = '받기'; });
    });
  }

  function openOverlay(inner){
    var ov = el('div', 'hrov'), bx = el('div', 'bx');
    bx.appendChild(inner); ov.appendChild(bx); document.body.appendChild(ov);
    ov.addEventListener('mousedown', function(e){ if(e.target === ov) close(); });
    function close(){ ov.remove(); }
    return {close:close, box:bx};
  }

  function openSign(c, done){
    var w = el('div', null,
      '<h3>' + esc(c.year) + '년 근로계약서</h3><div class="sub">' + esc(c.company) + ' · 내용을 끝까지 읽고, 아래 칸에 <b>이름을 손글씨로 직접</b> 써 주세요.</div>' +
      '<div class="doc"></div>' +
      '<canvas width="900" height="285"></canvas>' +
      '<div class="row"><label style="font-size:13px"><input type="checkbox" id="hrAgree"> 위 내용을 확인했고 동의합니다</label><span class="sp"></span><button type="button" id="hrClr">지우기</button><button type="button" id="hrCancel">닫기</button><button type="button" class="pri" id="hrSend">서명 제출</button></div>' +
      '<div class="err"></div>');
    w.querySelector('.doc').textContent = c.body;
    var ov = openOverlay(w), cv = w.querySelector('canvas'), g = cv.getContext('2d'), drawing = false, inked = 0, err = w.querySelector('.err');
    g.lineWidth = 4; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#111';
    function pt(e){ var r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; }
    cv.addEventListener('pointerdown', function(e){ drawing = true; try{ cv.setPointerCapture(e.pointerId); }catch(x){} var p = pt(e); g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(p[0] + .1, p[1] + .1); g.stroke(); inked++; e.preventDefault(); });
    cv.addEventListener('pointermove', function(e){ if(!drawing) return; var p = pt(e); g.lineTo(p[0], p[1]); g.stroke(); inked++; e.preventDefault(); });
    ['pointerup', 'pointercancel'].forEach(function(n){ cv.addEventListener(n, function(){ drawing = false; }); });
    w.querySelector('#hrClr').addEventListener('click', function(){ g.clearRect(0, 0, cv.width, cv.height); inked = 0; });
    w.querySelector('#hrCancel').addEventListener('click', ov.close);
    w.querySelector('#hrSend').addEventListener('click', function(){
      err.textContent = '';
      if(inked < 25){ err.textContent = '서명 칸에 이름을 직접 써 주세요.'; return; }
      if(!w.querySelector('#hrAgree').checked){ err.textContent = '내용 확인·동의에 체크해 주세요.'; return; }
      var b = w.querySelector('#hrSend'); b.disabled = true; b.textContent = '제출 중…';
      post('contract_sign', {id:c.id, agree:1, signature:cv.toDataURL('image/png')}).then(function(r){
        if(r && r.ok){ ov.close(); done(); } else { err.textContent = (r && r.error) || '제출하지 못했어요'; b.disabled = false; b.textContent = '서명 제출'; }
      }).catch(function(){ err.textContent = '서버에 연결하지 못했어요'; b.disabled = false; b.textContent = '서명 제출'; });
    });
  }

  function openSigned(c){
    var w = el('div', null, '<h3>' + esc(c.year) + '년 근로계약서 (서명 완료)</h3><div class="sub">' + esc(c.company) + ' · 서명일시 ' + esc(c.signed_at || '') + '</div><div class="doc"></div>' +
      '<div class="sub" style="margin-top:10px">내 서명</div><img class="sg" alt="서명">' +
      '<div class="row"><span class="sp"></span><button type="button" id="hrX">닫기</button><button type="button" class="pri" id="hrPdf">PDF 받기</button></div><div class="err"></div>');
    w.querySelector('.doc').textContent = c.body; w.querySelector('img').src = c.signature;
    var ov = openOverlay(w);
    w.querySelector('#hrX').addEventListener('click', ov.close);
    w.querySelector('#hrPdf').addEventListener('click', function(){
      loadPdf().then(function(){ var e = root.HRPDF.contractEl(c, AUTH.id); return root.HRPDF.download([e], '근로계약서_' + c.year + '_' + AUTH.id + '.pdf').then(function(){ e.remove(); }); })
        .catch(function(e){ w.querySelector('.err').textContent = '만들지 못했어요: ' + (e && e.message || e); });
    });
  }

  function renderContract(box){
    post('contract_my', {}).then(function(r){
      var items = (r && r.ok) ? r.items : [];
      if(!items.length){ box.hidden = true; return; }
      box.hidden = false; box.innerHTML = '<div class="t">근로계약서</div>';
      items.slice(0, 3).forEach(function(c){
        var row = el('div');
        if(c.status === 'pending'){
          row.className = 'alert';
          row.innerHTML = esc(c.year) + '년 근로계약서에 서명이 필요해요.<button class="go" type="button">읽고 서명하기</button>';
          row.querySelector('button').addEventListener('click', function(){
            post('contract_get', {id:c.id}).then(function(g){ if(g && g.ok) openSign(g.item, function(){ renderContract(box); }); });
          });
        } else {
          row.className = 'rw';
          row.innerHTML = '<span style="flex:1;font-size:12.5px;align-self:center">' + esc(c.year) + '년 · 서명 완료 (' + esc(String(c.signed_at || '').slice(0, 10)) + ')</span><button type="button">보기 · PDF</button>';
          row.querySelector('button').addEventListener('click', function(){
            post('contract_get', {id:c.id}).then(function(g){ if(g && g.ok) openSigned(g.item); });
          });
        }
        box.appendChild(row);
      });
    }).catch(function(){ box.hidden = true; });
  }

  function mount(card, apiUrl, auth){
    API = apiUrl; AUTH = auth;
    if(!document.getElementById('hrmeCss')){ var st = el('style'); st.id = 'hrmeCss'; st.textContent = css; document.head.appendChild(st); }
    var old = card.querySelector('.hrme'); if(old) old.remove();
    host = el('div', 'hrme');
    var pay = el('div', 'sec'), con = el('div', 'sec'); con.hidden = true;
    host.appendChild(pay); host.appendChild(con); card.appendChild(host);
    renderPay(pay); renderContract(con);
  }
  root.HRME = {mount:mount};
})(window);
