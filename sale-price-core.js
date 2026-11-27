/* 판매가 검증 코어 — 사방넷 주문서(주문서확인처리) 엑셀 → 몰별 기준 가격과 대조.
 * 브라우저·Node 공용 (UMD). 화면: sale-price-check.html
 *
 * 규칙
 *  - 사방넷 기준가 = 주문서 '원가' ÷ 0.87   (사방넷 등록 규칙: 원가 = 판매가 × 0.87)
 *  - 기대 판매가   = 기준가 × 몰별 배수       (배수는 사장님이 정한 표, 자동 추정 안 함)
 *  - 실제 판매가   = 주문서 '판매가' 열 (수집 금액, 사방넷에서 수정 불가)
 *  - 허용 오차     = ±100원
 *  - '결제금액'은 쿠폰·할인 반영액이라 판정하지 않고 참고로만 보여 준다.
 *  - 계정(쇼핑몰ID)마다 기준이 다른 몰(SSG.COM)은 주문서 '쇼핑몰ID' 열로 나눠 따로 검증한다.
 *  - 상품코드가 없는 스마트스토어 주문은 '스마트스토어 미매칭'으로 따로 묶는다. 원가가 없어 자동 판정하지 않고,
 *    판매가 ÷ 스마트스토어 배수(1.17) = 필웨이 환산가를 보여 주면 사람이 사방넷 가격과 비교한다(2026-11-25).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SalePriceCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var COST_RATE = 0.87;      // 원가 = 판매가 × 0.87
  var TOLERANCE = 100;       // 원
  var UNMAPPED_CODE = '000000-0000';
  var SMART = '스마트스토어', SMART_NOCODE = '스마트스토어 미매칭';

  // 기본 세팅 — 사장님 지정(2026-11-16): 전체 필웨이 가격(= 사방넷 기준가) 기준
  //   11번가 ×1.05 · 웰스토리몰/삼성카드 ×0.88(100원 단위 올림) · 스마트스토어/크림 ×1.17 · 쿠팡 ×0.92 · 트렌비 ×0.94 · 롯데온 ×1.09 · 바이마 ×0.93
  // 목록에 없는 몰은 모두 ×1.00(필웨이 가격 그대로, 사장님 확정 11-16). 아래 1.00 항목은 화면 표에 보이도록 적어 둔 것.
  // KREAM은 행사가 ×0.96도 정상(ALT_MULTS), BUYMA는 엔화 판매가를 환율로 환산해 0.93~1.10 범위(RANGES).
  var DEFAULT_MULTS = {
    '11번가': 1.05,
    '웰스토리몰2.0(메인몰)': 0.88,
    '삼성카드쇼핑': 0.88,
    '스마트스토어': 1.17,
    'KREAM': 1.17,
    '쿠팡': 0.92,
    '트렌비': 0.94,
    '롯데온': 1.09,
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
    '롯데홈쇼핑(신)': 1.00
  };

  // 한 몰에 계정(쇼핑몰ID)이 여러 개이고 계정마다 기준이 다른 경우 — 사장님 확정(2026-11-25)
  // 여기에 있는 몰은 목록에 없는 ID를 ×1.0으로 넘기지 않고 '검증 못 함'으로 둔다.
  var DEFAULT_ACCOUNTS = [
    { name: 'SSG.COM', id: 'BUYEST11', label: 'SSG바이스트', mult: 1.00, note: '바이스트 계정: 필웨이가' },
    { name: 'SSG.COM', id: '0024852987', label: 'SSG신세계V', mult: 0.92, note: '사이먼 계정: 필웨이*0.92' }
  ];
  // ID 비교용: 대소문자 무시, 숫자 ID는 앞의 0 무시(엑셀이 숫자로 바꾸면 0이 빠진다)
  function normId(v) {
    var s = str(v).toLowerCase();
    return /^\d+$/.test(s) ? s.replace(/^0+(?=\d)/, '') : s;
  }
  function accountName(a) { return a.label ? a.id + ' (' + a.label + ')' : a.id; }

  // 기대가를 100원 단위로 올림하는 몰 (웰스토리몰, 삼성카드). 나머지는 10원 단위 반올림.
  function isCeil100(mall) { return /삼성카드|웰스토리/.test(mall || ''); }
  function mallNote(mall) {
    if (rangeOf(mall)) return '엔화 판매가를 환율로 원화 환산 · 0.93~1.10 범위면 정상';
    if (isCeil100(mall)) return '100원 단위 올림';
    if (/^KREAM/i.test(mall || '')) return '행사가 ×0.96도 정상';
    return '';
  }
  // 몰 이름 찾기: 정확히 같은 이름이 없으면 "쿠팡 (…)" 처럼 앞부분이 같은 항목으로 본다
  function resolveMall(mall, mults) {
    if (mall in mults) return mall;
    var k, best = '';
    for (k in mults) if (k.length >= 2 && mall.indexOf(k) === 0 && k.length > best.length) best = k;
    return best || null;
  }

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
      qty: col('수량'), ea: col('EA'), price: col('판매가'), brand: col('브랜드명'), supply: col('공급단가'), pay: col('결제금액'),
      shopId: col('쇼핑몰ID'),
      // 재고·중복 확인용(없어도 가격 검증은 된다)
      model: col('모델NO'), rcv: col('수취인명'), tel: col('수취인전화번호1'), tel2: col('수취인전화번호2'), addr: col('수취인주소'),
      buyer: col('주문자명')
    };
    // '상품명'·'옵션'이 두 번 나오면 뒤쪽이 사방넷 확정 상품명·옵션
    var sName = head.lastIndexOf('상품명'), sOpt = head.lastIndexOf('옵션');
    function text(r, i) { return i > -1 ? str(r[i]) : ''; }
    var NEED = { cost: '원가', mall: '쇼핑몰명', code: '상품코드', price: '판매가', qty: '수량', shopId: '쇼핑몰ID' };
    var miss = [];
    Object.keys(NEED).forEach(function (k) { if (c[k] < 0) miss.push(NEED[k]); });
    if (miss.length) throw new Error('필요한 열이 없습니다: ' + miss.join(', ') + ' (주문서확인처리 출력양식에 이 열을 넣어 다시 받아 주세요)');
    var rows = [];
    for (i = hi + 1; i < aoa.length; i++) {
      var r = aoa[i]; if (!r) continue;
      var mall = str(r[c.mall]); if (!mall) continue;
      rows.push({
        line: i + 1, mall: mall, shopId: str(r[c.shopId]),
        ordAt: c.ordAt > -1 ? str(r[c.ordAt]) : '',
        code: str(r[c.code]), ordNo: c.ordNo > -1 ? str(r[c.ordNo]) : '', name: c.name > -1 ? str(r[c.name]) : '',
        mallOrd: c.mallOrd > -1 ? str(r[c.mallOrd]) : '', opt: c.opt > -1 ? str(r[c.opt]) : '',
        qty: num(r[c.qty]) || 1, ea: c.ea > -1 ? num(r[c.ea]) : 0,
        cost: num(r[c.cost]), price: num(r[c.price]), pay: c.pay > -1 ? num(r[c.pay]) : 0,
        brand: c.brand > -1 ? str(r[c.brand]) : '', supply: c.supply > -1 ? num(r[c.supply]) : 0,
        sName: text(r, sName), sOpt: text(r, sOpt), model: text(r, c.model),
        buyer: text(r, c.buyer), rcv: text(r, c.rcv), tel: text(r, c.tel), tel2: text(r, c.tel2), addr: text(r, c.addr)
      });
    }
    return rows;
  }

  // 지정 몰: 배수가 범위로 정해지는 몰 (BUYMA: 환율에 따라 0.93~1.10, 판매가는 엔화 → 환율로 원화 환산해 비교)
  var RANGES = { 'BUYMA': { lo: 0.93, hi: 1.10, jpy: true } };
  // 주 배수 외에 정상으로 인정하는 배수 (KREAM: 등록가 1.17 / 행사가 0.96)
  var ALT_MULTS = { 'KREAM': [0.96] };
  function rangeOf(mall, ranges) {
    var k, u = String(mall || '').toUpperCase(), R = ranges || RANGES;
    for (k in R) if (u.indexOf(k) === 0) return R[k];
    return null;
  }

  // 화면 '몰별 기준 설정'의 출발값. 사장님이 화면에서 고치면 브라우저에 저장된 값이 우선한다.
  // mults(배수) · alts(배수 외에 정상으로 보는 배수) · round('r10' 10원 반올림 / 'c100' 100원 올림) · note(메모)
  var DEFAULT_NOTES = {
    '11번가': '협의표: 필웨이*1.05', '스마트스토어': '협의표: 필웨이*1.17', 'KREAM': '등록가 ×1.17 / 행사가 ×0.96도 정상',
    '쿠팡': '협의표: 필웨이*0.92', '트렌비': '협의표: 필웨이*0.94', '롯데온': '협의표: 필웨이*1.09',
    '삼성카드쇼핑': '협의표: 필웨이*0.88, 100원 단위 올림', '웰스토리몰2.0(메인몰)': '협의표: 필웨이*0.88, 100원 단위 올림',
    '카카오톡쇼핑': '협의표: 필웨이*0.87', '한스타일': '협의표: 필웨이*0.97', '발란': '협의표: 필웨이*1.2',
    '머스트잇아울렛': '협의표: 필웨이*0.85', '페칭': '협의표: 상시 ×0.82 / 행사 ×0.79'
  };
  var EXTRA_DEFAULTS = { '카카오톡쇼핑': 0.87, '한스타일': 0.97, '발란': 1.2, '머스트잇아울렛': 0.85, '페칭': 0.82 };
  var CFG_VER = 2;   // 2: 쇼핑몰ID(계정)별 기준 추가
  function accountEntry(a) {
    return { name: a.name, id: a.id, label: a.label, mult: a.mult, alts: [], round: 'r10', note: a.note };
  }
  function defaultConfig() {
    var malls = [], k, seen = {};
    function add(name, mult) {
      if (seen[name]) return; seen[name] = 1;
      malls.push({ name: name, id: '', label: '', mult: mult, alts: (ALT_MULTS[name] || []).slice(), round: isCeil100(name) ? 'c100' : 'r10', note: DEFAULT_NOTES[name] || '' });
    }
    for (k in DEFAULT_MULTS) {
      add(k, DEFAULT_MULTS[k]);
      if (k === '롯데온') DEFAULT_ACCOUNTS.forEach(function (a) { malls.push(accountEntry(a)); });
    }
    for (k in EXTRA_DEFAULTS) add(k, EXTRA_DEFAULTS[k]);
    for (k in malls) if (malls[k].name === '페칭') malls[k].alts = [0.79];
    return { ver: CFG_VER, costRate: COST_RATE, tol: TOLERANCE, malls: malls, ranges: { 'BUYMA': { lo: 0.93, hi: 1.10, jpy: true } } };
  }
  // 예전에 브라우저에 저장했거나 내보낸 설정에 계정별 기준을 한 번만 넣는다.
  // ID 없는 'SSG.COM'·'SSG 사이먼' 줄은 두 계정 줄로 대체한다.
  function upgradeConfig(cfg) {
    if (cfg.ver >= CFG_VER) return cfg;
    var malls = (cfg.malls || []).filter(function (m) { return str(m.id) || (m.name !== 'SSG.COM' && m.name !== 'SSG 사이먼'); });
    var at = malls.map(function (m) { return m.name; }).indexOf('롯데온') + 1 || malls.length;
    DEFAULT_ACCOUNTS.forEach(function (a) {
      var has = malls.some(function (m) { return m.name === a.name && normId(m.id) === normId(a.id); });
      if (!has) malls.splice(at++, 0, accountEntry(a));
    });
    cfg.malls = malls; cfg.ver = CFG_VER;
    return cfg;
  }
  // 설정(cfg) → check()에 넘길 값들. 쇼핑몰ID가 적힌 줄은 그 계정에만, 빈 줄은 몰 전체에 적용.
  function fromConfig(cfg) {
    // 쇼핑몰명이 'constructor' 같은 값이어도 깨지지 않게 빈 사전을 쓴다
    var mults = Object.create(null), alts = Object.create(null), ceil = Object.create(null), accounts = Object.create(null);
    (cfg.malls || []).forEach(function (m) {
      if (!m.name) return;
      var mult = (m.mult === '' || m.mult == null) ? null : Number(m.mult);
      var al = (m.alts || []).filter(function (x) { return x > 0; });
      if (str(m.id)) {
        (accounts[m.name] || (accounts[m.name] = [])).push({ id: str(m.id), label: str(m.label), mult: mult, alts: al, ceil: m.round === 'c100' });
        return;
      }
      mults[m.name] = mult; alts[m.name] = al; ceil[m.name] = m.round === 'c100';
    });
    return { mults: mults, tol: cfg.tol, opts: { costRate: cfg.costRate, alts: alts, ceil: ceil, ranges: cfg.ranges, accounts: accounts } };
  }

  // 상태: ok 정상 · bad 가격 다름 · unmapped 미매핑(기준가 없음) · hold 보류(배수 비움/환율 없음) · manual 스마트스토어 미매칭(직접 확인)
  // 목록에 없는 몰은 필웨이 가격 그대로(×1.0)로 본다.
  // opts.jpyKrw: 엔→원 환율 (BUYMA 환산용)
  function check(rows, mults, tol, opts) {
    tol = tol == null ? TOLERANCE : tol;
    opts = opts || {};
    var costRate = opts.costRate > 0 ? opts.costRate : COST_RATE;
    var ALTS = opts.alts || ALT_MULTS;
    var ACC = opts.accounts || fromConfig({ malls: DEFAULT_ACCOUNTS }).opts.accounts;
    return rows.map(function (r) {
      var o = {}, k;
      for (k in r) o[k] = r[k];
      var unmapped = r.code === UNMAPPED_CODE || !r.cost;
      o.base = r.cost ? r.cost / costRate : 0;
      o.payRate = r.price ? r.pay / r.price : 0;

      // 어느 기준 줄을 쓰는지 먼저 정한다. group = 요약·필터에서 묶는 이름, ruleKey/ruleId = 설정 줄
      var ak = resolveMall(r.mall, ACC), acct = null, mk = resolveMall(r.mall, mults), noAcct = false;
      if (ak != null) {
        acct = ACC[ak].filter(function (a) { return normId(a.id) === normId(r.shopId); })[0] || null;
        noAcct = !acct && mk == null;
      }
      o.group = acct ? accountName(acct) : (noAcct ? r.mall + ' · ' + (r.shopId || 'ID 없음') : r.mall);
      o.ruleKey = acct ? ak : mk; o.ruleId = acct ? acct.id : ''; o.noAcct = noAcct;
      if (r.mall.indexOf(SMART) === 0 && (!r.code || r.code === UNMAPPED_CODE)) {
        var sm = acct ? acct.mult : (mk != null ? mults[mk] : null);
        o.manual = true; o.group = SMART_NOCODE; o.base = 0;
        o.mult = sm > 0 ? Number(sm) : DEFAULT_MULTS[SMART];
        o.conv = r.price ? Math.round(r.price / o.mult) : 0;   // 필웨이 환산가 (판매가는 1개 값)
        o.status = 'manual';
        return o;
      }
      if (unmapped) { o.status = 'unmapped'; return o; }

      var rg = rangeOf(r.mall, opts.ranges);
      if (rg) {
        o.mult = null; o.range = [rg.lo, rg.hi];
        if (!opts.jpyKrw) { o.status = 'hold'; o.note = '엔 환율이 없어 검증 못 함'; return o; }
        var lo = o.base * rg.lo, hi = o.base * rg.hi;
        var krw = r.price * opts.jpyKrw, q = r.qty > 1 ? r.qty : 1;
        o.krw = krw; o.ratio = krw / o.base;
        o.expect = Math.round(lo / 10) * 10; o.expectHi = Math.round(hi / 10) * 10;
        o.diff = krw < lo ? krw - lo : (krw > hi ? krw - hi : 0);
        if (krw >= lo - tol && krw <= hi + tol) o.status = 'ok';
        else if (q > 1 && krw / q >= lo - tol && krw / q <= hi + tol) { o.status = 'ok'; o.note = '수량 ' + q + '개 합계가'; }
        else o.status = 'bad';
        return o;
      }

      if (noAcct) { o.mult = null; o.status = 'hold'; o.note = '기준이 없는 쇼핑몰ID'; return o; }
      var m = acct ? acct.mult : (mk == null ? 1.0 : mults[mk]);   // 목록 외 몰 → ×1.0
      if (!acct && mk == null) o.note = '목록 외 몰 ×1.0';
      o.mult = (m == null || m === '') ? null : Number(m);
      if (o.mult == null) { o.status = 'hold'; return o; }
      function expectFor(mult) {
        var raw = o.base * mult;
        var useCeil = acct ? acct.ceil : ((mk != null && opts.ceil) ? !!opts.ceil[mk] : isCeil100(r.mall));
        return useCeil ? Math.ceil(raw / 100 - 1e-9) * 100 : Math.round(raw / 10) * 10;
      }
      o.expect = expectFor(o.mult);
      o.diff = r.price - o.expect;
      var q2 = r.qty > 1 ? r.qty : 1;
      if (Math.abs(r.price - o.expect) <= tol) o.status = 'ok';
      else if (q2 > 1 && Math.abs(r.price - o.expect * q2) <= tol * q2) { o.status = 'ok'; o.note = '수량 ' + q2 + '개 합계가'; }
      else {
        o.status = 'bad';
        var alts = acct ? acct.alts : ((mk != null && ALTS[mk]) || []), a;
        for (a = 0; a < alts.length; a++) {
          var ex = expectFor(alts[a]);
          if (Math.abs(r.price - ex) <= tol) { o.status = 'ok'; o.note = '행사가 ×' + alts[a]; o.diff = r.price - ex; break; }
        }
      }
      return o;
    });
  }

  function summarize(res) {
    var s = { total: res.length, ok: 0, bad: 0, unmapped: 0, nomult: 0, hold: 0, manual: 0, malls: Object.create(null) };
    res.forEach(function (r) {
      s[r.status]++;
      var g = r.group || r.mall;
      var m = s.malls[g] || (s.malls[g] = { total: 0, ok: 0, bad: 0, unmapped: 0, nomult: 0, hold: 0, manual: 0, row: r });
      m.total++; m[r.status]++;
    });
    return s;
  }

  return { COST_RATE: COST_RATE, TOLERANCE: TOLERANCE, UNMAPPED_CODE: UNMAPPED_CODE, DEFAULT_MULTS: DEFAULT_MULTS, mallNote: mallNote, defaultConfig: defaultConfig, fromConfig: fromConfig, resolveMall: resolveMall, RANGES: RANGES, ALT_MULTS: ALT_MULTS, rangeOf: rangeOf, DEFAULT_ACCOUNTS: DEFAULT_ACCOUNTS, normId: normId, accountName: accountName, upgradeConfig: upgradeConfig,
           parseOrders: parseOrders, check: check, summarize: summarize };
});
