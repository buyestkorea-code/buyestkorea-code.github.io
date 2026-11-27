/* 판매가 검증 — 하루 1·2·3차 회차 나누기 (브라우저·Node 공용)
 * 사방넷 주문서는 누적이라, 앞 회차에서 확인을 마친 사방넷 주문번호를 이번 검증에서 뺀다.
 */
(function (root, make) {
  if (typeof module === 'object' && module.exports) module.exports = make();
  else root.SaleRoundCore = make();
})(this, function () {
  // 서버가 받는 번호 형식과 같아야 한다. 맞지 않으면 기록하지도 빼지도 않는다
  var NO = /^[0-9A-Za-z_-]{1,40}$/;
  function keyOf(r) { var v = String(r.ordNo == null ? '' : r.ordNo); return NO.test(v) ? v : ''; }

  // rows 의 각 줄에 prev(확인을 마친 회차 번호, 없으면 0)를 적고, 이번에 새로 확인할 번호를 돌려준다
  // rounds: 서버의 오늘 회차 목록(오래된 것 먼저) [{ orders:[...] }]
  function split(rows, rounds) {
    var seen = Object.create(null), mine = Object.create(null);
    (rounds || []).forEach(function (x, i) { (x.orders || []).forEach(function (n) { if (!seen[n]) seen[n] = i + 1; }); });
    var out = { keys: [], fresh: 0, prev: 0, noKey: 0 };
    rows.forEach(function (r) {
      var k = keyOf(r);
      r.prev = k && seen[k] ? seen[k] : 0;
      if (r.prev) { out.prev++; return; }
      out.fresh++;
      if (!k) out.noKey++;
      else if (!mine[k]) { mine[k] = true; out.keys.push(k); }
    });
    return out;
  }

  return { keyOf: keyOf, split: split };
});
