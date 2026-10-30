/* 사진 자동화 → 사이트 상품 등록 패널
 * photo-auto.html 이 만든 상세 이미지(_00) + 사진 1·2번(_01 목록, _02 오버) + 입력한 상품정보를
 * 서버(toolkit_register_api.php)로 보내 "미리보기 → 등록"까지 한 화면에서 끝낸다.
 * 인증: 툴킷 로그인 계정(localStorage buyest.dash.auth). 모든 작업은 서버에 이력(누가·언제)으로 남는다.
 * 새 상품은 서버 기본값(임시가 5,000,000원·미노출)으로 등록되고, 담당자가 관리자에서 가격·노출을 바꾼다.
 */
(function(root){
'use strict';

/* ---------- 엑셀 만들기/읽기 (서버 자동등록 엑셀과 같은 칸 배치: 1번 시트 D6~D11, D17~F18, D20~H20, D23~H23) ---------- */
var CAT_CELLS=['D20','E20','F20','G20','H20'];
function buildInfoWorkbook(XLSX,v){
  var wb=XLSX.utils.book_new(), ws={}, d={};
  function put(sheet,addr,val){ if(val===''||val==null) return; sheet[addr]={t:'s',v:String(val)}; }
  var L={C6:'브랜드',C7:'소재',C8:'원산지',C9:'키즈 동시등록(Y/N)',C10:'키즈 가격',C11:'키즈 노출(Y/N)',
    C16:'옵션',D16:'옵션명',E16:'옵션값(쉼표로 구분)',F16:'실제 입고된 옵션값(쉼표)',C17:'옵션1',C18:'옵션2',
    C19:'카테고리',D19:'1차',E19:'2차',F19:'3차',G19:'4차',H19:'5차',C20:'카테고리1~5'};
  Object.keys(L).forEach(function(a){ put(ws,a,L[a]); });
  put(ws,'D6',v.brand); put(ws,'D7',v.material); put(ws,'D8',v.origin);
  put(ws,'D9',v.kids?'Y':'N');
  if(v.kids){ put(ws,'D10',String(v.kidsPrice||'').replace(/[^0-9]/g,'')); put(ws,'D11',v.kidsShow?'Y':'N'); }
  v.tiers.forEach(function(t,i){ var r=17+i; if(!t.name) return;
    put(ws,'D'+r,t.name); put(ws,'E'+r,t.values.join(',')); put(ws,'F'+r,t.real.join(',')); });
  v.cats.forEach(function(c,i){ if(i<5) put(ws,CAT_CELLS[i],c); });
  ws['!ref']='A1:H23';
  ws['!cols']=[{wch:2},{wch:2},{wch:22},{wch:24},{wch:30},{wch:30},{wch:30},{wch:30}];
  // 2번 시트 '상세': 서버 자동등록은 읽지 않고, 사진 자동화 툴이 정보표·실측표를 채우는 데 사용
  var rows=[['항목','값']];
  [['브랜드한글',v.brandKo],['카테고리',v.categoryWord],['수입여부',v.imported],['제조년월',v.mfg],['색상',v.color],['구성품',v.parts],['수납공간',v.storage]].forEach(function(r){ if(r[1]) rows.push(r); });
  rows.push([]); rows.push(['실측표']);
  (v.sizeTable||[]).forEach(function(r){ rows.push(r); });
  rows.forEach(function(r,ri){ r.forEach(function(c,ci){ if(c!=='' && c!=null) put(d,XLSX.utils.encode_cell({r:ri,c:ci}),c); }); });
  d['!ref']='A1:H'+Math.max(rows.length,2);
  XLSX.utils.book_append_sheet(wb,ws,'Sheet1');
  XLSX.utils.book_append_sheet(wb,d,'상세');
  return wb;
}
function cellStr(ws,a){ var c=ws&&ws[a]; return c&&c.v!=null?String(c.v).trim():''; }
function csv(s){ return String(s||'').split(',').map(function(x){return x.trim();}).filter(Boolean); }
function parseInfoWorkbook(XLSX,wb){
  var ws=wb.Sheets[wb.SheetNames[0]], out={tiers:[],cats:[]};
  out.brand=cellStr(ws,'D6'); out.material=cellStr(ws,'D7'); out.origin=cellStr(ws,'D8');
  out.kids=cellStr(ws,'D9').toUpperCase()==='Y'; out.kidsPrice=cellStr(ws,'D10'); out.kidsShow=cellStr(ws,'D11').toUpperCase()==='Y';
  [17,18].forEach(function(r){ var n=cellStr(ws,'D'+r); if(n) out.tiers.push({name:n,values:csv(cellStr(ws,'E'+r)),real:csv(cellStr(ws,'F'+r))}); });
  ['D20','E20','F20','G20','H20','D23','E23','F23','G23','H23'].forEach(function(a){ var c=cellStr(ws,a); if(c) out.cats.push(c); });
  var d=wb.Sheets['상세'];
  if(d){
    var rng=XLSX.utils.decode_range(d['!ref']||'A1:A1'), kv={}, table=[], inTable=false;
    for(var r=rng.s.r;r<=rng.e.r;r++){
      var a=cellStr(d,XLSX.utils.encode_cell({r:r,c:0}));
      if(a==='실측표'){ inTable=true; continue; }
      if(inTable){
        var row=[]; for(var c=0;c<=rng.e.c;c++) row.push(cellStr(d,XLSX.utils.encode_cell({r:r,c:c})));
        while(row.length&&row[row.length-1]==='') row.pop();
        if(row.length) table.push(row);
      }else if(a && a!=='항목'){ kv[a]=cellStr(d,XLSX.utils.encode_cell({r:r,c:1})); }
    }
    out.detail=kv; out.sizeTable=table;
  }
  return out;
}
root.PhotoRegisterXlsx={build:buildInfoWorkbook,parse:parseInfoWorkbook};
if(typeof document==='undefined') return;   // node 시험용

/* ---------- 화면 ---------- */
var API='https://buyest.co.kr/toolkit_register_api.php';
var $=function(id){return document.getElementById(id);};
var PA=null;                       // window.PhotoAuto (photo-auto.html 이 제공)
var R={auth:null,brands:[],cats:[],tpls:[],role:'',lastPreview:null,previewKey:'',busy:false,loaded:false};

function getAuth(){ try{ var a=JSON.parse(localStorage.getItem('buyest.dash.auth')||'null'); return a&&a.id&&a.pass?a:null; }catch(e){ return null; } }
function api(action,fields,files){
  var a=R.auth||getAuth(); if(!a) return Promise.reject(new Error('툴킷 로그인이 필요해요'));
  var fd=new FormData(); fd.append('action',action); fd.append('user',a.id); fd.append('pass',a.pass);
  Object.keys(fields||{}).forEach(function(k){ fd.append(k,fields[k]); });
  Object.keys(files||{}).forEach(function(k){ fd.append(k,files[k],k+(files[k].type==='image/jpeg'?'.jpg':'.xlsx')); });
  return fetch(API,{method:'POST',body:fd}).then(function(r){ return r.json(); });
}
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
function newReq(){ var a=new Uint8Array(8); window.crypto.getRandomValues(a); return [].map.call(a,function(b){return ('0'+b.toString(16)).slice(-2);}).join(''); }

/* ---------- 입력칸 읽기/쓰기 ---------- */
function collect(){
  var tiers=[];
  [1,2].forEach(function(i){
    var n=$('rT'+i+'n').value.trim(), vals=csv($('rT'+i+'v').value), real=csv($('rT'+i+'s').value);
    if(n||vals.length) tiers.push({name:n,values:vals,real:real});
  });
  var cats=[1,2,3,4,5].map(function(i){ return $('rC'+i).value.trim(); }).filter(Boolean);
  var f=PA.readF();
  return {brand:$('rBrand').value.trim(),material:$('rMaterial').value.trim(),origin:$('rOrigin').value.trim(),
    kids:$('rKids').checked,kidsPrice:$('rKidsPrice').value.trim(),kidsShow:$('rKidsShow').checked,
    tiers:tiers,cats:cats,
    brandKo:f['브랜드한글'],categoryWord:f['카테고리'],imported:f['수입여부'],mfg:f['제조년월'],color:f['색상'],parts:f['구성품'],storage:f['수납공간'],
    sizeTable:PA.sizeTableRows()};
}
function fill(v){
  if(v.brand!=null) $('rBrand').value=v.brand;
  if(v.material!=null) $('rMaterial').value=v.material;
  if(v.origin!=null) $('rOrigin').value=v.origin;
  if(v.kids!=null){ $('rKids').checked=!!v.kids; $('rKidsPrice').value=v.kidsPrice||''; $('rKidsShow').checked=!!v.kidsShow; }
  if(v.tiers){ [1,2].forEach(function(i){ var t=v.tiers[i-1]||{name:'',values:[],real:[]};
    $('rT'+i+'n').value=t.name||''; $('rT'+i+'v').value=(t.values||[]).join(','); $('rT'+i+'s').value=(t.real||[]).join(','); }); }
  if(v.cats){ [1,2,3,4,5].forEach(function(i){ $('rC'+i).value=v.cats[i-1]||''; }); }
  kidsToggle(); invalidate();
}
function kidsToggle(){ var on=$('rKids').checked; ['rKidsPrice','rKidsShowWrap'].forEach(function(id){ $(id).style.display=on?'':'none'; }); }
function invalidate(){ R.lastPreview=null; R.previewKey=''; refreshButtons(); }
function keyOf(){
  var c=PA.ctx(); if(!c) return '';
  return JSON.stringify([c.pname,c.genId,collect(),c.photos.slice(0,2).map(function(p){return p.file.name+p.file.size;})]);
}

/* ---------- 템플릿 ---------- */
function loadTpls(){
  return api('tpl_list').then(function(j){
    if(!j.ok) return; R.tpls=j.templates||[];
    var s=$('rTpl'); s.innerHTML='<option value="">— 카테고리 템플릿 선택 —</option>'+R.tpls.map(function(t){ return '<option value="'+esc(t.tpl_id)+'">'+esc(t.name)+'</option>'; }).join('');
  });
}
function applyTpl(){
  var id=$('rTpl').value; if(!id) return;
  api('tpl_get',{id:id}).then(function(j){
    if(!j.ok){ msg(j.error||'템플릿을 불러오지 못했어요','bad'); return; }
    var b=j.body||{}, tiers=(b.tiers||[]).map(function(t){ return {name:t.name,values:t.values||[],real:[]}; });
    fill({tiers:tiers});
    var hints=$('rHints'); hints.innerHTML='';
    (b.catHints||[]).forEach(function(h){
      var bt=document.createElement('button'); bt.type='button'; bt.className='btn btn-out btn-sm'; bt.textContent=h;
      bt.addEventListener('click',function(){ for(var i=1;i<=5;i++){ if(!$('rC'+i).value){ $('rC'+i).value=h; break; } } invalidate(); });
      hints.appendChild(bt);
    });
    PA.applyTemplate(b);
    msg('템플릿 "'+j.name+'" 적용 — 옵션·실측 항목이 채워졌어요. 실제 입고된 옵션값(실제재고)을 꼭 확인하세요.'+(b.note?' ('+b.note+')':''),'ok');
  }).catch(function(e){ msg(e.message,'bad'); });
}
function saveTpl(){
  var v=collect(), id=prompt('템플릿 번호(영문 소문자·숫자, 예: scarf)'); if(!id) return;
  var name=prompt('템플릿 이름(예: 머플러)'); if(!name) return;
  var labels=(PA.sizeTableRows()[0]||[]).slice(1);
  var body={tiers:v.tiers.map(function(t){return {name:t.name,values:t.values};}),sizeLabels:labels,storage:!!v.storage,catHints:v.cats,note:''};
  api('tpl_save',{id:id,name:name,body:JSON.stringify(body),sort_no:'100'}).then(function(j){
    if(!j.ok){ msg(j.error||'저장하지 못했어요','bad'); return; } msg('템플릿을 저장했어요','ok'); loadTpls();
  });
}
function downloadXlsx(){
  var X=root.XLSX, wb=buildInfoWorkbook(X,collect());
  var out=X.write(wb,{type:'array',bookType:'xlsx',bookSST:true});
  var a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([out],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  a.download='상품정보_'+(PA.ctx()?PA.ctx().code:'양식')+'.xlsx'; document.body.appendChild(a); a.click(); a.remove();
}

/* ---------- 메시지 ---------- */
function msg(t,kind){ var m=$('rMsg'); m.textContent=t||''; m.className='hint '+(kind==='bad'?'rbad':kind==='ok'?'rok':''); }

/* ---------- 미리보기 / 등록 ---------- */
function localCheck(v,c){
  var p=[];
  if(!c) return ['먼저 위에서 "상세페이지 만들기"를 눌러 이미지를 만드세요.'];
  if(!v.brand) p.push('브랜드가 비어 있어요.'); if(!v.origin) p.push('원산지가 비어 있어요.');
  if(!v.tiers.length||!v.tiers[0].name||!v.tiers[0].values.length) p.push('옵션(사이즈 등)의 이름과 값을 입력하세요.');
  v.tiers.forEach(function(t,i){ t.real.forEach(function(x){ if(t.values.indexOf(x)<0) p.push('옵션'+(i+1)+' 실제재고 "'+x+'" 가 옵션값에 없어요.'); }); });
  if(!v.cats.length) p.push('카테고리를 1개 이상 선택하세요.');
  if(v.kids&&!v.kidsPrice) p.push('키즈 동시등록은 키즈 가격을 입력하세요.');
  if(PA.sizeIncomplete()) p.push('실측표를 모두 입력하세요(비어 있는 칸이 있어요). 입력 후 "상세페이지 만들기"를 다시 누르세요.');
  return p;
}
function buildFiles(v,c){
  var X=root.XLSX, wb=buildInfoWorkbook(X,v);
  var xb=new Blob([X.write(wb,{type:'array',bookType:'xlsx',bookSST:true})],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  var p1=c.photos[0], p2=c.photos[1]||c.photos[0];
  return Promise.all([PA.encodeJpeg(c.canvas),PA.photoJpeg(p1),PA.photoJpeg(p2)]).then(function(r){
    return {info:xb,img00:r[0],img01:r[1],img02:r[2]};
  });
}
function doPreview(){
  var c=PA.ctx(), v=collect(), pr=localCheck(v,c);
  if(pr.length){ msg(pr.join(' / '),'bad'); return; }
  setBusy(true); msg('서버에서 검사하는 중…');
  buildFiles(v,c).then(function(files){ return api('preview',{name:c.pname},files); }).then(function(j){
    R.lastPreview=j; R.previewKey=j&&j.ok?keyOf():''; showPreview(j); loadHistory();
  }).catch(function(e){ msg('미리보기 실패: '+e.message,'bad'); }).then(function(){ setBusy(false); });
}
function showPreview(j){
  var box=$('rPrev'); box.style.display='block';
  if(j.error&&!j.product_name){ box.innerHTML='<div class="rbad">'+esc(j.error)+(j.detail?'<br>'+esc(j.detail):'')+'</div>'; msg(''); refreshButtons(); return; }
  var h='<table class="regtbl">';
  function row(a,b){ h+='<tr><th>'+a+'</th><td>'+b+'</td></tr>'; }
  row('사이트 상품명',esc(j.product_name||''));
  if(j.kids&&j.kids.yn==='Y') row('키즈 사이트 상품명',esc(j.kids_name||''));
  row('브랜드',j.brand?esc(j.brand_input)+' → <b>'+esc(j.brand.name)+'</b> ('+esc(j.brand.kr)+')':'<span class="rbad">'+esc(j.brand_input)+' — 사이트에 없음</span>');
  row('카테고리',(j.categories||[]).map(function(x){ return esc(x.path)+(x.cid?'':' <span class="rbad">(일치 안 함)</span>'); }).join('<br>'));
  row('옵션',(j.tiers||[]).map(function(t){ return esc(t.name)+': '+esc(t.values.join(', '))+' <span class="hint">(입고 '+(t.real_stock&&t.real_stock.length?esc(t.real_stock.join(', ')):'없음→전부 품절')+')</span>'; }).join('<br>')+'<br>조합 '+(j.combos||0)+'개 중 판매중 '+(j.available||0)+'개');
  row('등록 상태','미노출 · 가격 '+Number(j.price||0).toLocaleString()+'원'+(j.kids&&j.kids.yn==='Y'?' (키즈 가격·노출은 입력값 적용)':' (임시가 — 담당자가 관리자에서 변경)'));
  row('키즈 동시등록',j.kids&&j.kids.yn==='Y'?'예 (키즈 사이트에도 자동 등록 · 실패하면 자동 복구 후 알림)':'아니오');
  h+='</table>';
  if(j.dups&&j.dups.length){
    h+='<div class="rwarn"><b>같은 이름의 상품이 이미 있어요.</b><ul>'+j.dups.map(function(d){ return '<li>pid '+d.pid+' · '+esc(d.rdate)+' · '+(d.display==='Y'?'노출중':'미노출')+'</li>'; }).join('')+'</ul>'+
      '<label><input type="checkbox" id="rDupOk"> 위 상품이 있는 것을 확인했고, 그래도 새로 등록합니다</label></div>';
  }
  if(j.problems&&j.problems.length) h+='<ul class="rprob">'+j.problems.map(function(p){return '<li>'+esc(p)+'</li>';}).join('')+'</ul>';
  box.innerHTML=h;
  var dup=$('rDupOk'); if(dup) dup.addEventListener('change',refreshButtons);
  msg(j.ok?'검사 통과 — 내용을 확인하고 [등록]을 누르세요.':'등록할 수 없는 항목이 있어요. 위 빨간 항목을 고친 뒤 다시 [미리보기]를 누르세요.',j.ok?'ok':'bad');
  refreshButtons();
}
function doRegister(){
  var c=PA.ctx(), v=collect(), j=R.lastPreview;
  if(!j||!j.ok||R.previewKey!==keyOf()){ msg('입력이 바뀌었거나 미리보기를 하지 않았어요. [미리보기]를 먼저 눌러주세요.','bad'); return; }
  var dupNeed=j.dups&&j.dups.length, dup=$('rDupOk');
  if(dupNeed&&!(dup&&dup.checked)){ msg('같은 이름의 상품이 있어요. 확인 체크를 해주세요.','bad'); return; }
  if(!confirm('"'+j.product_name+'"\n\n사이트에 등록합니다(미노출·임시가 상태). 진행할까요?')) return;
  setBusy(true); msg('등록 중… (키즈 상품은 조금 더 걸려요)');
  buildFiles(v,c).then(function(files){ return api('register',{name:c.pname,req_id:newReq(),confirm_dup:dupNeed?'1':''},files); }).then(function(r){
    showResult(r); loadHistory();
  }).catch(function(e){ msg('등록 중 연결 오류: '+e.message+' — 등록됐을 수 있으니 아래 작업 이력을 확인하세요(같은 상품을 바로 다시 등록하지 마세요).','bad'); loadHistory(); })
  .then(function(){ setBusy(false); });
}
function showResult(r){
  var box=$('rResult'); box.style.display='block'; var h='';
  if(r.need_confirm){ h='<div class="rwarn">'+esc(r.error)+'</div>'; msg('미리보기를 다시 누르면 중복 확인 칸이 나옵니다.','bad'); }
  else if(r.ok){
    h='<div class="rokbox"><b>등록 완료</b> — pid <b>'+r.pid+'</b> (미노출·임시가). 관리자에서 가격과 노출을 바꾸면 판매가 시작됩니다.</div>';
    if(r.kids_status==='ok') h+='<div class="hint">키즈 사이트 연동: 정상</div>';
    if(r.kids_status==='repaired') h+='<div class="rwarn">키즈 연동에 문제가 있었지만 <b>자동으로 복구</b>했습니다.<br>'+esc((r.kids_note||[]).join(' / '))+'</div>';
    (r.warn||[]).forEach(function(w){ h+='<div class="rwarn">'+esc(w)+'</div>'; });
    msg('등록했어요. 같은 상품을 다시 등록하려면 새로 미리보기를 하세요.','ok'); R.lastPreview=null; R.previewKey='';
  }else{
    h='<div class="rbad"><b>등록하지 못했어요</b><br>'+esc(r.error||'')+(r.problems&&r.problems.length?'<ul>'+r.problems.map(function(p){return '<li>'+esc(p)+'</li>';}).join('')+'</ul>':'')+'</div>';
    msg('등록 실패','bad');
  }
  if(r.alert) h+='<div class="alertbox"><b>⚠ '+esc(r.alert.title)+'</b><pre>'+esc(r.alert.message)+'</pre><div>관리자 알림과 메일로도 전달되었습니다.</div></div>';
  box.innerHTML=h; refreshButtons();
}
function setBusy(b){ R.busy=b; refreshButtons(); }
function refreshButtons(){
  var c=PA&&PA.ctx(), ok=!!c&&!R.busy;
  $('rPreviewBtn').disabled=!ok;
  var j=R.lastPreview, dup=$('rDupOk'), dupOk=!(j&&j.dups&&j.dups.length)||(dup&&dup.checked);
  $('rRegBtn').disabled=!(ok&&j&&j.ok&&R.previewKey===keyOf()&&dupOk);
}

/* ---------- 이력·알림 ---------- */
function loadHistory(){
  return api('history').then(function(j){
    if(!j.ok) return;
    var al=$('rAlerts'); al.innerHTML='';
    (j.alerts||[]).forEach(function(a){
      var d=document.createElement('div'); d.className='alertbox';
      d.innerHTML='<b>⚠ '+esc(a.title)+'</b> <span class="hint">'+esc(a.created_at)+' · '+esc(a.username)+' · '+esc(a.name)+(a.pid?' · pid '+a.pid:'')+'</span><pre>'+esc(a.message)+'</pre>';
      var b=document.createElement('button'); b.type='button'; b.className='btn btn-out btn-sm'; b.textContent='확인했어요';
      b.addEventListener('click',function(){ api('ack',{id:a.id}).then(loadHistory); });
      d.appendChild(b); al.appendChild(d);
    });
    var h='<table class="regtbl hist2"><tr><th>시간</th><th>작업자</th><th>구분</th><th>상품</th><th>결과</th></tr>';
    (j.rows||[]).forEach(function(x){
      var res=x.status==='ok'?'<span class="chip cok">성공</span>':x.status==='running'?'<span class="chip cwarn">처리중</span>':'<span class="chip cbad">실패</span>';
      if(x.pid) res+=' pid '+x.pid;
      if(x.kids_status==='repaired') res+=' <span class="chip cwarn">키즈 자동복구</span>';
      if(x.kids_status==='failed') res+=' <span class="chip cbad">키즈 실패</span>';
      if(x.alert==1&&!x.ack_at) res+=' <span class="chip cbad">알림</span>';
      h+='<tr><td>'+esc(String(x.created_at).slice(5,16))+'</td><td>'+esc(x.username)+'</td><td>'+(x.action==='register'?'등록':'미리보기')+'</td><td>'+esc(x.folder_name)+'</td><td>'+res+'</td></tr>';
    });
    $('rHist').innerHTML=h+'</table>';
  }).catch(function(){});
}

/* ---------- 시작 ---------- */
function init(){
  PA=root.PhotoAuto; if(!PA||!$('regBox')) return;
  R.auth=getAuth();
  if(!R.auth){ $('regLogin').style.display='block'; $('regMain').style.display='none'; return; }
  $('regLogin').style.display='none'; $('regMain').style.display='block';
  api('me').then(function(j){
    if(!j.ok){ $('regLogin').style.display='block'; $('regLogin').textContent=(j.error||'로그인 확인 실패')+' — 툴킷에 다시 로그인해 주세요.'; $('regMain').style.display='none'; return; }
    R.role=j.role; if(j.role==='admin') $('rTplSave').style.display='';
    return Promise.all([
      api('brands').then(function(b){ if(b.ok){ $('rBrandList').innerHTML=b.brands.map(function(x){ return '<option value="'+esc(x[0])+'">'+esc(x[1])+'</option>'; }).join(''); } }),
      api('categories').then(function(c){ if(c.ok){ R.cats=c.categories; $('rCatList').innerHTML=c.categories.map(function(x){ return '<option value="'+esc(x)+'">'; }).join(''); } }),
      loadTpls(), loadHistory()
    ]);
  }).catch(function(e){ msg('서버에 연결하지 못했어요: '+e.message,'bad'); });
  ['rBrand','rMaterial','rOrigin','rKidsPrice','rT1n','rT1v','rT1s','rT2n','rT2v','rT2s','rC1','rC2','rC3','rC4','rC5'].forEach(function(id){ $(id).addEventListener('input',invalidate); });
  $('rKids').addEventListener('change',function(){ kidsToggle(); invalidate(); });
  $('rKidsShow').addEventListener('change',invalidate);
  $('rTplApply').addEventListener('click',applyTpl);
  $('rTplSave').addEventListener('click',saveTpl);
  $('rXlsx').addEventListener('click',downloadXlsx);
  $('rPreviewBtn').addEventListener('click',doPreview);
  $('rRegBtn').addEventListener('click',doRegister);
  $('rHistRefresh').addEventListener('click',loadHistory);
  kidsToggle(); refreshButtons();
}
root.PhotoRegister={
  init:init,
  onGenerated:function(){ invalidate(); $('rResult').style.display='none'; if(R.auth) msg('이미지가 준비됐어요. 아래 정보를 확인하고 [미리보기]를 누르세요.'); },
  onXlsx:function(file){
    if(!root.XLSX||!file||!$('regBox')) return;
    file.arrayBuffer().then(function(buf){
      var v=parseInfoWorkbook(root.XLSX,root.XLSX.read(buf,{type:'array'}));
      var o={}; ['brand','material','origin'].forEach(function(k){ if(v[k]) o[k]=v[k]; });
      if(v.tiers.length||v.cats.length||v.kids){ o.kids=v.kids; o.kidsPrice=v.kidsPrice; o.kidsShow=v.kidsShow; if(v.tiers.length) o.tiers=v.tiers; if(v.cats.length) o.cats=v.cats; }
      fill(o);
      if(v.detail) PA.applyDetail(v.detail,v.sizeTable||[]);
    }).catch(function(){});
  },
  invalidate:invalidate
};
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})(typeof window!=='undefined'?window:globalThis);
