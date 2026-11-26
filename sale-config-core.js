/* 판매가 검증 — 몰별 기준 설정의 바뀐 내용을 사람이 읽는 문장으로. 브라우저·Node 공용 (UMD).
 * 저장 전 안내 메시지와 변경 기록에서 같은 함수를 쓴다. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SaleConfigCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function str(v) { return v == null ? '' : String(v).trim(); }
  // 줄 식별: 쇼핑몰명 + 쇼핑몰ID(대소문자·숫자 앞 0 무시). 같은 줄이 두 개면 순번을 붙인다.
  function index(malls) {
    var out = {}, order = [], seen = {};
    (malls || []).forEach(function (m) {
      var id = str(m.id).toLowerCase(); if (/^\d+$/.test(id)) id = id.replace(/^0+(?=\d)/, '');
      var k = str(m.name) + '\u0001' + id;
      seen[k] = (seen[k] || 0) + 1; k += '\u0001' + seen[k];
      out[k] = m; order.push(k);
    });
    return { map: out, order: order };
  }
  function title(m) { return str(m.name) + (str(m.id) ? ' / ' + str(m.id) : ''); }
  function mult(v) { return v === '' || v == null ? '비움(검증 안 함)' : String(Number(v)); }
  function alts(v) { return (v || []).length ? v.map(Number).join(', ') : '없음'; }
  function round(v) { return v === 'c100' ? '100원 올림' : '10원 반올림'; }

  function diff(prev, next) {
    var out = [];
    if (Number(prev.costRate) !== Number(next.costRate)) out.push('원가율 ' + prev.costRate + ' → ' + next.costRate);
    if (Number(prev.tol) !== Number(next.tol)) out.push('허용 오차 ' + prev.tol + '원 → ' + next.tol + '원');
    var a = (prev.ranges || {}).BUYMA || {}, b = (next.ranges || {}).BUYMA || {};
    if (Number(a.lo) !== Number(b.lo) || Number(a.hi) !== Number(b.hi)) out.push('BUYMA 정상 범위 ' + a.lo + '~' + a.hi + ' → ' + b.lo + '~' + b.hi);
    var x = index(prev.malls), y = index(next.malls);
    y.order.forEach(function (k) {
      var n = y.map[k], p = x.map[k];
      if (!p) { out.push('추가: ' + title(n) + ' ×' + mult(n.mult)); return; }
      var c = [];
      if (mult(p.mult) !== mult(n.mult)) c.push('배수 ' + mult(p.mult) + ' → ' + mult(n.mult));
      if (alts(p.alts) !== alts(n.alts)) c.push('추가 정상 배수 ' + alts(p.alts) + ' → ' + alts(n.alts));
      if (round(p.round) !== round(n.round)) c.push('금액 처리 ' + round(p.round) + ' → ' + round(n.round));
      if (str(p.id) !== str(n.id)) c.push('쇼핑몰ID "' + str(p.id) + '" → "' + str(n.id) + '"');
      if (str(p.label) !== str(n.label)) c.push('표시 이름 "' + str(p.label) + '" → "' + str(n.label) + '"');
      if (str(p.note) !== str(n.note)) c.push('메모 "' + str(p.note) + '" → "' + str(n.note) + '"');
      if (c.length) out.push(title(n) + ': ' + c.join(' · '));
    });
    x.order.forEach(function (k) { if (!y.map[k]) out.push('삭제: ' + title(x.map[k]) + ' ×' + mult(x.map[k].mult)); });
    return out;
  }
  return { diff: diff };
});
