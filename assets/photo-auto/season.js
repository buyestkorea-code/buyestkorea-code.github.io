/* 사진 자동화 → '시즌변경' 탭
 * 예전 틀로 만든 상세페이지 PSD를 올리면, PSD 안의 글자(모델명·제조사·색상…)·실측표·사진 레이어를 읽어
 * "예전 값 → 새 값" 표로 보여주고, 현재 템플릿 입력칸(상품명·정보·실측표·사진)에 그대로 채워 넣는다.
 * 그 뒤는 기존 흐름(상세페이지 만들기 → 글자·사진 수정 → ④ 사이트 등록)과 똑같다.
 * PSD는 브라우저 안에서만 읽는다(서버로 올라가지 않음). 읽기: assets/libs/ag-psd (readPsd)
 */
(function(root){
'use strict';

var $ = function(id){ return document.getElementById(id); };
var api = null, parsed = null, brandList = null;

/* ---- 예전 PSD의 "항목 이름" 글자 → 우리 입력칸 이름 ---- */
var LABELS = {
  '모델명':'상품명','상품명':'상품명','제품명':'상품명',
  '제조사':'브랜드','브랜드':'브랜드',
  '종류':'카테고리','카테고리':'카테고리','품목':'카테고리',
  '제조국':'제조국','원산지':'제조국',
  '색상':'색상','컬러':'색상','색깔':'색상',
  '소재':'소재','재질':'소재',
  '수입여부':'수입여부','제조년월':'제조년월','구성품':'구성품','수납공간':'수납공간','굽높이':'굽높이'
};
/* 예전 틀에서 매번 똑같이 붙던 고정 안내 이미지(크기로 구분) — 사진으로 가져오지 않는다 */
var FIXED_SIZES = [[468,112],[597,174],[602,199],[647,128],[646,30],[718,1407]];
var FIELD_ORDER = ['상품명','브랜드한글','브랜드','카테고리','수입여부','제조년월','색상','제조국','구성품','소재'];

function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function squash(s){ return String(s||'').replace(/\s+/g,''); }

/* ---------- PSD 읽기 ---------- */
function loadLib(){
  if(root.agPsd && root.agPsd.readPsd) return Promise.resolve();
  return new Promise(function(res,rej){
    var s=document.createElement('script'); s.src='assets/libs/ag-psd-28.2.2.bundle.js';
    s.onload=function(){ (root.agPsd&&root.agPsd.readPsd)?res():rej(new Error('PSD 읽기 모듈이 비어 있습니다')); };
    s.onerror=function(){ rej(new Error('PSD 모듈을 불러오지 못했습니다')); };
    document.head.appendChild(s);
  });
}
function leaves(list,out){
  (list||[]).forEach(function(l){
    if(l.hidden) return;
    if(l.children && l.children.length) leaves(l.children,out); else out.push(l);
  });
  return out;
}
function textOf(l){ return l.text && typeof l.text.text==='string' ? l.text.text : ''; }

/* 라벨(모델명 등) 글자 레이어와 같은 줄에서 오른쪽으로 가장 가까운 글자 레이어 = 값 */
function readFields(texts){
  var lab = [], i;
  texts.forEach(function(t){ var k=LABELS[squash(textOf(t))]; if(k) lab.push({k:k,l:t}); });
  var isLab = {}; lab.forEach(function(x){ isLab[texts.indexOf(x.l)] = 1; });
  var out = {}, used = {};
  lab.forEach(function(x){
    var best=null, bd=1e9;
    texts.forEach(function(v,vi){
      if(isLab[vi] || used[vi] || !squash(textOf(v))) return;
      if(Math.abs(v.top - x.l.top) > 10) return;
      var d = v.left - x.l.right; if(d < 0) return;
      if(d < bd){ bd=d; best=vi; }
    });
    if(best!=null && !out[x.k]){ used[best]=1; out[x.k]=String(textOf(texts[best])).replace(/\r\n?|\n/g,'\n').replace(/[ \t]+/g,' ').trim(); }
  });
  return {fields:out, usedIdx:used, labelIdx:isLab};
}

/* 실측표: '사이즈' 로 시작하는 글자 레이어 = 머리글, 그 아래 같은 가로 범위의 글자 레이어 = 줄 */
function readSizeTable(texts, skip){
  var hd=null;
  texts.forEach(function(t,i){ if(skip[i]) return; if(/^사이즈/.test(squash(textOf(t))) && !hd) hd=t; });
  if(!hd) return null;
  function cells(t){
    var raw=String(textOf(t)).replace(/\r\n?|\n/g,'\n').split('\n'), out=[];
    raw.forEach(function(line){
      line=line.replace(/^\s+|\s+$/g,''); if(!line) return;
      var c=line.split(/\s{2,}/); if(c.length<2) c=line.split(/\s+/);
      out.push(c.map(function(x){ return x.trim(); }));
    });
    return out;
  }
  var rows=cells(hd);
  if(!rows.length) return null;
  var width=rows[0].length;
  var below=texts.filter(function(t,i){
    if(skip[i]||t===hd) return false;
    return t.top>hd.bottom-2 && t.top<hd.bottom+260 && t.left>=hd.left-60 && t.right<=hd.right+120 && !/^SIZE/i.test(squash(textOf(t))) && squash(textOf(t));
  }).sort(function(a,b){ return a.top-b.top; });
  below.forEach(function(t){ cells(t).forEach(function(r){ rows.push(r); }); });
  rows=rows.map(function(r){ var o=r.slice(0,width); while(o.length<width) o.push(''); return o; });
  return rows.length>=2 ? rows : null;
}

function hashCanvas(c){
  var s=document.createElement('canvas'); s.width=12; s.height=12;
  var g=s.getContext('2d'); g.fillStyle='#fff'; g.fillRect(0,0,12,12); g.drawImage(c,0,0,12,12);
  var d=g.getImageData(0,0,12,12).data, h=5381;
  for(var i=0;i<d.length;i+=16) h=((h<<5)+h+(d[i]>>2))>>>0;
  return h.toString(36)+'_'+c.width+'x'+c.height;
}
function isFixed(w,h){
  if(w>=700) return true;
  return FIXED_SIZES.some(function(s){ return Math.abs(s[0]-w)<=3 && Math.abs(s[1]-h)<=3; });
}

function parsePsd(buf){
  return loadLib().then(function(){
    var psd=root.agPsd.readPsd(buf,{skipCompositeImageData:true,skipThumbnail:true});
    var all=leaves(psd.children,[]);
    var texts=all.filter(function(l){ return l.text && squash(textOf(l)); });
    var rf=readFields(texts);
    var skip={}; Object.keys(rf.usedIdx).forEach(function(k){ skip[k]=1; }); Object.keys(rf.labelIdx).forEach(function(k){ skip[k]=1; });
    var table=readSizeTable(texts,skip);
    var pix=all.filter(function(l){ return !l.text && l.canvas && l.name!=='Background' && (l.right-l.left)>=300 && (l.bottom-l.top)>=100; })
               .sort(function(a,b){ return a.top-b.top || a.left-b.left; });
    var seen={}, photos=pix.map(function(l,i){
      var w=l.right-l.left, h=l.bottom-l.top, hs=hashCanvas(l.canvas), dup=!!seen[hs]; seen[hs]=1;
      return {canvas:l.canvas,w:w,h:h,top:l.top,name:l.name,dup:dup,fixed:isFixed(w,h),use:!isFixed(w,h),hash:hs};
    });
    return {width:psd.width,height:psd.height,fields:rf.fields,table:table,photos:photos};
  });
}

/* ---------- 값 정리 (예전 표기 → 현재 템플릿 표기) ---------- */
function seasonTokenOf(name){ var m=/(?:^|\s)(\d{2})(SS|FW|AW)(?=\s|$)/i.exec(name||''); return m?{yy:m[1],ss:m[2].toUpperCase()}:null; }
function mfgFrom(yy,ss){ return '20'+yy+' '+({SS:'S/S',FW:'F/W',AW:'A/W'}[ss]||ss); }
function fixMfg(v){ var m=/^(\d{4})\s*(SS|FW|AW|S\/S|F\/W|A\/W)$/i.exec((v||'').trim()); if(!m) return v; var s=m[2].toUpperCase().replace('/',''); return m[1]+' '+({SS:'S/S',FW:'F/W',AW:'A/W'}[s]||m[2]); }
function titleCase(s){ return String(s||'').toLowerCase().replace(/(^|[\s\-\/&.])([a-z])/g,function(_,a,b){ return a+b.toUpperCase(); }); }
function isAllCaps(s){ return /[A-Z]{3,}/.test(s) && s===s.toUpperCase(); }

function newRows(p){
  var f=p.fields, rows=[];
  function add(k,old,nv,note){ rows.push({k:k,old:old||'',nv:nv==null?(old||''):nv,note:note||''}); }
  var name=f['상품명']||'';
  add('상품명',name,name);
  add('브랜드한글','','', '예전 PSD에는 없는 항목 — 새 틀 맨 위 한글 브랜드명이에요');
  add('브랜드',f['브랜드']||'',f['브랜드']||'');
  add('카테고리',f['카테고리']||'',f['카테고리']||'');
  var imp=f['수입여부']||''; add('수입여부',imp,/^병행\s*수입$/.test(imp)?'병행 수입':imp, /^병행수입$/.test(imp)?'현재 표기로 변환':'');
  var mf=f['제조년월']||''; var fm=fixMfg(mf); add('제조년월',mf,fm, fm!==mf?'현재 표기로 변환':'');
  add('색상',f['색상']||'',f['색상']||'');
  add('제조국',f['제조국']||'',f['제조국']||'');
  add('구성품',f['구성품']||'',f['구성품']||'');
  add('소재',f['소재']||'',f['소재']||'');
  return rows;
}

/* ---------- 화면 ---------- */
function setTab(which){
  var s=which==='season';
  $('tabNew').setAttribute('aria-selected',s?'false':'true'); $('tabSeason').setAttribute('aria-selected',s?'true':'false');
  $('tabNew').classList.toggle('on',!s); $('tabSeason').classList.toggle('on',s);
  $('seasonBox').style.display=s?'block':'none';
  $('leadNew').style.display=s?'none':''; $('leadSeason').style.display=s?'':'none';
  try{ sessionStorage.setItem('photoAutoTab',which); }catch(e){}
}

function warnLine(txt,bad){ return '<li'+(bad?' class="bad"':'')+'>'+esc(txt)+'</li>'; }

function drawResult(){
  var p=parsed, box=$('seasonRes'); if(!p){ box.innerHTML=''; return; }
  var h=[], warns=[];
  var got=Object.keys(p.fields).length;
  if(!got) warns.push(['이 PSD에서 모델명·제조사 같은 글자를 읽지 못했어요. 글자가 이미지로 합쳐진(래스터화) PSD일 수 있어요 — 아래 칸을 직접 채워 주세요.',1]);
  if(!p.photos.some(function(x){ return x.use; })) warns.push(['사진으로 쓸 이미지 레이어를 찾지 못했어요. 아래 "사진" 목록에서 고르거나 ② 에서 직접 올려 주세요.',1]);
  var small=p.photos.filter(function(x){ return x.use && x.w<640; });
  if(small.length) warns.push(['PSD 안의 사진은 가로 '+small[0].w+'px 로 줄어 있어요(현재 틀은 650px). 원본 사진이 있으면 ② 파일 칸에 올려 바꾸면 더 선명해요.',0]);
  if(!p.table) warns.push(['실측표를 읽지 못했어요 — 적용 뒤 ③ 실측 표를 직접 채워 주세요.',0]);

  h.push('<div class="sv-meta">'+esc(p.fileName)+' · '+p.width+'×'+p.height+'px · 글자 '+got+'개 항목 · 사진 후보 '+p.photos.length+'장</div>');

  /* 새 시즌 */
  var tk=seasonTokenOf(p.fields['상품명']||'');
  h.push('<div class="sv-season"><label for="svSeason"><b>새 시즌</b> <span class="hint">상품명 앞 시즌과 제조년월에 한 번에 반영돼요</span></label>'+
    '<div class="row"><input type="text" id="svSeason" placeholder="예) 26FW" maxlength="6" style="width:120px"><span class="hint" id="svSeasonNote">'+(tk?'예전 시즌: '+esc(tk.yy+tk.ss):'예전 상품명에서 시즌을 못 찾았어요 — 입력하면 맨 앞에 붙여요')+'</span></div></div>');

  /* 변경 전 → 변경 후 */
  h.push('<table class="sv-tbl"><thead><tr><th>항목</th><th>예전 PSD</th><th>새 값 <span class="hint">(고쳐 쓰세요)</span></th><th></th></tr></thead><tbody>');
  p.rows.forEach(function(r,i){
    var multi=(r.k==='소재'||r.k==='상품명');
    h.push('<tr data-i="'+i+'"><th>'+esc(r.k)+'</th><td class="old">'+(r.old?esc(r.old).replace(/\n/g,'<br>'):'<span class="hint">—</span>')+'</td><td>'+
      (multi?'<textarea rows="2" data-nv="'+i+'">'+esc(r.nv)+'</textarea>':'<input type="text" data-nv="'+i+'" value="'+esc(r.nv)+'"'+(r.k==='브랜드한글'?' list="svBrandList" placeholder="예) 비비안웨스트우드"':'')+'>')+
      '</td><td class="nt" data-nt="'+i+'"></td></tr>');
  });
  h.push('</tbody></table><datalist id="svBrandList"></datalist>');

  /* 실측표 */
  if(p.table){
    h.push('<div class="sv-sub"><b>실측표</b> <span class="hint">(적용하면 ③ 실측 표에 들어가요)</span></div><div style="overflow:auto"><table class="sv-mini">'+
      p.table.map(function(r,ri){ return '<tr>'+r.map(function(c){ return (ri?'<td>':'<th>')+esc(c)+(ri?'</td>':'</th>'); }).join('')+'</tr>'; }).join('')+'</table></div>');
  }

  /* 사진 */
  h.push('<div class="sv-sub"><b>사진</b> <span class="hint">(위에서부터 순서대로 들어가고 첫 사진이 메인이에요 · 체크 해제하면 제외)</span></div><div class="sv-ph">');
  p.photos.forEach(function(x,i){
    if(x.fixed) return;
    h.push('<label class="sv-p"><input type="checkbox" data-ph="'+i+'"'+(x.use?' checked':'')+'><img alt="" data-phimg="'+i+'"><span>'+x.w+'×'+x.h+(x.dup?' · 앞 사진과 같음':'')+'</span></label>');
  });
  h.push('</div>');
  var fx=p.photos.filter(function(x){ return x.fixed; });
  if(fx.length){
    h.push('<details class="sv-fx"><summary>자동으로 뺀 고정 안내 이미지 '+fx.length+'장 (배송·병행수입·A/S 안내 등 — 새 틀에 이미 들어 있어요)</summary><div class="sv-ph">');
    p.photos.forEach(function(x,i){ if(!x.fixed) return; h.push('<label class="sv-p"><input type="checkbox" data-ph="'+i+'"><img alt="" data-phimg="'+i+'"><span>'+x.w+'×'+x.h+'</span></label>'); });
    h.push('</div></details>');
  }

  h.push('<ul class="warns" id="svWarns">'+warns.map(function(w){ return warnLine(w[0],w[1]); }).join('')+'</ul>');
  h.push('<div class="row" style="margin-top:10px"><button class="btn btn-pri" id="svApply" type="button">현재 템플릿으로 적용</button><button class="btn btn-out" id="svApplyGo" type="button">적용하고 상세페이지 만들기</button><span class="hint" id="svStatus"></span></div>');
  h.push('<div class="hint" style="margin-top:6px">적용하면 아래 ① 상품명 · ③ 상세 정보 · 실측표 · ② 사진 칸이 채워져요. 하단 안내 이미지가 브랜드마다 달라서 <b>① 에서 템플릿(하단 안내)은 직접 골라 주세요</b>. 만든 뒤에는 글자·사진을 눌러 고치고 ④ 사이트 등록까지 기존과 똑같이 진행합니다.</div>');
  box.innerHTML=h.join('');

  /* 썸네일 */
  p.photos.forEach(function(x,i){
    var img=box.querySelector('[data-phimg="'+i+'"]'); if(!img) return;
    var t=document.createElement('canvas'), s=Math.min(1,120/Math.max(x.w,x.h)); t.width=Math.round(x.w*s); t.height=Math.round(x.h*s);
    var g=t.getContext('2d'); g.fillStyle='#fff'; g.fillRect(0,0,t.width,t.height); g.drawImage(x.canvas,0,0,t.width,t.height);
    img.src=t.toDataURL('image/jpeg',0.8);
  });

  wireResult();
  fillBrandList();
  refreshNotes();
}

function rowsIn(){ return parsed.rows; }
function refreshNotes(){
  parsed.rows.forEach(function(r,i){
    var td=$('seasonRes').querySelector('[data-nt="'+i+'"]'); if(!td) return;
    var chips=[], ch=(r.nv||'')!==(r.old||'');
    if(r.note && ch && r.k!=='브랜드한글') chips.push('<span class="chip cok">'+esc(r.note)+'</span>');
    else if(ch && r.old) chips.push('<span class="chip cwarn">바뀜</span>');
    if(r.k==='브랜드한글' && !String(r.nv).trim()) chips.push('<span class="chip cbad">입력 필요</span>');
    if(r.k==='브랜드' && isAllCaps(r.nv)) chips.push('<button type="button" class="btn btn-out btn-sm" data-act="title" data-i="'+i+'" title="'+esc(titleCase(r.nv))+'">첫 글자만 대문자로</button>');
    if(r.k==='제조국' && /이태리/.test(r.nv)) chips.push('<button type="button" class="btn btn-out btn-sm" data-act="italy" data-i="'+i+'">이탈리아로</button>');
    td.innerHTML=chips.join(' ');
  });
}
function setNv(i,v){
  parsed.rows[i].nv=v;
  var el=$('seasonRes').querySelector('[data-nv="'+i+'"]'); if(el && el.value!==v) el.value=v;
}
function rowOf(k){ return parsed.rows.filter(function(r){ return r.k===k; })[0]; }
function idxOf(k){ return parsed.rows.indexOf(rowOf(k)); }

function applySeason(txt){
  var v=String(txt||'').trim().toUpperCase().replace(/\s+/g,''), m=/^(\d{2})(SS|FW|AW)$/.exec(v), note=$('svSeasonNote');
  if(!v){ note.textContent=''; return; }
  if(!m){ note.textContent='예) 26FW · 27SS 형식으로 적어 주세요'; return; }
  var nameRow=rowOf('상품명'), nm=nameRow.nv||'';
  if(/(?:^|\s)\d{2}(SS|FW|AW)(?=\s|$)/i.test(nm)) nm=nm.replace(/(^|\s)\d{2}(SS|FW|AW)(?=\s|$)/i,'$1'+v); else nm=(v+' '+nm).trim();
  setNv(idxOf('상품명'),nm);
  var mfRow=rowOf('제조년월'); setNv(idxOf('제조년월'),mfgFrom(m[1],m[2])); mfRow.note='새 시즌 반영';
  note.textContent='상품명 · 제조년월에 반영했어요';
  refreshNotes();
}

function wireResult(){
  var box=$('seasonRes');
  box.addEventListener('input',function(e){
    var t=e.target;
    if(t.dataset.nv!=null){ parsed.rows[+t.dataset.nv].nv=t.value; parsed.rows[+t.dataset.nv].note=''; refreshNotes(); }
    else if(t.id==='svSeason') applySeason(t.value);
  });
  box.addEventListener('change',function(e){ var t=e.target; if(t.dataset.ph!=null) parsed.photos[+t.dataset.ph].use=t.checked; });
  box.addEventListener('click',function(e){
    var t=e.target;
    if(t.dataset.act==='title'){ var i=+t.dataset.i; setNv(i,titleCase(parsed.rows[i].nv)); refreshNotes(); }
    else if(t.dataset.act==='italy'){ var j=+t.dataset.i; setNv(j,parsed.rows[j].nv.replace(/이태리/g,'이탈리아')); refreshNotes(); }
    else if(t.id==='svApply') doApply(false);
    else if(t.id==='svApplyGo') doApply(true);
  });
}

function fillBrandList(){
  function put(list){ var dl=$('svBrandList'); if(!dl) return; dl.innerHTML=list.map(function(b){ return '<option value="'+esc(b)+'">'; }).join(''); }
  if(brandList) return put(brandList);
  fetch('assets/photo-auto/namebook.json').then(function(r){ return r.json(); }).then(function(j){ brandList=Object.keys(j.brands||{}); put(brandList); }).catch(function(){});
}

/* ---------- 적용 ---------- */
function canvasToFile(c,name){
  return new Promise(function(res){ c.toBlob(function(b){ res(new File([b],name,{type:'image/png',lastModified:1700000000000})); },'image/png'); });
}
function doApply(thenGo){
  var st=$('svStatus'), p=parsed; if(!p) return;
  var use=p.photos.filter(function(x){ return x.use; });
  if(!use.length){ st.textContent='사진이 한 장도 선택되지 않았어요.'; return; }
  var ko=(rowOf('브랜드한글').nv||'').trim(), body=(rowOf('상품명').nv||'').trim();
  if(!body){ st.textContent='상품명을 입력해 주세요.'; return; }
  if(api.hasPhotos() && !confirm('이미 올려 둔 사진 '+api.hasPhotos()+'장이 있어요. 지우고 PSD의 사진으로 바꿀까요?')) return;
  st.textContent='적용하는 중…';
  Promise.all(use.map(function(x,i){ return canvasToFile(x.canvas,'psd_'+('0'+(i+1)).slice(-2)+'.png'); })).then(function(files){
    api.setPhotos(files);
    api.setPname((ko?ko+' ':'')+body);
    p.rows.forEach(function(r){
      if(r.k==='상품명'||r.k==='브랜드한글') return;
      if(String(r.nv||'').trim()) api.setField(r.k,r.nv.trim());
    });
    if(p.table){ api.setChartFull(); api.setGrid(p.table); }
    st.textContent='적용했어요 — 아래 ①·②·③ 에 채워졌습니다. 템플릿을 고른 뒤 "상세페이지 만들기"를 누르세요.';
    if(thenGo){
      if(!api.tplChosen() && !confirm('① 템플릿(하단 안내)을 아직 고르지 않았어요. 이대로 만들까요?')){ api.scrollTop(); return; }
      api.go();
    } else api.scrollTop();
  }).catch(function(e){ st.textContent='적용 실패: '+e.message; console.error(e); });
}

/* ---------- 파일 받기 ---------- */
function onFile(files){
  var f=files.filter(function(x){ return /\.psd$/i.test(x.name); })[0];
  var st=$('seasonLoad');
  if(!f){ st.textContent='PSD 파일(.psd)을 올려 주세요.'; return; }
  st.textContent='PSD 읽는 중… ('+Math.round(f.size/1048576*10)/10+'MB)';
  f.arrayBuffer().then(parsePsd).then(function(p){
    p.fileName=f.name; p.rows=newRows(p); parsed=p;
    st.textContent='✔ '+f.name+(files.length>1?' (여러 개를 올리셨다면 첫 PSD만 읽어요)':'');
    drawResult();
  }).catch(function(e){ st.textContent='PSD를 읽지 못했습니다: '+e.message; console.error(e); });
}

function init(a){
  api=a;
  $('tabNew').addEventListener('click',function(){ setTab('new'); });
  $('tabSeason').addEventListener('click',function(){ setTab('season'); });
  var box=$('seasonDrop'), inp=$('seasonFile');
  box.addEventListener('click',function(){ inp.click(); });
  box.addEventListener('keydown',function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); inp.click(); } });
  inp.addEventListener('change',function(){ if(inp.files.length) onFile([].slice.call(inp.files)); inp.value=''; });
  ['dragenter','dragover'].forEach(function(ev){ box.addEventListener(ev,function(e){ e.preventDefault(); box.classList.add('on'); }); });
  ['dragleave','drop'].forEach(function(ev){ box.addEventListener(ev,function(e){ e.preventDefault(); box.classList.remove('on'); }); });
  box.addEventListener('drop',function(e){ onFile([].slice.call(e.dataTransfer.files)); });
  var t='new'; try{ t=sessionStorage.getItem('photoAutoTab')==='season'?'season':'new'; }catch(e){}
  setTab(t);
}

root.PhotoSeason={init:init,_parsePsd:parsePsd,_newRows:newRows};
})(window);
