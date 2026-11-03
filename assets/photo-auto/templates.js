/* 사진 자동화 템플릿 — 상세페이지최종_KIDS(CAC) PSD 10개를 보고 만든 것
 *  · 정보 항목(Information 표 줄)  · 실측표 표시 방식(full 표 / notice 오차 안내만 / none 없음)
 *  · 하단 안내 이미지(반품·교환 예시 사진이 브랜드마다 다름)  · 기본 실측 항목
 * 템플릿을 더 만들려면 TEMPLATES 에 한 줄 추가하면 된다.
 */
(function(root){
'use strict';

var KIDS_PARTS={'구성품':'정품택 + 정품제품 + 자체보증서'};   // 키즈 PSD 공통 구성품 문구
var ROWS9=['상품명','브랜드','카테고리','수입여부','제조년월','색상','제조국','구성품','소재'];
var ROWS8=['상품명','브랜드','카테고리','수입여부','색상','제조국','구성품','소재'];                 // 시즌 없음(제조년월 줄 없음)
var ROWS_SHOES=['상품명','브랜드','카테고리','수입여부','제조년월','색상','굽높이','제조국','구성품','소재'];

/* 하단 안내 이미지: ''(빈 값) = 기본 assets/photo-auto/bottom.png, 나머지는 assets/photo-auto/bottoms/<키>.png */
var BOTTOMS=[
  {k:'',        name:'공통 (기본)'},
  {k:'cloth',   name:'의류 (라벨 랜덤발송 안내 포함)'},
  {k:'noseason',name:'시즌 없이 작업'},
  {k:'nosize',  name:'사이즈 기재 안 함'},
  {k:'cp',      name:'C.P 컴퍼니'},
  {k:'chloe',   name:'끌로에'},
  {k:'moncler', name:'몽클레어'},
  {k:'burberry',name:'버버리'},
  {k:'stone',   name:'스톤 아일랜드'}
];

var TEMPLATES=[
  {id:'common',  name:'공통 (실측표 없음)',          src:'!!_상세페이지_공통_KIDS.psd',    rows:ROWS9,  chart:'none',   bottom:'',defaults:KIDS_PARTS},
  {id:'cloth',   name:'의류 (실측표 + 라벨 안내)',    src:'의류.psd',                       rows:ROWS9,  chart:'full',   bottom:'cloth',   items:'top',defaults:KIDS_PARTS},
  {id:'shoes',   name:'슈즈 (굽높이 · MM 실측)',      src:'슈즈.psd',                       rows:ROWS_SHOES, chart:'full', bottom:'',      items:'shoeUS', defaults:{'구성품':'정품케이스 + 정품제품 + 자체보증서'}},
  {id:'noseason',name:'시즌 없이 작업 (제조년월 줄 없음)', src:'시즌없이작업하는경우.psd',    rows:ROWS8,  chart:'full',   bottom:'noseason',items:'top',defaults:KIDS_PARTS},
  {id:'nosize',  name:'사이즈 기재 안 함 (오차 안내만)', src:'사이즈기재안하는경우.psd',     rows:ROWS9,  chart:'notice', bottom:'nosize',defaults:KIDS_PARTS},
  {id:'cp',      name:'브랜드 · C.P 컴퍼니',          src:'상세페이지_CP_KIDS.psd',          rows:ROWS9,  chart:'none',   bottom:'cp',defaults:KIDS_PARTS},
  {id:'chloe',   name:'브랜드 · 끌로에',              src:'상세페이지_끌로에_KIDS.psd',      rows:ROWS9,  chart:'none',   bottom:'chloe',defaults:KIDS_PARTS},
  {id:'moncler', name:'브랜드 · 몽클레어',            src:'상세페이지_몽클레어_KIDS.psd',    rows:ROWS9,  chart:'none',   bottom:'moncler',defaults:KIDS_PARTS},
  {id:'burberry',name:'브랜드 · 버버리',              src:'상세페이지_버버리_KIDS.psd',      rows:ROWS9,  chart:'none',   bottom:'burberry',defaults:KIDS_PARTS},
  {id:'stone',   name:'브랜드 · 스톤 아일랜드',        src:'상세페이지_스톤_KIDS.psd',        rows:ROWS9,  chart:'none',   bottom:'stone',defaults:KIDS_PARTS}
];

/* 실측 "항목" 세트 — 표 맨 윗줄 (corner = 왼쪽 위 칸 이름, rows = 비어 있을 때 넣을 기본 사이즈 줄) */
var ITEMS=[
  {k:'top',   name:'상의 (어깨·가슴·소매·총장)',   corner:'사이즈',    cols:['어깨너비','가슴단면','소매길이','총장'],        rows:['S','M','L']},
  {k:'raglan',name:'상의 라글란 (어깨+소매·가슴·총길이)', corner:'사이즈', cols:['어깨+소매길이','가슴단면','총길이'],            rows:['S','M','L']},
  {k:'pants', name:'하의 (허리·밑위·허벅지·밑단·총길이)', corner:'사이즈', cols:['허리단면','밑위','허벅지단면','밑단','총길이'], rows:['S','M','L']},
  {k:'bag',   name:'가방·지갑 (가로·세로·폭)',     corner:'사이즈',    cols:['가로','세로','폭'],                              rows:['단품']},
  {k:'wh',    name:'단품 (가로·세로)',            corner:'사이즈',    cols:['가로','세로'],                                  rows:['단품']},
  {k:'belt',  name:'벨트 (폭·길이)',              corner:'사이즈',    cols:['폭','길이(버클제외)'],                          rows:['85','90','95','100']},
  {k:'shoeUS',name:'신발 US + MM',               corner:'사이즈(US)',cols:['MM'],                                          rows:['5','6','7','8','9','10','11']},
  {k:'shoeEU',name:'신발 EU + MM',               corner:'사이즈',    cols:['MM'],                                          rows:['39','40','41','42','43','44','45']}
];

/* 사이즈 세트 — 표 첫 칸(줄 이름). 옵션 1 값도 같이 채워진다. mm = 신발 MM 값(PSD 에 있던 대응표) */
function seq(a,b,step){ var o=[]; for(var v=a; v<=b+1e-9; v+=step) o.push(String(Math.round(v*10)/10)); return o; }
var SIZES=[
  {k:'one',   name:'단품',            v:['단품']},
  {k:'xs-xl', name:'XS S M L XL',     v:['XS','S','M','L','XL']},
  {k:'s-xl',  name:'S M L XL',        v:['S','M','L','XL']},
  {k:'s-xxl', name:'S ~ XXL',         v:['S','M','L','XL','XXL']},
  {k:'s-xxxl',name:'S ~ XXXL',        v:['S','M','L','XL','XXL','XXXL']},
  {k:'xxs-xl',name:'XXS ~ XL',        v:['XXS','XS','S','M','L','XL']},
  {k:'n0-5',  name:'0 1 2 3 4 5',     v:['0','1','2','3','4','5']},
  {k:'n1-6',  name:'1 2 3 4 5 6',     v:['1','2','3','4','5','6']},
  {k:'e34-44',name:'34 36 38 40 42 44', v:['34','36','38','40','42','44']},
  {k:'e36-46',name:'36 38 40 42 44 46', v:['36','38','40','42','44','46']},
  {k:'e44-54',name:'44 46 48 50 52 54', v:['44','46','48','50','52','54']},
  {k:'a4-14', name:'키즈 4A ~ 14A',    v:['4A','6A','8A','10A','12A','14A']},
  {k:'a3-10', name:'키즈 3A ~ 10A',    v:['3A','4A','5A','6A','7A','8A','10A']},
  {k:'belt',  name:'벨트 85 ~ 115',    v:['85','90','95','100','105','110','115']},
  {k:'us5-11',name:'신발 US 5 ~ 11',   v:['5','6','7','8','9','10','11'],       mm:['220','230','240','250','260','270','280']},
  {k:'us6-10',name:'신발 US 6 ~ 10 (0.5 간격)', v:seq(6,10,0.5),               mm:['240','245','250','255','260','265','270','275','280']},
  {k:'eu39-45',name:'신발 EU 39 ~ 45', v:['39','40','41','42','43','44','45'],  mm:['255','260','265','270','275','280','285']},
  {k:'eu35-45',name:'신발 EU 35 ~ 45', v:seq(35,45,1)}
];

function byId(list,k){ for(var i=0;i<list.length;i++) if(list[i].k===k||list[i].id===k) return list[i]; return null; }
root.PhotoTpl={TEMPLATES:TEMPLATES,BOTTOMS:BOTTOMS,ITEMS:ITEMS,SIZES:SIZES,
  tpl:function(id){ return byId(TEMPLATES,id); }, item:function(k){ return byId(ITEMS,k); }, size:function(k){ return byId(SIZES,k); }};
})(typeof window!=='undefined'?window:globalThis);
