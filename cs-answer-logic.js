/* 문의 답변 도우미 — 분류·초안 로직 (브라우저/Node 공용)
   입력: 사방넷 "문의사항답변" 엑셀 한 줄 → 출력: { kind, intent, label, build(slot), slot, buttons, ... }
   kind: auto(자동 초안) / check(확인 후 복사) / manual(직접 작성) / platform(플랫폼 알림 — AI 제외)
   문구는 2026-08~11 실제 답변 1,011건에서 가장 많이 쓰인 표현을 그대로 가져왔다. */
(function(root){
'use strict';

var CS_PHONE = '010-8762-2939';   // 과거 수선 접수 답변에 쓰던 번호
var GREET = '안녕하세요 고객님 ! ', END = ' 감사합니다.';
function wrap(body){ body = String(body || '').replace(/\s+/g, ' ').trim(); return body ? GREET + body + END : ''; }

/* ---------- 문구 ---------- */
var T = {
  auth: '저희가 판매하는 제품은 모두 정식통관을 거쳐 수입된 100%정품, 새상품이므로 걱정하지 않으셔도 됩니다.',
  authDoc: '판매처에서는 수입필증 전달 가능한 점 참고 부탁드립니다.',
  authInspect: '정품 감정 원하실 시 자체택(검은색띠)을 제거하지 않은 상태로 명품감정원 혹은 진가품의뢰기관에 맡겨 정품확인하는 방법이 있습니다.',
  authReg: '원래 정품등록 가능했으나 2025년 초부터 정품등록 정책이 바뀌어서 등록은 불가능할 수 있으며 QR코드 인증만 가능한 점 참고 부탁드립니다.',
  restock: '죄송하게도 현재 입고 예정은 정확하지 않아 답변드리기 어려운 점 양해부탁드립니다. 상품 재입고시 빠른 업데이트 할 수 있도록 하겠으며 판매자 홈 보시면 신상 제품들도 준비되어 있으니 많은 관심 부탁드립니다.',
  pack: '병행수입 제품 특성상 선물포장 및 브랜드 쇼핑백은 제공되지 않는 점 참고 부탁드립니다.',
  as: '병행수입 제품 구매 시 매장 및 백화점 수선 불가능하며, 판매처 쪽으로 연락 주시면 수선 가능한 범위내에서 유상으로 처리 도와드리고 있습니다.',
  asHow: '고객이름 / 구매한 사이트 / 사진을 ' + CS_PHONE + '으로 수선희망하시는 부분 사진과 고객님 성함 문자보내주시면 수선가능 여부 및 비용 확인 후 답변드리겠습니다.',
  cs: '해당 건의 경우 구매사이트 고객센터 문의 부탁드립니다.',
  price: '최대 할인이 적용된 가격으로 추가 할인은 어려운 점 양해 부탁드립니다.',
  sameday: '평일 오후 4시 이전 구매 시 당일 발송 가능한 점 참고 부탁드립니다.',
  sizeNote: '상세페이지를 보시면 사이즈별 실측 치수가 기재되어있습니다. 참고하시면 더 정확하게 확인 가능하실 것 같습니다. 고객님마다 체형이 다를 수 있어 정확한 추천은 어려운 점 양해부탁드립니다.',
  sizeNoteShoe: '상세페이지 사이즈표 참고 부탁드리며, 개인별 발볼의 넓이, 발등의 높이, 그리고 선호하시는 착화감(타이트함 혹은 여유로움)에 따라 실제 느끼시는 사이즈감은 다를 수 있어 정확한 추천은 어려운 점 양해부탁드립니다.',
  sizeExch: '사이즈가 안맞을시 교환,환불 모두 가능하나 택배비용은 고객님 부담인점 양해부탁드립니다.',
  exchCond: '상품택, 자체택(검은색띠) 제거X, 외부착용X, 받으신 상태 그대로 일 시 수령일 7일 이내 교환/반품 모두 가능한 점 참고 부탁드립니다.',
  kidsAdult: '성인 여성의 경우 44사이즈 (마른55) 까지 가능하나 개인의 체형에 따라 차이가 있을 수 있습니다.',
  measAsk: '문의주시는 사이즈 회신주시면 확인 후 실측 사이즈 전달드리겠습니다.',
  measHead: '문의주신 제품 실측 사이즈 전달드리니 참고 부탁드립니다.',
  returnFee: '반품 배송비 10,000원 비용 발생되는 점 참고 부탁드립니다.',
  lowStock: '소량 보유중으로 빠른 결제 추천드리며, 선결제건 있을 경우 품절안내 받으실 수 있는 점 참고 부탁드립니다.'
};

/* ---------- 이카운트 재고 매칭 (promo-pick.html 과 동일 규칙) ---------- */
function ecCodeSuffix(name){ var cleaned = String(name || '').replace(/\s*\([^)]*\)\s*$/, ''); var t = cleaned.trim().split(/\s+/).filter(Boolean); var i = t.length; while(i > 0 && !/[가-힣]/.test(t[i - 1])) i--; return t.slice(i).join(' '); }
function ecLabelParts(text){ var t = String(text || '').trim().replace(/^\[|\]$/g, ''); var ws = ['하자', '스크래치']; for(var k = 0; k < ws.length; k++){ var w = ws[k]; if(t.indexOf(w) === 0){ var m = /(\d+)\s*$/.exec(t.slice(w.length)); return { base: w, num: m ? m[1] : '' }; } } return null; }
function ecLabelE(n){ var m = /^\[([^\]]+)\]/.exec(String(n || '').trim()); return m ? ecLabelParts(m[1]) : null; }
function ecLabelS(n){ return ecLabelParts((String(n || '').trim().split(/\s+/)[0]) || ''); }
function ecGender(n){ var t = String(n || '').replace(/\[[^\]]*\]/g, ' ').split(/[\s\/&,()]+/), o = {}; ['키즈', '여성', '남성', '남아', '여아'].forEach(function(w){ if(t.indexOf(w) !== -1) o[w] = 1; }); return Object.keys(o); }
function ecGenderOk(a, b){ var A = ecGender(a), B = ecGender(b); if(!A.length || !B.length) return true; return A.every(function(x){ return B.indexOf(x) !== -1; }) || B.every(function(x){ return A.indexOf(x) !== -1; }); }
function ecSeasonTag(n){ var t = (String(n || '').trim().split(/\s+/)[0] || '').toUpperCase(); return /^(\d{2}(SS|FW|S\/S|F\/W)|\d+주년)$/.test(t) ? t.replace('/', '') : ''; }
function ecTok(n){ var o = {}; String(n || '').toUpperCase().replace(/[\/&,()\[\]]/g, ' ').split(/\s+/).filter(Boolean).forEach(function(x){ o[x] = 1; }); return o; }
function ecScore(a, b){ var A = ecTok(a), B = ecTok(b), i = 0, u = 0, k; for(k in A){ u++; if(B[k]) i++; } for(k in B){ if(!A[k]) u++; } return u ? i / u : 0; }
function ecNormSpec(v){ var s = String(v == null ? '' : v).trim().toUpperCase().replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim(); s = s.replace(/^(\d+)Y$/, '$1A'); return s === '' ? 'TU' : s; }
var SIZE_ORDER = ['XXXS', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'TU', 'FREE', 'F'];
function sizeKey(s){ var i = SIZE_ORDER.indexOf(s); if(i >= 0) return [1, i, s]; var n = parseFloat(s); return isNaN(n) ? [2, 0, s] : [0, n, s]; }
function sizeCmp(a, b){ var x = sizeKey(a), y = sizeKey(b); return x[0] - y[0] || x[1] - y[1] || (x[2] < y[2] ? -1 : x[2] > y[2] ? 1 : 0); }

