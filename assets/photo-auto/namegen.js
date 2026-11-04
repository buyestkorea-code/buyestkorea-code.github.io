/* 사진 자동화 → AI 상품명 자동생성
 * 올린 상품 사진(최대 3장)을 name-worker(Claude)에 보내, 바이스트 메인·키즈 사이트 상품명 문법에 맞는 후보 4개를 받는다.
 * 후보를 고르면 위쪽 '상품명' 입력칸이 채워지고 상세 정보가 자동으로 따라 채워진다.
 * 브랜드·시즌·품번은 AI가 지어내지 않는다 — 입력칸 값을 그대로 앞뒤에 붙인다.
 * 인증: 툴킷 로그인 계정(localStorage buyest.dash.auth). 키는 Worker 비밀값에만 있다.
 */
(function(root){
'use strict';
var WK='https://buyest-namegen.buyest.workers.dev';
var TAGS=['간결형','표준형','디테일형','대안 표기'];
var ctx=null, busy=false, userEdited={brand:false,season:false,code:false}, lastReq=0;

function $(id){ return document.getElementById(id); }
function auth(){ try{ var a=JSON.parse(localStorage.getItem('buyest.dash.auth')||'null'); return a&&a.id&&a.pass?a:null; }catch(e){ return null; } }
function esc(s){ return String(s).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

function toSmallJpeg(file,max){
  return createImageBitmap(file).then(function(bm){
    var s=Math.min(1,max/Math.max(bm.width,bm.height)), w=Math.max(1,Math.round(bm.width*s)), h=Math.max(1,Math.round(bm.height*s));
    var c=document.createElement('canvas'); c.width=w; c.height=h;
    var g=c.getContext('2d'); g.fillStyle='#fff'; g.fillRect(0,0,w,h); g.drawImage(bm,0,0,w,h);
    if(bm.close) bm.close();
    return c.toDataURL('image/jpeg',0.82);
  });
}

/* 입력칸 ← 위쪽 상품명에서 읽은 값 (직원이 직접 고친 칸은 건드리지 않음) */
function prefill(){
  if(!ctx) return;
  var p=ctx.parsed(), name=ctx.pname(), m=/(?:^|\s)(\d{2}(?:SS|FW|AW|F\/W|S\/S|A\/W))(?:\s|$)/i.exec(name);
  var t=name.trim().split(/\s+/), i=t.length; while(i>0 && !/[가-힣]/.test(t[i-1])) i--;
  var map={brand:p.brandKo||'',season:m?m[1].replace(/\//g,'').toUpperCase():'',code:t.slice(i).join(' ')};
  Object.keys(map).forEach(function(k){ if(!userEdited[k] && map[k]) $('ng_'+k).value=map[k]; });
}

function setBusy(on,msg){
  busy=on; $('ngGo').disabled=on; $('ngGo').textContent=on?'분석 중… (10~20초)':'AI로 이름 만들기';
  if(msg!=null) $('ngMsg').innerHTML=msg;
}
function fail(t){ setBusy(false,'<span style="color:var(--bad)">'+esc(t)+'</span>'); }

function assemble(name){
  var b=$('ng_brand').value.trim().replace(/\s+/g,''), code=$('ng_code').value.trim();
  return [b,name,code].filter(Boolean).join(' ');
}
function tokensHtml(full){
  var b=$('ng_brand').value.trim().replace(/\s+/g,''), code=$('ng_code').value.trim(), out='';
  var rest=full;
  if(b && rest.indexOf(b)===0){ out+='<span class="ngb">'+esc(b)+'</span> '; rest=rest.slice(b.length).trim(); }
  var tail='';
  if(code && rest.lastIndexOf(code)===rest.length-code.length){ tail=code; rest=rest.slice(0,rest.length-code.length).trim(); }
  return out+rest.split(/\s+/).map(function(w,i,a){
    if(/^\d{2}(SS|FW|AW)$/i.test(w)) return '<span class="ngs">'+esc(w)+'</span>';
    if(i===a.length-1) return '<span class="ngc">'+esc(w)+'</span>';
    return esc(w);
  }).join(' ')+(tail?' <span class="ngk">'+esc(tail)+'</span>':'');
}

function render(res){
  var box=$('ngList'); box.innerHTML='';
  res.candidates.forEach(function(c,i){
    var full=assemble(c.name), el=document.createElement('div'); el.className='ngcard';
    el.innerHTML='<div class="ngtag">'+esc(TAGS[i]||('후보 '+(i+1)))+'</div>'+
      '<div class="ngname" data-full="'+esc(full)+'">'+tokensHtml(full)+'</div>'+
      (c.note?'<div class="hint ngnote">'+esc(c.note)+'</div>':'')+
      '<div class="row"><button type="button" class="btn btn-pri btn-sm" data-use="'+i+'">이 이름 사용</button>'+
      '<button type="button" class="btn btn-out btn-sm" data-edit="'+i+'">수정해서 사용</button>'+
      '<button type="button" class="btn btn-out btn-sm" data-copy="'+i+'">복사</button></div>';
    box.appendChild(el);
  });
  box._cands=res.candidates;
  var meta=[]; if(res.item) meta.push('아이템 '+res.item); if(res.color) meta.push('색상 '+res.color);
  meta.push(res.brandMatched?('<b>'+esc(res.brandMatched)+'</b> 브랜드 작명 예시 반영'):'브랜드 예시 없음 — 전체 상품명 기준');
  $('ngMsg').innerHTML='AI가 읽은 값: '+meta.join(' · ')+' <span class="hint">· 브랜드·시즌·품번은 위 칸 그대로 붙였습니다</span>';
}

function generate(){
  if(busy) return;
  var a=auth();
  if(!a){ fail('툴킷에 로그인한 뒤 새로고침해 주세요.'); return; }
  var photos=ctx.photos();
  if(!photos.length){ fail('위에서 상품 사진을 먼저 올려 주세요. (최대 3장까지 분석)'); return; }
  var req=++lastReq; setBusy(true,'사진 '+Math.min(3,photos.length)+'장을 읽는 중…');
  Promise.all(photos.slice(0,3).map(function(p){ return toSmallJpeg(p.file,1024); })).then(function(imgs){
    return fetch(WK+'/api/names',{method:'POST',headers:{'Content-Type':'application/json','X-Studio-User':a.id,'X-Studio-Pass':a.pass},
      body:JSON.stringify({images:imgs,brand:$('ng_brand').value.trim(),season:$('ng_season').value.trim(),code:$('ng_code').value.trim(),kind:$('ng_kind').value,hint:$('ng_hint').value.trim()})});
  }).then(function(r){ return r.json().catch(function(){ return {ok:false,error:'서버 응답을 읽지 못했습니다.'}; }); })
  .then(function(res){
    if(req!==lastReq) return;
    if(!res.ok){ fail(res.error||'이름을 만들지 못했습니다.'); return; }
    setBusy(false); render(res);
  }).catch(function(e){ fail('이름을 만들지 못했습니다: '+(e&&e.message||e)); });
}

function use(i,edit){
  var box=$('ngList'), c=box._cands&&box._cands[i]; if(!c) return;
  var full=assemble(c.name);
  ctx.setPname(full);
  Array.prototype.forEach.call(box.querySelectorAll('.ngcard'),function(el,k){ el.classList.toggle('on',k===i); });
  $('ngMsg').innerHTML='<span style="color:var(--ok)">✔ 상품명 칸에 넣었습니다.</span> 브랜드·색상 등 틀린 부분은 위 상품명 칸에서 바로 고치세요.';
  if(edit){ var p=$('pname'); p.scrollIntoView({block:'center',behavior:'smooth'}); setTimeout(function(){ p.focus(); },250); }
}

function init(c){
  ctx=c;
  var host=$('ngHost'); if(!host) return;
  host.innerHTML=
    '<div class="nghead"><b>AI 이름 자동생성</b><span class="hint">메인·키즈 사이트 상품 약 2만 3천 개의 이름 문법을 학습 · 사진 최대 3장 분석 · 후보 4개</span></div>'+
    '<div class="ngform">'+
      '<div><label>브랜드(한글)</label><input type="text" id="ng_brand" placeholder="예) 스톤아일랜드"></div>'+
      '<div><label>시즌</label><input type="text" id="ng_season" placeholder="예) 26SS"></div>'+
      '<div><label>품번</label><input type="text" id="ng_code" placeholder="예) L1S15 4100106 S0183"></div>'+
      '<div><label>사이트</label><select id="ng_kind"><option value="auto">사진으로 판단</option><option value="adult">메인 (성인)</option><option value="kids">키즈</option></select></div>'+
      '<div class="wide"><label>메모 <span class="hint">(선택 · AI가 사진만으로 모르는 것: 소재, 모델명, 라인 등)</span></label><input type="text" id="ng_hint" placeholder="예) 모델명 란스 LANS, 경량 나일론"></div>'+
    '</div>'+
    '<div class="row" style="margin-top:10px"><button type="button" class="btn btn-pri" id="ngGo">AI로 이름 만들기</button><span id="ngMsg" class="hint"></span></div>'+
    '<div id="ngList" class="nglist"></div>';
  ['brand','season','code'].forEach(function(k){ $('ng_'+k).addEventListener('input',function(){ userEdited[k]=true; }); });
  $('ngGo').addEventListener('click',generate);
  $('ngList').addEventListener('click',function(e){
    var t=e.target; if(!t.dataset) return;
    if(t.dataset.use!=null) use(+t.dataset.use,false);
    else if(t.dataset.edit!=null) use(+t.dataset.edit,true);
    else if(t.dataset.copy!=null){ var c=$('ngList')._cands[+t.dataset.copy]; if(c){ var txt=assemble(c.name); (navigator.clipboard?navigator.clipboard.writeText(txt):Promise.reject()).then(function(){ t.textContent='복사됨'; setTimeout(function(){ t.textContent='복사'; },1200); },function(){ $('ngMsg').textContent='복사하지 못했습니다. 이름을 직접 선택해 복사해 주세요.'; }); } }
  });
  /* 서버 준비 여부 */
  fetch(WK+'/api/health').then(function(r){ return r.json(); }).then(function(h){
    if(!h.ready){ $('ngGo').disabled=true; $('ngMsg').innerHTML='<span style="color:var(--warn)">AI 서버 준비 중입니다 (관리자 설정 대기).</span>'; }
  }).catch(function(){ $('ngGo').disabled=true; $('ngMsg').innerHTML='<span style="color:var(--warn)">AI 서버에 연결되지 않았습니다 (아직 배포 전이거나 일시 장애).</span>'; });
  prefill();
}

root.NameGen={init:init,prefill:prefill};
})(window);
