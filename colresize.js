/* 표 헤더 칸 폭 조절: 헤더 오른쪽 경계를 드래그하면 그 칸 폭이 바뀐다. 더블클릭하면 자동 폭으로 복원. */
(function () {
  if (window.__colResize) return; window.__colResize = true;
  var st = document.createElement('style');
  st.textContent = '.cr-h{position:absolute;top:0;right:-3px;width:8px;height:100%;cursor:col-resize;user-select:none;touch-action:none;z-index:5}' +
    '.cr-h:hover,.cr-h.on{background:rgba(37,99,235,.4)}' +
    'table.cr-fixed{table-layout:fixed;max-width:none}' +
    'table.cr-fixed td,table.cr-fixed th{overflow:hidden;text-overflow:ellipsis}';
  document.head.appendChild(st);

  function headRow(t) {
    var h = t.tHead && t.tHead.rows.length ? t.tHead.rows[t.tHead.rows.length - 1] : null;
    return h || (t.rows[0] && t.rows[0].querySelector('th') ? t.rows[0] : null);
  }
  function reset(t) {
    t.classList.remove('cr-fixed'); t.style.width = '';
    var r = headRow(t); if (r) [].forEach.call(r.cells, function (c) { c.style.width = ''; });
  }
  function freeze(t, r) {
    var ws = [].map.call(r.cells, function (c) { return c.getBoundingClientRect().width; });
    var sum = 0;
    [].forEach.call(r.cells, function (c, i) { c.style.width = ws[i] + 'px'; sum += ws[i]; });
    t.style.width = sum + 'px'; t.classList.add('cr-fixed');
  }
  function enhance(t) {
    var r = headRow(t);
    if (!r || r.cells.length < 2) return;
    if (t.classList.contains('cr-fixed') && !r.cells[0].style.width) reset(t); // 다시 그려진 표는 초기화
    [].forEach.call(r.cells, function (th) {
      if (th.querySelector(':scope > .cr-h')) return;
      if (getComputedStyle(th).position === 'static') th.style.position = 'relative';
      var h = document.createElement('span'); h.className = 'cr-h'; h.title = '드래그: 칸 폭 조절 / 더블클릭: 원래대로';
      h.addEventListener('dblclick', function (e) { e.stopPropagation(); reset(t); });
      h.addEventListener('click', function (e) { e.stopPropagation(); });
      h.addEventListener('pointerdown', function (e) {
        e.preventDefault(); e.stopPropagation();
        var row = headRow(t); if (!row) return;
        if (!t.classList.contains('cr-fixed')) freeze(t, row);
        var startX = e.clientX, startW = th.getBoundingClientRect().width,
            startT = parseFloat(t.style.width) || t.getBoundingClientRect().width;
        h.classList.add('on'); h.setPointerCapture(e.pointerId);
        function mv(ev) {
          var w = Math.max(30, startW + ev.clientX - startX);
          th.style.width = w + 'px'; t.style.width = (startT + w - startW) + 'px';
        }
        function up() { h.classList.remove('on'); h.removeEventListener('pointermove', mv); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up); }
        h.addEventListener('pointermove', mv); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
      });
      th.appendChild(h);
    });
  }
  var pending = false;
  function scan() { pending = false; [].forEach.call(document.querySelectorAll('table'), enhance); }
  function queue() { if (!pending) { pending = true; setTimeout(scan, 50); } }
  new MutationObserver(queue).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState !== 'loading') queue(); else document.addEventListener('DOMContentLoaded', queue);
})();
