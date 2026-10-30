/* 이카운트 최신 갱신 안내문 (2026-10-31)
 * 이카운트 재고/이름을 서버가 언제 받았는지 보여주고, 언제 쓰면 좋은지 크게 안내한다.
 * 쓰는 법: 화면 맨 아래에 <script src="sync-banner.js"></script> 한 줄. 안내문은 body 맨 위에 자동으로 붙는다.
 * 데이터: https://buyest.co.kr/sync_status_api.php (시각/상태만, 읽기 전용, 이카운트 호출 없음)
 */
(function () {
  if (window.__syncBannerLoaded) return; window.__syncBannerLoaded = true;
  var API = 'https://buyest.co.kr/sync_status_api.php';
  var QTY_MIN = 7, NAMES_MIN = 28, APPLY_MIN = 40, SAFE_MIN = 30;   // 서버 크론: 매시 7분 재고 / 28분 이름 / 40분 변동 점검
  var H_FROM = 10, H_TO = 19;                                        // 크론이 도는 시간대(10~19시)

  var css = '' +
    '#syncBanner{font-family:"Pretendard","Noto Sans KR","Malgun Gothic",system-ui,sans-serif;margin:0 0 14px;border:1px solid var(--sb-line);border-left:6px solid var(--sb-c);border-radius:10px;background:var(--sb-bg);color:#111827;padding:14px 18px;line-height:1.5;' +
    '--sb-c:#6b7280;--sb-bg:#f9fafb;--sb-line:#e5e7eb}' +
    '#syncBanner[data-s="ok"]{--sb-c:#15803d;--sb-bg:#f0fdf4;--sb-line:#bbf7d0}' +
    '#syncBanner[data-s="wait"]{--sb-c:#b45309;--sb-bg:#fffbeb;--sb-line:#fde68a}' +
    '#syncBanner[data-s="warn"]{--sb-c:#b91c1c;--sb-bg:#fef2f2;--sb-line:#fecaca}' +
    '#syncBanner .sb-top{display:flex;flex-wrap:wrap;align-items:center;gap:10px}' +
    '#syncBanner .sb-pill{display:inline-block;padding:3px 11px;border-radius:999px;background:var(--sb-c);color:#fff;font-size:13px;font-weight:700;letter-spacing:.01em}' +
    '#syncBanner .sb-state{font-size:17px;font-weight:700}' +
    '#syncBanner .sb-rec{margin:8px 0 2px;font-size:20px;font-weight:800;letter-spacing:-.01em}' +
    '#syncBanner .sb-rec b{color:var(--sb-c);background:rgba(255,255,255,.7);padding:0 6px;border-radius:5px}' +
    '#syncBanner .sb-times{display:flex;flex-wrap:wrap;gap:8px 26px;margin:10px 0 8px}' +
    '#syncBanner .sb-t{min-width:120px}' +
    '#syncBanner .sb-t span{display:block;font-size:12px;color:#6b7280}' +
    '#syncBanner .sb-t strong{font-size:22px;font-variant-numeric:tabular-nums;font-weight:800}' +
    '#syncBanner .sb-t em{font-style:normal;font-size:12px;color:#6b7280;margin-left:4px;font-weight:500}' +
    '#syncBanner .sb-cron{font-size:13px;color:#374151;border-top:1px dashed var(--sb-line);padding-top:8px}' +
    '#syncBanner .sb-cron code{background:rgba(0,0,0,.05);padding:1px 6px;border-radius:4px;font-size:12.5px}' +
    '#syncBanner .sb-note{margin-top:4px;font-size:12.5px;color:#6b7280}' +
    '@media (max-width:560px){#syncBanner{padding:12px 14px}#syncBanner .sb-rec{font-size:17px}#syncBanner .sb-t strong{font-size:19px}}';

  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  var box = document.createElement('div'); box.id = 'syncBanner'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite');
  function mount() { if (document.body) document.body.insertBefore(box, document.body.firstChild); else document.addEventListener('DOMContentLoaded', mount); }
  mount();

  var fmt = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false });
  var fmtDay = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' });
  function hm(ts) { return ts ? fmt.format(new Date(ts * 1000)).replace(/^24/, '00') : '—'; }
  function kst(ts) { var p = {}; new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(ts * 1000)).forEach(function (x) { p[x.type] = +x.value; }); if (p.hour === 24) p.hour = 0; return p; }
  function dayLabel(ts, now) { return fmtDay.format(new Date(ts * 1000)) === fmtDay.format(new Date(now * 1000)) ? '오늘' : fmtDay.format(new Date(ts * 1000)); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function nextAt(now, min) {          // 다음 크론 시각(10~19시 안에서 매시 min분)
    var base = Math.floor(now / 3600) * 3600;      // 한국은 UTC+9(정시 단위)라 정시 경계가 같다
    for (var i = 0; i < 48; i++) {
      var cand = base + i * 3600 + min * 60;
      if (cand <= now) continue;
      var h = kst(cand).hour;
      if (h >= H_FROM && h <= H_TO) return cand;
    }
    return 0;
  }

  function render(d) {
    var now = d ? d.now : Math.floor(Date.now() / 1000), p = kst(now);
    var inWin = p.hour >= H_FROM && p.hour <= H_TO, s = 'idle', pill = '확인 중', state = '', rec = '';
    var applyTxt = d && d.auto_apply === 'off' ? '현재 <b>꺼짐</b>(사람이 확인 후 반영)' : '켜짐';
    if (d) {
      var qAge = d.qty_ts ? (now - d.qty_ts) / 60 : 1e9, namesOk = d.names_ts && d.names_ts >= d.qty_ts;
      if (d.qty_status && d.qty_status !== 'ok') { s = 'warn'; pill = '갱신 오류'; state = '재고 갱신이 실패했어요 — 재고가 최신이 아닐 수 있어요'; }
      else if (!inWin) { s = 'idle'; pill = '야간'; state = '지금은 크론이 쉬는 시간이에요 — 마지막 갱신 기준입니다 (이름은 20분마다 따로 채워요)'; }
      else if (qAge > 180) { s = 'warn'; pill = '갱신 지연'; state = '재고를 받은 지 ' + Math.round(qAge / 60) + '시간이 지났어요 — 관리자에게 알려 주세요'; }
      else if (namesOk) { s = 'ok'; pill = '최신'; state = '지금 쓰셔도 됩니다 — ' + hm(d.names_ts) + ' 기준 재고·이름 모두 최신'; }
      else if (qAge < 60) { s = 'wait'; pill = '이름 확인 전'; state = hm(d.qty_ts) + '에 재고는 받았고, 이름 확인(매시 ' + pad(NAMES_MIN) + '분)이 아직이에요 — 방금 이름을 바꾼 품목은 ' + pad(p.hour) + ':' + pad(SAFE_MIN) + ' 이후에 쓰세요'; }
      else { s = 'warn'; pill = '이름 확인 지연'; state = '이름 확인이 늦어지고 있어요 — [수동 이름 받아오기]를 쓰거나 관리자에게 알려 주세요'; }
    } else { s = 'idle'; pill = '시각 불러오기 실패'; state = '갱신 시각을 불러오지 못했어요. 아래 안내만 참고하세요.'; }

    rec = '방금 재고추가·이름변경한 품목은 <b>매시 ' + SAFE_MIN + '분 이후 (:' + SAFE_MIN + '~:59)</b>에 쓰세요.';
    var nq = d ? nextAt(now, QTY_MIN) : 0, nn = d ? nextAt(now, NAMES_MIN) : 0;
    var times = d ? (
      '<div class="sb-times">' +
      '<div class="sb-t"><span>재고 마지막 갱신</span><strong>' + hm(d.qty_ts) + '</strong><em>' + (d.qty_ts ? dayLabel(d.qty_ts, now) : '') + '</em></div>' +
      '<div class="sb-t"><span>이름 마지막 확인</span><strong>' + hm(d.names_ts) + '</strong><em>' + (d.names_ts ? dayLabel(d.names_ts, now) : '아직 기록 없음') + '</em></div>' +
      '<div class="sb-t"><span>다음 재고 갱신</span><strong>' + hm(nq) + '</strong></div>' +
      '<div class="sb-t"><span>다음 이름 확인</span><strong>' + hm(nn) + '</strong></div>' +
      '</div>') : '';

    box.setAttribute('data-s', s);
    box.innerHTML =
      '<div class="sb-top"><span class="sb-pill">' + pill + '</span><span class="sb-state">' + state + '</span></div>' +
      '<div class="sb-rec">' + rec + '</div>' + times +
      '<div class="sb-cron">서버가 이카운트에서 자동으로 받는 시간 (오전 10시~오후 7시, 한국시간): ' +
      '<code>매시 07분</code> 재고 받기 → <code>28분</code> 바뀐 품목 이름 확인 → <code>40분</code> 변동 점검. ' +
      '사이트 자동 반영: ' + applyTxt + '.</div>' +
      '<div class="sb-note">오후 7시 30분 이후나 급한 변동은 수동 버튼(수동 실행 → 15분 뒤 수동 이름 받아오기)을 쓰세요. 재고담당자가 늦게 작업했다면 MD팀에 먼저 알려 주세요.</div>';
  }

  var timer = null;
  function load() {
    var done = false;
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var to = setTimeout(function () { if (!done && ctl) ctl.abort(); }, 10000);
    fetch(API, { method: 'GET', cache: 'no-store', signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.json(); })
      .then(function (d) { done = true; clearTimeout(to); render(d && d.ok ? d : null); })
      .catch(function () { done = true; clearTimeout(to); render(null); });
  }
  render(null); box.querySelector('.sb-pill').textContent = '불러오는 중'; box.querySelector('.sb-state').textContent = '';
  load(); timer = setInterval(load, 60000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) load(); });
})();
