/* 판매가 검증 — 출고 가능(이카운트 현재고) · 중복주문 판정. 브라우저·Node 공용 (UMD). 화면: sale-price-check.html
 *
 * 규칙 (2026-11-26 사장님 확정: 이카운트 차감 전에 매일 아침 돌린다)
 *  - 품목 찾기: 모델NO(없거나 못 찾으면 상품명 끝 품번) + 확정 옵션(사이즈)
 *  - '출고가능'은 확실할 때만. 애매하면 '품목 확인'으로 보낸다.
 *      '시즌변경' 표시 품목은 쓰지 않는다 · 스크래치/하자는 번호까지 같은 것끼리만
 *      주문에 시즌이 있으면 같은 시즌(또는 시즌 표시 없는) 품목만 · 품목명이 똑같은 것이 있으면 그것만
 *      이름이 다른 품목이 여러 개면 모두 재고가 충분할 때만 출고가능
 *    제외한 품목에 재고가 있으면 note 로 알려 준다.
 *  - 필요 수량 = 이 파일 안에서 같은 품목을 쓰는 주문의 (수량 × EA) 합계.
 *    ok 출고가능(재고 ≥ 필요) · short 재고 부족(0 < 재고 < 필요, 해당 주문 전부) · none 재고 없음 · unknown 품목 확인
 *  - 중복은 판정하지 않고 확인하라고 표시만 한다.
 *    cust 고객 중복: 수취인명이 같고 전화 또는 주소가 같은 사람이 같은 상품·사이즈를 2건 이상
 *    same 같은 상품: 같은 상품·사이즈 주문이 2건 이상(고객 무관)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SaleStockCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var UNMAPPED = '000000-0000';
  function str(v) { return v == null ? '' : String(v).trim(); }
  // 서버(ecs_norm_style)와 같은 규칙: 공백 하나로, 대문자
  function normStyle(s) { return str(s).replace(/\s+/g, ' ').toUpperCase(); }
  // 상품명 끝의 영문/숫자 토큰 묶음 = 품번 (서버 ecs_style_from_name 과 같은 규칙)
  function styleFromName(name) {
    var t = str(name).split(/\s+/), i = t.length;
    while (i > 0 && /^[A-Za-z0-9\/\-.]+$/.test(t[i - 1])) i--;
    var s = t.slice(i).join(' ');
    return s.length >= 3 ? normStyle(s) : '';
  }
  function normSize(v) {
    var s = str(v), m = s.match(/\[([^\]]*)\]\s*$/);
    if (m) s = m[1];
    s = s.replace(/^[^:：]*[:：]/, '').toUpperCase().replace(/\s+/g, '');
    s = s.replace(/^(\d+)Y$/, '$1A');
    return /^(|TU|FREE|F|단품|ONESIZE|OS)$/.test(s) ? 'FREE' : s;
  }
  // 스크래치/하자 표시: 대괄호가 없거나 이름 중간에 있어도 잡고, 번호(스크래치2)까지 구분
  function flaw(name) { var m = str(name).match(/(스크래치|하자)\s*(\d*)/); return m ? m[1] + m[2] : ''; }
  var SEASON = /(^|[^0-9A-Za-z])(\d\d(?:SS|FW))(?![0-9A-Za-z])/i;
  function season(name) { var m = str(name).match(SEASON); return m ? m[2].toUpperCase() : ''; }
  function letters(name) { return str(name).toUpperCase().replace(/[^0-9A-Z가-힣]/g, ''); }
  function plain(name) { return letters(str(name).replace(SEASON, '$1')); }   // 시즌만 뺀 이름
  function moved(name) { return str(name).indexOf('시즌변경') > -1; }
  function brief(x) { return str(x[2]) + ' ' + (Number(x[3]) || 0) + '개'; }
  function stylesOf(r) {
    var out = [];
    [normStyle(r.model), styleFromName(r.sName || r.name)].forEach(function (s) { if (s.length >= 3 && out.indexOf(s) < 0) out.push(s); });
    return out;
  }
  function stylesFor(rows) {
    var seen = {};
    rows.forEach(function (r) { stylesOf(r).forEach(function (s) { seen[s] = 1; }); });
    return Object.keys(seen);
  }

  // 주문 1행에 맞는 이카운트 품목 찾기. items: { 품번: [[코드, 사이즈, 품목명, 수량], ...] }
  // 결과: { hit:[품목], rest:[제외한 품목] } 또는 { why: 이유, rest }
  function findStock(r, items) {
    var styles = stylesOf(r), name = r.sName || r.name, size = normSize(r.sOpt || r.opt), tag = flaw(name), sea = season(name);
    var sizes = [], cand = [], seen = {};
    if (!styles.length) return { why: r.code === UNMAPPED || !r.code ? '상품코드·품번 없음' : '품번을 읽지 못함', rest: [] };
    // 모델NO 와 상품명 끝 품번이 다른 상품을 가리킬 수 있으므로 두 쪽 후보를 모두 모은 뒤 걸러낸다
    styles.forEach(function (st) {
      (items[st] || []).forEach(function (x) {
        var z = normSize(x[1]); if (sizes.indexOf(z) < 0) sizes.push(z);
        if (z === size && !seen[x[0]]) { seen[x[0]] = 1; cand.push(x); }
      });
    });
    if (!cand.length) return { why: sizes.length ? '사이즈 다름 · 이카운트: ' + sizes.slice(0, 12).join(', ') : '이카운트에서 품번을 못 찾음', rest: [] };
    var kept = cand.filter(function (x) { return !moved(x[2]); });
    var same = kept.filter(function (x) { return flaw(x[2]) === tag; });
    var pool = same;
    if (sea) {
      pool = same.filter(function (x) { return season(x[2]) === sea; });
      if (!pool.length) pool = same.filter(function (x) { return !season(x[2]); });
    }
    var exact = pool.filter(function (x) { return letters(x[2]) === letters(name); });
    if (exact.length) pool = exact;
    if (pool.length) return { hit: pool, rest: cand.filter(function (x) { return pool.indexOf(x) < 0; }) };
    var what = !kept.length ? "'시즌변경' 표시 품목만 있음" : (!same.length ? '스크래치·하자 표시가 다른 품목만 있음' : '시즌이 다른 품목만 있음');
    var total = cand.reduce(function (n, x) { return n + (Number(x[3]) || 0); }, 0);
    return { why: what + ' (재고 ' + total + ') · 실물 확인', rest: cand };
  }

  // 중복 판정용 상품 열쇠 (재고 조회 전에도 쓸 수 있게 파일 내용만으로 만든다)
  function productKey(r) {
    var name = r.sName || r.name, style = styleFromName(name) || normStyle(r.model);
    var base = style || (r.code && r.code !== UNMAPPED ? 'C:' + r.code : 'N:' + normStyle(r.name || name));
    // 품번도 상품코드도 없는 기획전 주문은 옵션 원문이 상품을 가른다
    var size = style ? normSize(r.sOpt || r.opt) : normStyle(r.opt || r.sOpt);
    return base + '|' + size + '|' + flaw(name);
  }
  function digits(v) { return str(v).replace(/\D/g, ''); }
  function samePerson(a, b) {
    var m = str(a.rcv).replace(/\s+/g, ''), n = str(b.rcv).replace(/\s+/g, '');
    if (!m || m !== n) return false;
    var x = [digits(a.tel), digits(a.tel2)].filter(Boolean), y = [digits(b.tel), digits(b.tel2)].filter(Boolean);
    if (x.some(function (n) { return y.indexOf(n) > -1; })) return true;
    var p = str(a.addr).replace(/\s+/g, ''), q = str(b.addr).replace(/\s+/g, '');
    return !!p && p === q;
  }
  function groupName(i) { var s = ''; do { s = String.fromCharCode(65 + i % 26) + s; i = Math.floor(i / 26) - 1; } while (i >= 0); return s; }

  // rows: parseOrders 결과, items: 서버 응답(아직 없으면 null)
  function analyze(rows, items) {
    var out = rows.map(function (r) { return { line: r.line, stock: '', qty: null, need: 0, parts: [], why: '', note: '', matched: '', cust: '', custOrders: [], same: '', sameCount: 0, units: (r.qty || 1) * (r.ea > 1 ? r.ea : 1) }; });

    // 재고
    if (items) {
      // 같은 품목 코드를 하나라도 같이 쓰는 주문끼리 한 묶음 → 필요 수량을 함께 센다
      var up = {};
      var find = function (c) { while (up[c] && up[c] !== c) c = up[c]; return c; };
      rows.forEach(function (r, i) {
        var f = findStock(r, items), o = out[i];
        o.note = f.rest.filter(function (x) { return Number(x[3]) > 0; }).map(brief).join(', ');
        if (o.note) o.note = '다른 품목에 재고: ' + o.note;
        if (!f.hit) { o.stock = 'unknown'; o.why = f.why; o.note = f.why.indexOf('(재고') > -1 ? '품목: ' + f.rest.map(brief).join(', ') : o.note; o.need = o.units; return; }
        o.parts = f.hit.map(function (x) { return { code: x[0], name: x[2], qty: Number(x[3]) || 0 }; });
        var head = find(o.parts[0].code);
        o.parts.forEach(function (p) { up[find(p.code)] = head; });
      });
      var need = {};
      out.forEach(function (o) { if (!o.parts.length) return; o.key = 'S:' + find(o.parts[0].code); need[o.key] = (need[o.key] || 0) + o.units; });
      out.forEach(function (o, i) {
        if (!o.parts.length) return;
        var name = rows[i].sName || rows[i].name;
        o.need = need[o.key];
        if (!o.parts.every(function (p) { return letters(p.name) === letters(name); }))
          o.matched = o.parts.map(function (p) { return p.name; }).filter(function (n, k, a) { return a.indexOf(n) === k; }).join(' / ');
        var total = o.parts.reduce(function (a, p) { return a + p.qty; }, 0);
        var mixed = o.parts.some(function (p) { return plain(p.name) !== plain(o.parts[0].name); });
        if (total <= 0) { o.qty = total; o.stock = 'none'; }
        else if (mixed) {
          // 서로 다른 상품일 수 있으니 합산하지 않는다
          if (o.parts.every(function (p) { return p.qty >= o.need; })) { o.qty = total; o.stock = 'ok'; }
          else { o.stock = 'unknown'; o.why = '이름이 다른 품목이 여러 개 · 직접 확인'; }
        } else { o.qty = total; o.stock = total < o.need ? 'short' : 'ok'; }
      });
    }

    // 중복
    var byProduct = {}, order = [];
    rows.forEach(function (r, i) {
      var k = out[i].key || productKey(r);
      if (!byProduct[k]) { byProduct[k] = []; order.push(k); }
      byProduct[k].push(i);
    });
    var sameN = 0, custN = 0;
    order.forEach(function (k) {
      var g = byProduct[k]; if (g.length < 2) return;
      var tag = groupName(sameN++);
      g.forEach(function (i) { out[i].same = tag; out[i].sameCount = g.length; });
      // 같은 사람끼리 이어 붙인다 (A=B 전화, B=C 주소여도 한 묶음)
      var left = g.slice();
      while (left.length) {
        var who = [left.shift()], j = 0;
        for (; j < who.length; j++) {
          left = left.filter(function (n) { if (samePerson(rows[who[j]], rows[n])) { who.push(n); return false; } return true; });
        }
        if (who.length < 2) continue;
        var c = groupName(custN++);
        who.forEach(function (i) {
          out[i].cust = c;
          out[i].custOrders = who.filter(function (n) { return n !== i; }).map(function (n) { return rows[n].mallOrd || ('엑셀 ' + rows[n].line + '행'); });
        });
      }
    });

    var count = { ok: 0, none: 0, short: 0, unknown: 0, cust: 0, same: 0, check: 0 };
    out.forEach(function (o) {
      if (o.stock) count[o.stock]++;
      if (o.cust) count.cust++;
      if (o.same) count.same++;
      if (needsCheck(o)) count.check++;
    });
    return { rows: out, count: count, canCust: rows.some(function (r) { return str(r.rcv); }) };
  }
  function needsCheck(o) { return (!!o.stock && o.stock !== 'ok') || !!o.cust || !!o.same; }

  return { normStyle: normStyle, normSize: normSize, styleFromName: styleFromName, stylesFor: stylesFor, analyze: analyze, needsCheck: needsCheck };
});
