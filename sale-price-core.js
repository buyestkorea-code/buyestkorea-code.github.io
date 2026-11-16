/* 판매가 검증 코어 — 사방넷 주문서(주문서확인처리) 엑셀 → 몰별 기준 가격과 대조.
 * 브라우저·Node 공용 (UMD). 화면: sale-price-check.html
 *
 * 규칙
 *  - 사방넷 기준가 = 주문서 '원가' ÷ 0.87   (사방넷 등록 규칙: 원가 = 판매가 × 0.87)
 *  - 기대 판매가   = 기준가 × 몰별 배수       (배수는 사장님이 정한 표, 자동 추정 안 함)
 *  - 실제 판매가   = 주문서 '판매가' 열 (수집 금액, 사방넷에서 수정 불가)
 *  - 허용 오차     = ±100원
 *  - '결제금액'은 쿠폰·할인 반영액이라 판정하지 않고 참고로만 보여 준다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SalePriceCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var COST_RATE = 0.87;      // 원가 = 판매가 × 0.87
  var TOLERANCE = 100;       // 원
  var UNMAPPED_CODE = '000000-0000';

  // 사장님 확정(2026-11-16, BUYMA 0.93 포함). null = 보류(검증 제외, "미검증"으로 표시)
  var DEFAULT_MULTS = {
    '스마트스토어': 1.17,
    '이터널저니': 1.17,
    '롯데온': 1.09,
    '삼성카드쇼핑': 0.88,
    '웰스토리몰2.0(메인몰)': 0.88,
    'KREAM': 0.96,
    '트렌비': 0.94,
    'REEBONZ': 0.86,
    '11번가': 1.05,
    'SSG.COM': 1.00,
    '카카오스타일 (지그재그, 포스티)': 1.00,
    '머스트잇': 1.00,
    'LFmall': 1.00,
    'CJ온스타일': 1.00,
    'Wconcept': 1.00,
    '신세계V': 1.00,
    'GS shop': 1.00,
    '현대홈쇼핑(3)': 1.00,
    'SK스토아': 1.00,
    '퀸잇': 1.00,
    '에이블리': 1.00,
    '롯데홈쇼핑(신)': 1.00,
    'BUYMA': 0.93
  };

  function num(v) {
    if (v == null || v === '') return 0;
    var n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
    return isFinite(n) ? n : 0;
  }
  function str(v) { return v == null ? '' : String(v).trim(); }

  // 헤더 행 찾기: '쇼핑몰명' + '판매가' + '상품코드' 가 한 줄에 있는 행
  function parseOrders(aoa) {
    var hi = -1, i, j;
    for (i = 0; i < Math.min(aoa.length, 15); i++) {
      var cells = (aoa[i] || []).map(str);
      if (cells.indexOf('쇼핑몰명') > -1 && cells.indexOf('판매가') > -1 && cells.indexOf('상품코드') > -1) { hi = i; break; }
    }
    if (hi < 0) throw new Error('사방넷 주문서 파일이 아닌 것 같습니다 ("쇼핑몰명", "상품코드", "판매가" 열을 찾지 못했어요)');
    var head = aoa[hi].map(str);
    function col(name) { return head.indexOf(name); }   // 같은 이름이 여러 개면 첫 번째
    var c = {
      cost: col('원가'), mall: col('쇼핑몰명'), ordAt: col('주문일시'), code: col('상품코드'),
      ordNo: col('주문번호'), name: col('상품명'), mallOrd: col('주문번호(쇼핑몰)'), opt: col('옵션'),
      qty: col('수량'), ea: col('EA'), price: col('판매가'), brand: col('브랜드명'), supply: col('공급단가'), pay: col('결제금액')
    };
    var miss = [];
    ['cost', 'mall', 'code', 'price', 'qty'].forEach(function (k) { if (c[k] < 0) miss.push(k); });
    if (miss.length) throw new Error('필요한 열이 없습니다: ' + miss.join(', ') + ' (주문서 출력양식에 원가·수량 열이 있어야 합니다)');
    var rows = [];
    for (i = hi + 1; i < aoa.length; i++) {
      var r = aoa[i]; if (!r) continue;
      var mall = str(r[c.mall]); if (!mall) continue;
      rows.push({
        line: i + 1, mall: mall,
        ordAt: c.ordAt > -1 ? str(r[c.ordAt]) : '',
        code: str(r[c.code]), ordNo: c.ordNo > -1 ? str(r[c.ordNo]) : '', name: c.name > -1 ? str(r[c.name]) : '',
        mallOrd: c.mallOrd > -1 ? str(r[c.mallOrd]) : '', opt: c.opt > -1 ? str(r[c.opt]) : '',
        qty: num(r[c.qty]) || 1, ea: c.ea > -1 ? num(r[c.ea]) : 0,
        cost: num(r[c.cost]), price: num(r[c.price]), pay: c.pay > -1 ? num(r[c.pay]) : 0,
        brand: c.brand > -1 ? str(r[c.brand]) : '', supply: c.supply > -1 ? num(r[c.supply]) : 0
      });
    }
    return rows;
  }

  // 상태: ok 정상 · bad 가격 다름 · unmapped 미매핑(기준가 없음) · nomult 몰 배수 없음 · hold 보류(배수 null)
  function check(rows, mults, tol) {
    tol = tol == null ? TOLERANCE : tol;
    return rows.map(function (r) {
      var o = {}, k;
      for (k in r) o[k] = r[k];
      var unmapped = r.code === UNMAPPED_CODE || !r.cost;
      var m = mults[r.mall];
      o.base = r.cost ? r.cost / COST_RATE : 0;
      o.mult = (m == null || m === '') ? null : Number(m);
      o.expect = (o.mult != null && o.base) ? Math.round(o.base * o.mult / 10) * 10 : 0;
      o.diff = o.expect ? r.price - o.expect : 0;
      o.payRate = r.price ? r.pay / r.price : 0;
      if (unmapped) o.status = 'unmapped';
      else if (!(r.mall in mults)) o.status = 'nomult';
      else if (o.mult == null) o.status = 'hold';
      else if (Math.abs(r.price - o.expect) <= tol) o.status = 'ok';
      else if (r.qty > 1 && Math.abs(r.price - o.expect * r.qty) <= tol * r.qty) { o.status = 'ok'; o.note = '수량 ' + r.qty + '개 합계가'; }
      else o.status = 'bad';
      return o;
    });
  }

  function summarize(res) {
    var s = { total: res.length, ok: 0, bad: 0, unmapped: 0, nomult: 0, hold: 0, malls: {} };
    res.forEach(function (r) {
      s[r.status]++;
      var m = s.malls[r.mall] || (s.malls[r.mall] = { total: 0, ok: 0, bad: 0, unmapped: 0, nomult: 0, hold: 0 });
      m.total++; m[r.status]++;
    });
    return s;
  }

  return { COST_RATE: COST_RATE, TOLERANCE: TOLERANCE, UNMAPPED_CODE: UNMAPPED_CODE, DEFAULT_MULTS: DEFAULT_MULTS,
           parseOrders: parseOrders, check: check, summarize: summarize };
});
