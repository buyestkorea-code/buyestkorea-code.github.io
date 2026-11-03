/* 상품정보 기본양식 엑셀 생성기 (서식 포함: ExcelJS)
 * 한 장짜리 시트: 기존 '기본틀'(서버 자동등록 칸 위치 D6~D11, D17~F18, D20~H23)을 그대로 두고,
 * 그 아래에 사진 자동화용 항목(상세 정보·추가 항목)을 이어 붙이고, 오른쪽 J~L열에 참고 메뉴 목록을 둔다.
 * 읽기는 register.js 의 parseInfoWorkbook 이 같은 칸 규칙으로 처리한다.
 */
(function(root){
'use strict';
var REF={"J3":"메뉴카테고리","J4":"WOMEN","K4":"MEN","L4":"KIDS","J5":"WOMEN > 의류 카테고리","K5":"MEN > 의류 카테고리","L5":"KIDS > 여성용 KIDS","J6":"WOMEN > 의류 카테고리 > 티셔츠","K6":"MEN > 의류 카테고리 > 티셔츠","L6":"KIDS > 여성용 KIDS > 아우터","J7":"WOMEN > 의류 카테고리 > 맨투맨","K7":"MEN > 의류 카테고리 > 맨투맨","L7":"KIDS > 여성용 KIDS > 반팔티셔츠","J8":"WOMEN > 의류 카테고리 > 후드티","K8":"MEN > 의류 카테고리 > 후드티","L8":"KIDS > 여성용 KIDS > 긴팔티셔츠","J9":"WOMEN > 의류 카테고리 > 니트/스웨터","K9":"MEN > 의류 카테고리 > 니트/스웨터","L9":"KIDS > 여성용 KIDS > 남방/셔츠","J10":"WOMEN > 의류 카테고리 > 남방/셔츠","K10":"MEN > 의류 카테고리 > 남방/셔츠","L10":"KIDS > 여성용 KIDS > 니트/스웨터","J11":"WOMEN > 의류 카테고리 > 자켓","K11":"MEN > 의류 카테고리 > 자켓","L11":"KIDS > 여성용 KIDS > 바지","J12":"WOMEN > 의류 카테고리 > 바지","K12":"MEN > 의류 카테고리 > 바지","L12":"KIDS > 여성용 KIDS > 치마","J13":"WOMEN > 의류 카테고리 > 정장","K13":"MEN > 의류 카테고리 > 정장","L13":"KIDS > 여성용 KIDS > 원피스","J14":"WOMEN > 의류 카테고리 > 스커트","K14":"MEN > 의류 카테고리 > 기타","L14":"KIDS > 여성용 KIDS > 슈즈","J15":"WOMEN > 의류 카테고리 > 기타","K15":"MEN > 슈즈","L15":"KIDS > 의류 카테고리","J16":"WOMEN > 슈즈","K16":"MEN > 슈즈 > 구두","L16":"KIDS > 의류 카테고리 > 아우터","J17":"WOMEN > 슈즈 > 구두","K17":"MEN > 슈즈 > 스니커즈","L17":"KIDS > 의류 카테고리 > 반팔티셔츠","J18":"WOMEN > 슈즈 > 스니커즈","K18":"MEN > 슈즈 > 로퍼","L18":"KIDS > 의류 카테고리 > 긴팔티셔츠","J19":"WOMEN > 슈즈 > 로퍼","K19":"MEN > 슈즈 > 부츠","L19":"KIDS > 의류 카테고리 > 남방/셔츠","J20":"WOMEN > 슈즈 > 부츠","K20":"MEN > 슈즈 > 기타","L20":"KIDS > 의류 카테고리 > 니트/스웨터","J21":"WOMEN > 슈즈 > 기타","K21":"MEN > 가방","L21":"KIDS > 의류 카테고리 > 바지","J22":"WOMEN > 가방","K22":"MEN > 가방 > 숄더","L22":"KIDS > 의류 카테고리 > 치마","J23":"WOMEN > 가방 > 숄더","K23":"MEN > 가방 > 크로스백","L23":"KIDS > 의류 카테고리 > 원피스","J24":"WOMEN > 가방 > 크로스백","K24":"MEN > 가방 > 토트","L24":"KIDS > 슈즈","J25":"WOMEN > 가방 > 토트","K25":"MEN > 가방 > 백팩","L25":"KIDS > 패션잡화","J26":"WOMEN > 가방 > 백팩","K26":"MEN > 가방 > 기타","L26":"GOLF","J27":"WOMEN > 가방 > 기타","K27":"MEN > 지갑/벨트","L27":"GOLF > WOMEN","J28":"WOMEN > 지갑/벨트","K28":"MEN > 지갑/벨트 > 남성용지갑","L28":"GOLF > WOMEN > 의류","J29":"WOMEN > 지갑/벨트 > 여성용지갑","K29":"MEN > 지갑/벨트 > 명함지갑","L29":"GOLF > WOMEN > 슈즈","J30":"WOMEN > 지갑/벨트 > 여성용장지갑","K30":"MEN > 지갑/벨트 > 키지갑","L30":"GOLF > WOMEN > 가방","J31":"WOMEN > 지갑/벨트 > 여성용중지갑","K31":"MEN > 지갑/벨트 > 남성용벨트","L31":"GOLF > WOMEN > 지갑/벨트","J32":"WOMEN > 지갑/벨트 > 여성용벨트","K32":"MEN > 패션잡화","L32":"GOLF > WOMEN > 패션잡화","J33":"WOMEN > 패션잡화","K33":"NEW IN","L33":"GOLF > MEN","K34":"SALE","L34":"GOLF > MEN > 의류","K35":"SCRATCH","L35":"GOLF > MEN > 슈즈","L36":"GOLF > MEN > 가방","L37":"GOLF > MEN > 지갑/벨트","L38":"GOLF > MEN > 패션잡화","L39":"LIFE","L40":"LIFE > TABLETOP","J42":"옵션카테고리","K42":"옵션카테고리","J43":"L,M,S,XL,XXL,XXXL","K43":"36,38,40,42,44,46","J44":"4A,6A,8A,10A","K44":"35,35.5,36,36.5,37,37.5,38,38.5,39,39.5,40","J45":"L,M,S,XL,XS,XXL","K45":"L,M,S,XS","J46":"12A,14A","K46":"3A,4A,5A,6A,7A,8A,10A","J47":"34,36,38,40,42,44","K47":"3A,4A,6A,8A,10A","J48":"1,2,3,4,5,6","K48":"68-74,80-86,92-98,104-110,116-122,128-134,140-146","J49":"2-3,4-5,6-7,8-9,10-11,12-13","K49":"3A,4A","J50":"L,M,S,XL,XS,XXL,XXXL","K50":"5A,6A","J51":"44,46,48,50,52,54","K51":"3A,4A,6A,8A,10A,12A,14A","J52":"0,1,2,3,4,5","K52":"29,30,31,32,33,34,36,38,40","J53":"L,M,S,XL","K53":"1,2,3,4,5,6","J54":"4A,6A,8A,10A,12A,14A","K54":"8A","J55":"39,40,41,42,43,44","K55":"2A,3-6M,3A,6-9M,9-12M,12-18M,18-24M","J56":"35,35.5,36,36.5,37,37.5,38,38.5,39","K56":"12Y,14+,14Y","J57":"35,36,37,38,39,40,41","K57":"39,39.5,40,40.5,41,41.5,42,42.5,43","J58":"34,36,38,40,42","K58":"L,M,S,XL,XS,XXL,XXS,XXXL","J59":"L,M,S,XL,XS,XXL,XXS","K59":"39,40,41,42,43,44,45","J60":"L,M,S,XL,XS","K60":"56,57,58,59","J61":"35,36,37,38,39,40","K61":"12Y,14Y","J62":"56-62,68-74,80-86,92-98,104-110,116-122,128-134,140-146","K62":"2A,3A,4A,6A,8A,10A","J63":"2Y,3Y,4Y,5Y,6Y,8Y,10Y","K63":"5,5.5,6,6.5,7,7.5,8,8.5,9,9.5,10","J64":"L,M,S","K64":"4Y,6Y,8Y,10Y","J65":"L,M,S,XL,XS,XXS","K65":"10-12,12-14,14-16,16,18-20","J66":"L,M,S,XL,XXL","K66":"1,2,3","J67":"32,34,36,38,40,42","K67":"39,39.5,40,40.5,41,41.5,42,42.5,43,43.5,44","J68":"34,36,38,40,42,44,46","K68":"39,39.5,40,40.5,41,41.5,42,42.5,43,44","J69":"35,36,37,38,39,40,41,42,43,44,45,46","K69":"2,4,6,8,10,12","J70":"5,5.5,6,6.5,7,7.5,8,8.5,9","K70":"M,S","J71":"5,6,7,8,9,10","K71":"3A,4A,5A,6A,7A,8A,10A,12A","J72":"3A,4A,5A,6A,8A","K72":"3A,4A,5A,6A,8A,10A","J73":"27,28,29,30,31,32,33","K73":"5C,5D,5.5C,5.5D,6C,6D,6.5C,6.5D,7C,7D,7.5C,7.5D,8C,8D,8.5C,8.5D,9C,9D","J74":"2Y,3Y,4Y,5Y,6Y,8Y,10Y","K74":"4M,6M,8M,10M,12M,14M","J75":"12Y,14Y,16Y","K75":"80,85,90,95,100,105,110,115","J76":"12-14A,16A,18-20A","J77":"4A,5A,6A,6(X)A,7A,8-10A"};
var C_TITLE='FFFFC000', C_LABEL='FFFFFF00', C_INPUT='FFEAF4FF', C_NOTE='FF7F7F7F', C_REQ='FFFDE9E7';
var DETAIL_ROWS=[
  ['브랜드한글','예) 아페쎄 — 상품명에서 자동으로 채워져요. 비워도 됩니다'],
  ['품목(카테고리 단어)','예) 카드지갑, 티셔츠 — 상품명에서 자동 인식. 비워도 됩니다'],
  ['수입여부','비우면 "병행 수입"'],
  ['제조년월','예) 2026 F/W — 상품명 시즌에서 자동. 비워도 됩니다'],
  ['색상','예) 블랙 — 상품명에서 자동. 비워도 됩니다'],
  ['구성품','비우면 "정품택 + 더스트백 + 정품제품 + 자체보증서"'],
  ['수납공간','지갑·가방류만 적으세요 — 예) 카드 6칸 / 지폐 1칸 / 동전 1칸']
];
var KEY_OF={'품목(카테고리 단어)':'카테고리'};
var EXTRA_N=5, SIZE_ROWS=10, SIZE_COLS=6, COLS='DEFGHI';


/* 옵션값 작은 순 정렬: XXS<XS<S<M<L<XL<XXL / 숫자(35<35.5<36) / 나이(3-6M<2A<3A<14Y) / 범위(68-74<80-86). 못 읽는 값(단품·FREE 등)은 맨 뒤 */
var LETTER={XXXS:-3,'3XS':-3,XXS:-2,'2XS':-2,XS:-1,S:0,M:1,L:2,XL:3,XXL:4,'2XL':4,XXXL:5,'3XL':5,'4XL':6,XXXXL:6};
function sizeKey(raw){
  var s=String(raw==null?'':raw).trim().toUpperCase().replace(/\s+/g,''), m;
  if(LETTER.hasOwnProperty(s)) return [2,LETTER[s],0];
  if((m=s.match(/^(\d)XL$/))) return [2,+m[1]+1,0];
  if((m=s.match(/^(\d{1,2})(?:-(\d{1,2}))?\(?X?\)?([MAY])$/))){
    var u=m[3]==='M'?1:12; return [1,(+m[1])*u,(+(m[2]||0))*u];
  }
  if((m=s.match(/^(\d{1,2})\+$/))) return [1,(+m[1])*12,0.5];
  if((m=s.match(/^(\d+(?:\.\d+)?)(?:-(\d+(?:\.\d+)?))?([A-Z]?)$/))) return [0,+m[1],(m[2]?+m[2]:0)+(m[3]?m[3].charCodeAt(0)/1000:0)];
  return [3,0,0];
}
function sortSizes(arr){
  return arr.map(function(v,i){ return {v:v,i:i,k:sizeKey(v)}; }).sort(function(a,b){
    for(var j=0;j<3;j++){ if(a.k[j]!==b.k[j]) return a.k[j]<b.k[j]?-1:1; }
    return a.i-b.i;
  }).map(function(o){ return o.v; });
}

function build(ExcelJS,v){
  v=v||{}; var wb=new ExcelJS.Workbook(), ws=wb.addWorksheet('Sheet1',{views:[{state:'frozen',ySplit:4,showGridLines:false}]});
  var thin={style:'thin',color:{argb:'FFBFBFBF'}}, border={top:thin,left:thin,bottom:thin,right:thin};
  [['A',2],['B',2],['C',34],['D',30],['E',20],['F',24],['G',16],['H',16],['I',16],['J',55],['K',35],['L',35]].forEach(function(c){ ws.getColumn(c[0]).width=c[1]; });
  function cell(a,val,kind){
    var c=ws.getCell(a); if(val!==undefined&&val!==null&&val!=='') c.value=val;
    c.font={name:'맑은 고딕',size:10,bold:kind==='title'||kind==='label'};
    c.alignment={vertical:'middle',wrapText:kind==='note'?false:true};
    if(kind==='title'){ c.fill={type:'pattern',pattern:'solid',fgColor:{argb:C_TITLE}}; c.border=border; }
    else if(kind==='label'){ c.fill={type:'pattern',pattern:'solid',fgColor:{argb:C_LABEL}}; c.border=border; }
    else if(kind==='input'){ c.fill={type:'pattern',pattern:'solid',fgColor:{argb:C_INPUT}}; c.border=border; }
    else if(kind==='req'){ c.fill={type:'pattern',pattern:'solid',fgColor:{argb:C_REQ}}; c.border=border; }
    else if(kind==='note'){ c.font={name:'맑은 고딕',size:9,italic:true,color:{argb:C_NOTE}}; }
    return c;
  }
  function str(x){ return x==null?'':String(x); }
  var tiers=v.tiers||[], cats=v.cats||[];

  /* 제목·범례 */
  cell('C2','상품정보 기본양식','title'); ws.getCell('C2').font={name:'맑은 고딕',size:14,bold:true};
  cell('D2','사진 자동화 ②에 올리면 ③ 상세 정보와 ④ 사이트 등록에 같이 쓰입니다','note');
  cell('C3','범례','label'); cell('D3','입력칸 (여기에 적기)','input'); cell('E3','구역 제목','title'); cell('F3','항목 이름','label'); cell('G3','필수 입력','req');
  cell('H3','회색 글씨 = 설명','note');

  /* ===== 1. 자동등록 (서버가 읽는 칸 — 위치를 옮기지 마세요) ===== */
  cell('C4','자동등록양식','title'); cell('D4','▼ 사이트 자동등록과 사진 자동화 모두 사용 (칸 위치 고정)','note');
  var basic=[[6,'브랜드',v.brand,'req','필수 · 사이트에 등록된 브랜드와 같아야 해요. 예) A.P.C.'],
    [7,'소재',v.material,'input','예) 겉감 소가죽 / 울 100%'],
    [8,'원산지',v.origin,'req','필수 · 예) 이탈리아, 스페인'],
    [9,'키즈상품여부 (등록해야될때만 Y표기)',v.kids?'Y':'','input','키즈 사이트에도 같이 등록할 때만 Y'],
    [10,'키즈상품여부가 Y일때 가격',v.kids?String(v.kidsPrice||'').replace(/[^0-9]/g,''):'','input','D9가 Y일 때만 · 숫자만 (예 150000)'],
    [11,'키즈상품여부가 Y 일때 노출여부(Y노출)',v.kids?(v.kidsShow?'Y':'N'):'','input','D9가 Y일 때만 · Y면 등록하는 즉시 노출']];
  basic.forEach(function(b){ cell('C'+b[0],b[1],'label'); cell('D'+b[0],b[2],b[3]); cell('E'+b[0],b[4],'note'); });
  ws.getCell('D9').dataValidation={type:'list',allowBlank:true,formulae:['"Y,N"']};
  ws.getCell('D11').dataValidation={type:'list',allowBlank:true,formulae:['"Y,N"']};

  /* 옵션 표: 칸 위치(D17~F18)는 서버가 읽으므로 그대로 두고, 이름표만 알아보기 쉽게 */
  cell('C16','옵션 (사이즈 등)','title'); cell('D16','① 옵션 이름','label'); cell('E16','② 옵션 값 (쉼표로 구분 · 작은 사이즈부터)','label'); cell('F16','③ 실제 입고된 값 (쉼표)','label');
  cell('G16','옵션 값은 불러올 때 작은 순(XS·S·M·L·XL / 35·35.5·36 / 3A·4A)으로 자동 정렬돼요','note');
  cell('C17','옵션 1줄 (필수)','label'); cell('C18','옵션 2줄 (색상 등, 필요할 때만)','label');
  [17,18].forEach(function(r,i){ var t=tiers[i]||{};
    cell('D'+r,t.name,'input'); cell('E'+r,sortSizes(t.values||[]).join(','),'input'); cell('F'+r,sortSizes(t.real||[]).join(','),'input'); });
  cell('G17','예) 사이즈 | S,M,L | M,L   (단품이면 단품 | 단품 | 단품)','note');
  cell('G18','③을 비우면 그 옵션은 전부 품절로 등록돼요. ③의 값은 ②에 있는 값만 쓰세요','note');
  ws.getRow(17).height=24; ws.getRow(18).height=24;

  var cc=['D','E','F','G','H'];
  cc.forEach(function(c,i){ cell(c+'19','카테고리'+(i+1)+'차','label'); cell(c+'22','카테고리'+(i+6)+'차','label'); });
  cell('C20','카테고리','label'); cell('C23','카테고리','label');
  cc.forEach(function(c,i){ cell(c+'20',cats[i],'input'); cell(c+'23',cats[i+5],'input'); });
  cell('D21','← 오른쪽 J~L열의 메뉴 목록에서 전체 경로를 복사해 붙여넣으세요 (최소 1개, 최대 10개)','note');
  ws.getRow(20).height=30; ws.getRow(23).height=30;

  /* ===== 2. 상세페이지 정보 (사진 자동화 전용) ===== */
  var detail=v.detail||{};
  var dvals={'브랜드한글':v.brandKo,'품목(카테고리 단어)':v.categoryWord,'수입여부':v.imported,'제조년월':v.mfg,'색상':v.color,'구성품':v.parts,'수납공간':v.storage};
  cell('C26','상세페이지 정보 (사진 자동화)','title'); cell('D26','▼ 상세페이지 Information 표에 들어갑니다. 비워둔 칸은 화면에서 직접 입력하거나 상품명에서 자동으로 채워져요','note');
  DETAIL_ROWS.forEach(function(d,i){ var r=27+i; cell('C'+r,d[0],'label'); cell('D'+r,dvals[d[0]],'input'); cell('E'+r,d[1],'note'); });

  /* ===== 3. 추가 항목 ===== */
  cell('C35','추가 항목 (상품 종류별)','title'); cell('D35','▼ 의류의 핏·세탁방법, 신발의 굽높이 등 — 항목 이름과 값을 적으면 화면 ③에 항목이 새로 생겨요','note');
  cell('C36','추가항목','label'); cell('D36','항목 이름','label'); cell('E36','값','label');
  var ex=v.extras||{}, exKeys=Object.keys(ex).filter(function(k){ return ex[k]; });
  for(var i=0;i<EXTRA_N;i++){ var r=37+i; cell('C'+r,'추가항목 '+(i+1),'label'); cell('D'+r,exKeys[i],'input'); cell('E'+r,exKeys[i]?ex[exKeys[i]]:'','input'); }
  cell('F37','예) 핏 | 레귤러핏',"note"); cell('F38','예) 세탁방법 | 드라이클리닝','note');

  /* ===== 참고 메뉴 목록 (J~L열) — 복사해서 붙여넣기용 ===== */
  cell('J2','◀ 참고용 메뉴 목록 (필요한 것을 복사해서 왼쪽 칸에 붙여넣기)','note');
  Object.keys(REF).forEach(function(a){
    var head=(a==='J3'||a==='J42'||a==='K42'||/^[JKL]4$/.test(a));
    var c=ws.getCell(a); c.value=REF[a]; c.font={name:'맑은 고딕',size:10,bold:head};
    if(head){ c.fill={type:'pattern',pattern:'solid',fgColor:{argb:C_TITLE}}; }
  });
  return wb;
}

function loadScript(src){
  return new Promise(function(res,rej){ var s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=function(){ rej(new Error('엑셀 도구를 불러오지 못했어요')); }; document.head.appendChild(s); });
}
function download(v,filename){
  var p=root.ExcelJS?Promise.resolve():loadScript('assets/libs/exceljs-4.4.0.min.js');
  return p.then(function(){ return build(root.ExcelJS,v).xlsx.writeBuffer(); }).then(function(buf){
    var a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    a.download=filename||'상품정보_기본양식.xlsx'; document.body.appendChild(a); a.click(); a.remove();
  });
}
root.PhotoSizeSort=sortSizes;
root.PhotoTemplate={build:build,download:download,REF:REF,DETAIL_ROWS:DETAIL_ROWS,KEY_OF:KEY_OF};
})(typeof window!=='undefined'?window:globalThis);