/* 이카운트 master 행([코드, 품목명, 규격, 수량]) → 상품명으로 재고를 찾는 함수 */
function makeStock(masterRows){
  var idx = {};
  (masterRows || []).forEach(function(r){ var nm = r[1] || ''; if(nm.indexOf('시즌변경') !== -1) return; var k = ecCodeSuffix(nm); if(!k) return; (idx[k] = idx[k] || []).push({ code: r[0], name: nm, spec: r[2], qty: Number(r[3]) || 0 }); });
  return function(name){
    var none = { found: false, total: 0, sizes: [] };
    var cand = idx[ecCodeSuffix(name)]; if(!cand) return none;
    var sl = ecLabelS(name), slb = sl ? sl.base : null;
    var ok = cand.filter(function(it){ var el = ecLabelE(it.name); if((el ? el.base : null) !== slb) return false; if(el && sl && el.num && sl.num && el.num !== sl.num) return false; return ecGenderOk(it.name, name); });
    if(!ok.length) return none;
    var names = []; ok.forEach(function(x){ if(names.indexOf(x.name) < 0) names.push(x.name); });
    var tag = ecSeasonTag(name); if(tag){ var same = names.filter(function(n){ return ecSeasonTag(n) === tag; }); if(same.length) names = same; }
    var sc = names.map(function(n){ return { n: n, s: ecScore(name, n) }; }), best = Math.max.apply(null, sc.map(function(x){ return x.s; }));
    var keep = {}; sc.forEach(function(x){ if(x.s >= best - 1e-4) keep[x.n] = 1; });
    var m = {}; ok.forEach(function(it){ if(!keep[it.name]) return; var k = ecNormSpec(it.spec); m[k] = (m[k] || 0) + it.qty; });
    var sizes = Object.keys(m).sort(sizeCmp).map(function(k){ return { spec: k, qty: m[k] }; });
    return { found: sizes.length > 0, total: sizes.reduce(function(t, x){ return t + x.qty; }, 0), sizes: sizes };
  };
}

/* ---------- 문의 텍스트에서 사이즈 찾기 ---------- */
function esc(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function upperQ(txt){
  return String(txt || '').toUpperCase()
    .replace(/엑스\s*라지/g, ' XL ').replace(/라지/g, ' L ').replace(/스몰/g, ' S ').replace(/미디[엄움]|미듐/g, ' M ').replace(/엑스\s*스몰/g, ' XS ');
}
function specsMentioned(txt, sizes){
  var U = upperQ(txt), out = [];
  (sizes || []).forEach(function(s){
    if(s.spec === 'TU' || s.spec === 'FREE' || s.spec === 'F') return;
    var re = new RegExp('(?<![A-Z0-9.])' + esc(s.spec) + '(?![A-Z0-9]|\\.\\d)');
    if(re.test(U)) out.push(s);
  });
  return out;
}
function hasSizeTok(txt){ return /(?<![A-Z0-9.])(XXS|XS|S|M|L|XL|XXL|\d{1,2}A|\d{2,3})(?![A-Z0-9]|\.\d)/.test(upperQ(txt)) || /라지|스몰|미디/.test(txt); }
function joinSizes(a){ return a.join(', '); }

/* ---------- 분류 규칙 ---------- */
var RX = {
  platform: /긴급알림|지식재산권|페널티|안전거래센터|발송지연\s*노출제한|개인정보처리|정보이전\s*동의/,
  relay: /판매자연락|메모\(VOC\)/,
  auth: /(정품|진품)\s*(이|인|맞|확실|여부|입니까|인가|인지|이죠|이에요|일까|보증|등록|인증|\?)|가품|짝퉁|진짜|정식\s*통관|감정|필증|큐알|QR|시리얼|NFC|Certilogo/i,
  authDoc: /필증|서류|증빙/,
  authReg: /정품\s*등록|큐알|QR|시리얼|NFC|Certilogo|모바일\s*인증/i,
  doc: /보증서|영수증|개런티|갤런티|보증\s*카드|구매\s*확인서/,
  claim: /하자|불량|파손|찢어|찢겼|뜯어|훼손|오염|얼룩|구멍|이염|냄새|실밥|변색|스크래치|흠집|오배송|잘못\s*왔|다른\s*(상품|제품|사이즈)/,
  restock: /재입고|입고\s*예정|입고\s*(언제|되나|될까|일정|안)|언제\s*입고|다시\s*(들어|입고)|추가\s*입고|재생산|리오더|재판매|재발매/,
  pack: /선물|(?<!합)포장.{0,6}(가능|되나|해\s*주|부탁)|쇼핑\s*백|종이\s*가방|리본|메시지\s*카드/,
  pack2: /박스|구성품|더스트\s*백|케이스|옷걸이|패키지|(?<!합)포장/,
  as: /(?<![A-Za-z])A\s*\/?\s*S(?![A-Za-z])|에이에스|수선|수리|보증기간/i,
  cs: /카드\s*(사|할인|혜택|결제|포인트)|포인트|적립|쿠폰\s*(적용|안|사용|발급)|결제\s*(오류|안\s*되|실패|가\s*안)|입금\s*언제|환불\s*(언제|입금|예정)/,
  price: /(추가|더)\s*할인|가격\s*(인하|깎|조정|네고)|깎아|네고|흥정|할인\s*(되|가능|해\s*주|받)|최저가/,
  ret: /반품|환불|회수|수거|반송|취소|교환|바꿔|사이즈\s*변경/,
  retFee: /반품비|반품\s*배송비|반품\s*택배비|택배비/,
  stockWord: /재고|품절|남아|보유|입고\s*(되|된)|(?<!되|돼|되어|돼어)\s?있(나요|을까요|는지|나여|을지)|없(나요|어요|을까요)|구매\s*가능|주문\s*가능|구입\s*가능|살\s*수/,
  stockStrong: /재고|품절|남아|보유|구매\s*가능|주문\s*가능|구입\s*가능/,
  sameday: /당일\s*(발송|배송|출고)|오늘\s*(발송|출고|배송|보내)|바로\s*(출고|발송|배송)/,
  ship: /배송|출고|언제\s*(오|받|도착|발송)|도착|송장|발송|택배/,
  meas: /실측|치수|가슴|어깨|소매|총\s*장|총\s*길이|팔\s*길이|기장|단면|둘레|가로|세로|폭|높이|굽|밑위|허벅지|허리|발볼|\bcm\b|센티|길이|사이즈\s*(표|상세|알려|문의|확인)/i,
  sizerec: /사이즈|추천|이면|해도\s*(되|될|돼|괜찮)|괜찮을|입는|신는|입습니다|신습니다|키가?\s*\d|\d\s*cm|몸무게|kg|평소|정사이즈|오버\s*핏|오버사이즈|호수|한국\s*사이즈|프리\s*사이즈|맞을까|맞나요|작을까|클까/i,
  shoe: /스니커|슈즈|로퍼|부츠|샌들|힐|플랫|운동화|슬리퍼|뮬|신발/,
  kids: /키즈|(?<![0-9])\d{1,2}\s?[AY](?![A-Za-z])|남아|여아/i,
  adult: /성인|어른|여성|여자|남성|남자|제가|저는|내가|55|44|66|마른/,
  mat: /소재|안감|혼용|재질|원단|세탁|기모|두께|비침|신축|가죽|충전재|무게|털|밴딩|지퍼|주머니|포켓|후드|끈|스트랩|탈부착|방수|보온|따뜻|얇|도톰|유광|무광/,
  sizeAsk: /추천|맞을까|맞나요|이면|해도\s*(되|될|돼|괜찮)|괜찮을|평소|키가?\s*\d|몸무게|정사이즈|작을까|클까|\d{2,3}\s*(입|신)/,
  thanks: /^(감사|고맙|잘\s*받|잘\s*쓰)/
};

function cleanTitle(t){ return String(t || '').replace(/^(\[[^\]]*\])+/, '').replace(/^(상품문의|고객문의)\//, '').trim(); }
function textOf(r){ var q = String(r.q || '').trim(); if(q === 'null') q = ''; return (q.length >= 8 ? q : (q + ' ' + cleanTitle(r.title)).trim()); }
function cleanProd(p){ return String(p || '').replace(/^(\[[^\]]*\]\s*)+/, '').trim(); }
function measKey(prod){ return ecCodeSuffix(cleanProd(prod)).toUpperCase().replace(/\s+/g, ' ').trim(); }
function isShoe(prod, txt){ return RX.shoe.test(String(prod || '')) || (RX.shoe.test(txt) && /\b2[0-9]{2}\b|\b[3-4][0-9](\.5)?\b/.test(txt)); }

var LABEL = { auth: '정품 문의', restock: '재입고 문의', pack: '선물포장·쇼핑백', pack2: '구성품 문의', as: 'A/S·수선', cs: '플랫폼 고객센터 안내', price: '가격·할인', ret: '반품·교환·취소', stock: '재고 확인', sameday: '당일 발송', ship: '배송·출고', meas: '실측 치수', sizerec: '사이즈 추천', mat: '소재·디테일', etc: '기타', relay: '주문 처리 요청(전달)', platform: '플랫폼 알림', empty: '내용 없음', thanks: '인사' };

var BTN_RET = [
  { label: '회수접수 완료', text: '반품접수 확인되어 금일 회수접수했습니다. 기사님 1-2일이내 방문시 상품전달 부탁드립니다.' },
  { label: '입고·검수 후 승인', text: '택배사 도착하여 금일 자사로 입고 예정입니다. 입고 및 검수 후 순차적으로 반품승인처리 진행될 예정입니다.' },
  { label: '교환·반품 조건', text: T.exchCond },
  { label: '반품비 안내', text: T.returnFee },
  { label: '교환 품절', text: '죄송하게도 해당 사이즈는 품절로 교환이 어려운 점 양해부탁드립니다.' }
];
var BTN_SHIP = [
  { label: '금일 출고 예정', text: '금일 출고 예정입니다.' },
  { label: '4시 이전 당일 발송', text: T.sameday },
  { label: '배송 1~2일', text: '발송 후 배송기간 1~2일 정도 소요될 수 있는 점 양해부탁드립니다.' }
];
var BTN_ETC = [
  { label: '상세페이지 참고', text: '상세페이지 내 기재되어 있는 점 참고 부탁드립니다.' },
  { label: '확인 후 재안내', text: '문의 내용 확인 후 다시 안내드리겠습니다.' },
  { label: '고객센터 안내', text: '교환/반품의 경우 구매사이트에서 접수해주시면 됩니다. 바이스트 고객센터 1644-9861 입니다.' },
  { label: '사진 요청', text: '번거로우시겠지만 해당 부분 사진 촬영 후 ' + CS_PHONE + ' 로 첨부 부탁드리겠습니다.' }
];

function base(r, over){ var o = { kind: 'manual', intent: 'etc', label: LABEL.etc, slot: null, buttons: [], stock: null, note: '', build: function(){ return ''; } }; for(var k in over) o[k] = over[k]; return o; }

/* ctx: { stock: function(name)->{found,total,sizes} | null, meas: function(key)->string } */
function classifyMain(r, ctx){
  ctx = ctx || {};
  var t = String(r.title || ''), q = String(r.q || '').trim(); if(q === 'null') q = '';
  var txt = textOf(r);
  var prod = cleanProd(r.prod);

  if(RX.platform.test(t + ' ' + q.slice(0, 120))) return base(r, { kind: 'platform', intent: 'platform', label: LABEL.platform, note: '플랫폼이 판매자에게 보낸 공지·페널티·소명 안내입니다. 기한을 확인하고 직접 처리하세요.' });
  if(!q) return base(r, { kind: 'platform', intent: 'empty', label: LABEL.empty, note: '문의 내용이 비어 있습니다(흥정 신청 알림 등). 플랫폼 화면에서 확인하세요.' });
  if(RX.relay.test(t)){
    if(!/회원명|주문번호|VOC|-\s*요청사항/.test(q + t)) return base(r, { kind: 'platform', intent: 'platform', label: LABEL.platform, note: '플랫폼 안내입니다. 직접 확인하세요.' });
    return base(r, { kind: 'manual', intent: 'relay', label: LABEL.relay, buttons: BTN_RET.concat(BTN_ETC), note: '플랫폼이 고객 요청을 전달한 건입니다. 실제 처리(수거·환불·수선)가 필요할 수 있어요.', build: function(){ return ''; } });
  }

  var st = ctx.stock ? ctx.stock(prod) : null;
  var stockOk = st && st.found;

  /* 0) 하자·오배송 클레임 — 사람이 직접 */
  if(RX.claim.test(txt) && !/하자\s*(없|있나|있는|여부)|불량\s*(없|있나)/.test(txt) && !RX.stockStrong.test(txt)) return base(r, { kind: 'manual', intent: 'claim', label: '하자·오배송 클레임', buttons: BTN_ETC.concat(BTN_RET), note: '실물 확인이 필요한 건이에요. 사진 요청 후 처리하세요.', build: function(){ return ''; } });
  if(/하자\s*(없|있나|있는|여부)|불량\s*(없|있나)|검수|꼼꼼/.test(txt) && !RX.stockStrong.test(txt) && txt.length < 90 && !RX.auth.test(txt)) return base(r, { kind: 'check', intent: 'inspect', label: '검수 요청', build: function(){ return wrap('꼼꼼히 검수 후 출고 도와드리겠습니다.'); } });

  /* 1) 정품 */
  if(RX.auth.test(txt)){
    if(RX.authReg.test(txt)) return base(r, { kind: 'check', intent: 'auth', label: LABEL.auth + ' (정품등록·QR)', note: '브랜드마다 정품등록 가능 여부가 달라요. 해당 브랜드에 맞는지 확인하세요.', build: function(){ return wrap(T.authReg); } });
    if(RX.authDoc.test(txt)) return base(r, { kind: 'auto', intent: 'auth', label: LABEL.auth + ' (서류)', build: function(){ return wrap(T.auth + ' ' + T.authDoc); } });
    return base(r, { kind: 'auto', intent: 'auth', label: LABEL.auth, build: function(){ return wrap(T.auth); } });
  }
  /* 2) 재입고 */
  if(RX.restock.test(txt) && !RX.ret.test(txt)){
    var pre = '';
    if(stockOk){ var inn = st.sizes.filter(function(s){ return s.qty > 0; }).map(function(s){ return s.spec; }); if(inn.length) pre = '문의주신 제품 현재 ' + joinSizes(inn) + ' 사이즈 보유중입니다. 그 외 사이즈는 품절로 '; }
    return base(r, { kind: pre ? 'check' : 'auto', intent: 'restock', label: LABEL.restock, stock: stockOk ? st : null, note: pre ? '재고 보유 사이즈를 함께 안내했어요. 맞는지 확인하세요.' : '', build: function(){ return wrap(pre ? pre + T.restock.replace(/^죄송하게도 /, '죄송하게도 ') : T.restock); } });
  }
  /* 2-b) 보증서·영수증·구성품 */
  if(RX.doc.test(txt)) return base(r, { kind: 'manual', intent: 'doc', label: '보증서·영수증', buttons: [
    { label: '자체보증서 안내', text: '온라인 병행수입제품 특성상 구매영수증, 보증서는 따로 동봉되지않으며 자체보증서로 출고도와드렸습니다.' },
    { label: '브랜드 보증서 없음', text: '브랜드 자체에서 발급되는 정품보증서는 병행수입 특성상 없으며 저희 판매자 정품 제품보증서(흰색종이) 제공 도와드렸습니다.' },
    { label: '수입필증 전달', text: T.authDoc }], note: '상품마다 보증서·카드 구성이 달라요. 상세페이지 구성품을 확인하세요.', build: function(){ return ''; } });
  /* 3) 선물포장·쇼핑백 */
  if(RX.pack.test(txt)) return base(r, { kind: 'auto', intent: 'pack', label: LABEL.pack, build: function(){ return wrap(T.pack); } });
  if(RX.pack2.test(txt) && /구성|케이스|박스|패키지|옷걸이|더스트/.test(txt) && !RX.ret.test(txt)) return base(r, { kind: 'manual', intent: 'pack2', label: LABEL.pack2, buttons: [{ label: '상세페이지 구성품 참고', text: '상세페이지 내 구성품 참고 부탁드립니다.' }, { label: '쇼핑백 업체 자체 출고', text: '쇼핑백은 주문 후 요청주시면 업체 자체 쇼핑백으로 출고 도와드릴 수 있도록하겠습니다.' }], note: '상품마다 구성품이 달라요. 상세페이지를 확인하세요.', build: function(){ return ''; } });
  /* 4) A/S */
  if(RX.as.test(txt)){
    var asHow = /어디|어떻게|문의|접수/.test(txt) && !/매장|백화점|공식|브랜드/.test(txt);
    return base(r, { kind: asHow ? 'check' : 'auto', intent: 'as', label: LABEL.as, note: asHow ? '접수 방법을 묻는 것 같아요. 접수 안내 문구로 바꿨는지 확인하세요.' : '', build: function(){ return wrap(asHow ? T.asHow : T.as); } });
  }
  /* 5) 카드·포인트·쿠폰 → 플랫폼 고객센터 */
  if(RX.cs.test(txt) && !RX.ret.test(txt) && !RX.stockStrong.test(txt)) return base(r, { kind: 'auto', intent: 'cs', label: LABEL.cs, build: function(){ return wrap(T.cs); } });
  /* 6) 가격 */
  if(RX.price.test(txt)) return base(r, { kind: 'check', intent: 'price', label: LABEL.price, build: function(){ return wrap(T.price); } });
  /* 7) 반품·교환·취소 (재고를 묻는 말이 같이 없을 때) */
  if(RX.ret.test(txt) && !RX.stockWord.test(txt) && !(RX.sizeAsk.test(txt) && hasSizeTok(txt))){
    if(RX.retFee.test(txt)) return base(r, { kind: 'check', intent: 'ret', label: LABEL.ret + ' · 반품비', buttons: BTN_RET, note: '반품비가 상황마다 다를 수 있어요(합포장 등). 확인하세요.', build: function(){ return wrap(T.returnFee); } });
    return base(r, { kind: 'manual', intent: 'ret', label: LABEL.ret, buttons: BTN_RET, note: '"회수접수했습니다"는 실제로 접수한 뒤에만 쓰세요.', build: function(){ return ''; } });
  }
  /* 8) 재고 */
  var wantsStock = RX.stockStrong.test(txt) || (RX.stockWord.test(txt) && (hasSizeTok(txt) || (stockOk && specsMentioned(txt, st.sizes).length)));
  if(wantsStock){
    var exch = /교환/.test(txt), wantsSame = RX.sameday.test(txt);
    if(!stockOk) return base(r, { kind: 'manual', intent: 'stock', label: LABEL.stock, stock: null, buttons: [{ label: '재고 있음(소량)', text: '재고 1개 확인되었습니다. ' + T.lowStock }, { label: '품절', text: '죄송하게도 현재 해당 사이즈는 품절로 재입고 예정은 정확하지 않아 답변드리기 어려운 점 양해부탁드립니다.' }, { label: '4시 이전 당일 발송', text: T.sameday }], note: ctx.stock ? '이카운트에서 이 상품을 찾지 못했어요. 직접 확인하세요.' : '재고를 조회하려면 툴킷에 로그인해야 해요. 지금은 직접 확인하세요.', build: function(){ return ''; } });
    var ask = specsMentioned(txt, st.sizes);
    var only = st.sizes.length === 1 && (st.sizes[0].spec === 'TU' || st.sizes[0].spec === 'FREE' || st.sizes[0].spec === 'F');
    if(only) ask = st.sizes.slice();
    var avail = st.sizes.filter(function(s){ return s.qty > 0; });
    var body, kind = 'auto', note = '';
    if(ask.length){
      var okS = ask.filter(function(s){ return s.qty >= 3; }), lowS = ask.filter(function(s){ return s.qty >= 1 && s.qty < 3; }), outS = ask.filter(function(s){ return s.qty <= 0; });
      var parts = [], lbl = function(s){ return s.spec === 'TU' ? '' : s.spec + '사이즈 '; };
      if(exch){
        if(okS.length + lowS.length) parts.push('문의주신 ' + okS.concat(lowS).map(function(s){ return s.spec; }).join(', ') + '사이즈 재고 확인되며 교환 가능합니다.');
        if(outS.length) parts.push('죄송하게도 ' + outS.map(function(s){ return s.spec; }).join(', ') + '사이즈는 품절로 교환 불가하십니다.' + (avail.length ? ' 현재 ' + joinSizes(avail.map(function(s){ return s.spec; })) + ' 사이즈로만 교환이나 구매 가능하신 점 참고 부탁드립니다.' : ''));
        kind = 'check'; note = '교환 문의라서 재고만 보고 안내했어요. 교환 접수 상태도 확인하세요.';
      } else {
        if(okS.length) parts.push('문의 주신 제품 ' + okS.map(function(s){ return s.spec === 'TU' ? '' : s.spec; }).filter(Boolean).join(', ') + (okS.every(function(s){ return s.spec === 'TU'; }) ? '재고 있으며' : '사이즈 재고 있으며') + ' 평일 오후 4시 이전 구매 시 당일 발송 가능합니다.');
        if(lowS.length) parts.push('문의 주신 제품 ' + lowS.map(function(s){ return lbl(s) + '재고 ' + s.qty + '개'; }).join(', ') + ' 확인되었습니다. ' + T.lowStock);
        if(outS.length) parts.push('죄송하게도 현재 ' + outS.map(function(s){ return s.spec; }).join(', ') + '사이즈 품절로 재입고 예정은 정확하지 않아 답변드리기 어려운 점 양해부탁드립니다.' + (avail.length ? ' 현재 ' + joinSizes(avail.map(function(s){ return s.spec; })) + ' 사이즈는 구매 가능합니다.' : ''));
      }
      body = parts.join(' ');
    } else {
      kind = 'check'; note = '문의에 사이즈가 없어서 보유 사이즈 목록으로 안내했어요. 맞는지 확인하세요.';
      body = avail.length ? '문의 주신 제품 현재 ' + joinSizes(avail.map(function(s){ return s.spec; })) + ' 사이즈 보유중입니다.' + (wantsSame ? ' ' + T.sameday : '') : '문의 주신 제품은 현재 품절로 재입고 예정은 정확하지 않아 답변드리기 어려운 점 양해부탁드립니다.';
    }
    return base(r, { kind: kind, intent: 'stock', label: LABEL.stock, stock: st, note: note, build: function(){ return wrap(body); } });
  }
  /* 9) 당일 발송 문의 */
  if(RX.sameday.test(txt)) return base(r, { kind: 'check', intent: 'sameday', label: LABEL.sameday, buttons: BTN_SHIP, note: '이미 주문한 건이면 상태가 달라요. 주문 상태를 확인하세요.', build: function(){ return wrap(T.sameday); } });
  /* 10) 배송·출고 */
  if(RX.ship.test(txt)) return base(r, { kind: 'manual', intent: 'ship', label: LABEL.ship, buttons: BTN_SHIP, slot: { label: '송장 (예: CJ 600123456789)', placeholder: 'CJ 600123456789', tpl: 'ship' }, note: '송장번호를 입력하면 안내 문장이 만들어져요.', build: function(){ return ''; } });
  /* 11) 실측 치수 */
  if(RX.meas.test(txt) && !(RX.sizerec.test(txt) && /추천|맞을까|맞나요|이면|입는|신는|입습니다|신습니다/.test(txt) && !/실측|치수|단면|둘레|총\s*장|총\s*길이/.test(txt))){
    var key = measKey(prod), saved = ctx.meas ? ctx.meas(key) : '';
    var hasSize = hasSizeTok(txt);
    return base(r, { kind: saved ? 'check' : 'manual', intent: 'meas', label: LABEL.meas, stock: stockOk ? st : null, measKey: key, buttons: [{ label: '사이즈 되묻기', text: T.measAsk }, { label: '상세페이지 참고', text: '상세페이지 내 사이즈 표 참고 부탁드립니다.' }],
      slot: { label: '실측값 (이 상품에 저장하면 다음 문의에 자동으로 채워져요)', placeholder: '예) 12A 어깨 40 가슴 43 소매 56 총장 60', tpl: 'meas', value: saved || '', saveable: true },
      note: saved ? '이전에 입력해 둔(또는 과거 답변의) 실측값을 채웠어요. 문의한 사이즈가 맞는지 확인하세요.' : (hasSize ? '실측값이 아직 없어요. 상세 이미지를 보고 한 번 입력하면 저장돼요.' : '사이즈가 없어서 되묻는 문구를 쓸 수 있어요.'),
      build: function(slot){ var v = String(slot || '').trim(); if(v) return wrap(T.measHead + ' ' + v); return hasSize ? '' : wrap(T.measAsk); } });
  }
  /* 12) 사이즈 추천 */
  if(RX.sizerec.test(txt)){
    var kidsAd = RX.kids.test(txt + ' ' + prod) && RX.adult.test(txt);
    var chips = stockOk ? st.sizes.filter(function(s){ return s.qty > 0; }).map(function(s){ return s.spec; }) : [];
    var shoe = isShoe(prod, txt), cond = /반품|교환|환불/.test(txt);
    if(kidsAd){
      var key2 = measKey(prod), sv = ctx.meas ? ctx.meas(key2) : '';
      return base(r, { kind: 'check', intent: 'sizerec', label: LABEL.sizerec + ' (키즈 → 성인)', stock: stockOk ? st : null, measKey: key2,
        slot: { label: '실측값 (있으면)', placeholder: '12A 어깨 34 가슴 44 총기장 54', tpl: 'kids', value: sv || '', saveable: true },
        note: '키즈 상품에 성인이 입을 수 있는지 묻는 문의예요.', build: function(slot){ var v = String(slot || '').trim(); return wrap(T.kidsAdult + ' ' + (v ? '실측 사이즈 전달드리니 참고 부탁드립니다. ' + v : '문의주시는 옵션번호나, 제품알려주시면 실측 사이즈 전달드리도록 하겠습니다.')); } });
    }
    return base(r, { kind: 'check', intent: 'sizerec', label: LABEL.sizerec + (shoe ? ' (신발)' : ''), stock: stockOk ? st : null,
      slot: { label: '추천 사이즈 (비우면 추천 문장 없이 안내)', placeholder: chips.length ? '아래 재고 있는 사이즈를 눌러도 돼요' : '예) M, 38', tpl: 'rec', chips: chips },
      note: '추천 사이즈는 사람이 정해요. 재고 있는 사이즈만 눌러서 고를 수 있어요.',
      build: function(slot){ var v = String(slot || '').trim(); var note = shoe ? T.sizeNoteShoe : T.sizeNote; return wrap((v ? v + '사이즈 추천드리나 ' : '') + note + ' ' + (cond ? T.exchCond : T.sizeExch)); } });
  }
  /* 12-b) 톡톡·사이즈만 적힌 짧은 문의 */
  if(/톡톡/.test(txt) && txt.length < 40) return base(r, { kind: 'manual', intent: 'talk', label: '톡톡 확인 요청', buttons: [{ label: '톡톡 답변 완료', text: '답변이 늦어진 점 대단히 죄송합니다. 톡톡으로 답변 도와드렸습니다.' }], note: '톡톡에 온 문의를 확인하고 답하세요.', build: function(){ return ''; } });
  if(txt.length <= 14 && hasSizeTok(txt)){ var key3 = measKey(prod), sv3 = ctx.meas ? ctx.meas(key3) : ''; return base(r, { kind: sv3 ? 'check' : 'manual', intent: 'meas', label: LABEL.meas + ' (사이즈만 적힘)', stock: stockOk ? st : null, measKey: key3, slot: { label: '실측값 (저장하면 다음에 자동으로 채워져요)', placeholder: '예) 14A 어깨 42 가슴 46 소매 58 총장 67', tpl: 'meas', value: sv3 || '', saveable: true }, note: '사이즈만 적혀 있어요. 실측을 묻는 것 같아요.', build: function(slot){ var v = String(slot || '').trim(); return v ? wrap(T.measHead + ' ' + v) : ''; } }); }
  /* 13) 소재·디테일 / 기타 */
  if(RX.thanks.test(txt)) return base(r, { kind: 'check', intent: 'thanks', label: LABEL.thanks, build: function(){ return wrap('문의 남겨주셔서'); } });
  return base(r, { kind: 'manual', intent: RX.mat.test(txt) ? 'mat' : 'etc', label: RX.mat.test(txt) ? LABEL.mat : LABEL.etc, buttons: BTN_ETC, note: '상품 정보를 보고 직접 답변하세요.', build: function(){ return ''; } });
}


/* 한 문의에 질문이 여러 개 섞여 있으면 알려준다 (초안이 그중 하나만 답할 수 있으므로) */
var ALSO = [
  ['auth', '정품', function(t){ return RX.auth.test(t); }],
  ['restock', '재입고', function(t){ return RX.restock.test(t); }],
  ['pack', '쇼핑백·선물포장', function(t){ return RX.pack.test(t); }],
  ['as', 'A/S', function(t){ return RX.as.test(t); }],
  ['stock', '재고', function(t){ return RX.stockStrong.test(t); }],
  ['meas', '실측', function(t){ return /실측|치수|가슴|어깨|총\s*장|단면/.test(t); }],
  ['sizerec', '사이즈 추천', function(t){ return RX.sizeAsk.test(t) && hasSizeTok(t); }],
  ['ship', '배송', function(t){ return /배송|출고|송장|언제\s*(오|받|도착)/.test(t); }],
  ['ret', '반품·교환', function(t){ return RX.ret.test(t); }]
];
function classify(r, ctx){
  var c = classifyMain(r, ctx);
  if(c.kind === 'platform') return c;
  if(c.kind === 'auto' && textOf(r).length > 70){ c.kind = 'check'; c.note = '질문이 길어요. 초안이 질문 전체에 답하는지 확인하세요.' + (c.note ? ' ' + c.note : ''); }
  var txt = textOf(r);
  var also = [];
  ALSO.forEach(function(a){ if(a[0] !== c.intent && a[2](txt)) also.push(a[1]); });
  c.also = also;
  if(also.length && c.kind === 'auto'){ c.kind = 'check'; }
  return c;
}

/* 슬롯 템플릿(송장) */
function applySlot(card, slotVal){
  var v = String(slotVal || '').trim();
  if(card.slot && card.slot.tpl === 'ship'){ return v ? wrap(v + ' 로 발송되어 1~2일 정도 소요될 수 있는 점 양해부탁드립니다.') : ''; }
  return card.build(v);
}

/* ---------- 엑셀 파싱 ---------- */
function rowsFromAoa(aoa){
  var hi = -1; for(var i = 0; i < Math.min(aoa.length, 10); i++){ if((aoa[i] || []).some(function(c){ return String(c).trim() === '문의내용'; })){ hi = i; break; } }
  if(hi < 0) return null;
  var H = aoa[hi].map(function(c){ return String(c || '').trim(); });
  var col = function(n){ return H.indexOf(n); };
  var ix = { proc: col('처리구분'), shop: col('쇼핑몰'), date: col('고객등록일자'), order: col('주문번호'), title: col('문의제목'), prod: col('상품명'), q: col('문의내용'), a: col('답변 및 안내'), who: col('작성자'), ans: col('답변자'), no: col('문의사항순번') };
  var out = [];
  for(var k = hi + 1; k < aoa.length; k++){
    var x = aoa[k] || []; if(!x.some(function(c){ return String(c || '').trim(); })) continue;
    var g = function(n){ return ix[n] >= 0 && x[ix[n]] != null ? String(x[ix[n]]) : ''; };
    out.push({ idx: k, no: g('no'), proc: g('proc'), shop: g('shop'), date: g('date'), order: g('order'), title: g('title'), prod: g('prod'), q: g('q'), a: g('a'), who: g('who'), ans: g('ans') });
  }
  return out;
}

var API = { classify: classify, applySlot: applySlot, rowsFromAoa: rowsFromAoa, makeStock: makeStock, measKey: measKey, cleanTitle: cleanTitle, cleanProd: cleanProd, ecCodeSuffix: ecCodeSuffix, specsMentioned: specsMentioned, T: T, wrap: wrap };
if(typeof module !== 'undefined' && module.exports) module.exports = API; else root.CSAnswer = API;
})(typeof window !== 'undefined' ? window : this);
