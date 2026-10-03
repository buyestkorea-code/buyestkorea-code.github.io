/* BUYEST 폰 카메라 바코드 스캔 — 오인식 방지 래퍼 (html5-qrcode 위에 얹어 씀)
   2026-10-03: "카메라가 너무 빨리 아무거나 인식한다" 문제 대응.
   원인: 기본 설정은 모든 바코드 종류를 초당 10번 읽고, 한 프레임만 읽혀도 바로 확정함 →
         흐릿한 프레임/배경 무늬가 엉뚱한 숫자로 읽혀도 곧바로 판매·확인으로 들어갔다.
   대책:
     1) 읽을 바코드 종류를 1차원 바코드(+QR)로 제한 (나머지 종류는 오인식 후보에서 제외)
     2) 가운데 가로로 긴 조준 박스 안만 읽음 (배경이 후보로 잡히지 않게)
     3) 같은 값이 연속으로 여러 번, 일정 시간(dwell) 이상 읽혀야 확정
        - 이미 아는 바코드(재고파일에 있음): 2회 + 0.35초   /   모르는 값: 4회 + 0.9초
        - 4글자 미만, 제어문자 포함 값은 무시
     4) 확정 후에는 같은 값 3초, 어떤 값이든 0.7초 동안 다시 안 받음(중복 입력 방지)
     5) 화면 아래에 "인식 중 (n/필요수)" 상태를 보여줘서 지금 뭘 읽고 있는지 알 수 있게 함
     6) 카메라 화면은 가운데 띠(기본 높이 170px)만 보이게 잘라서 작게 표시 — 폰 세로 화면에서 영상 박스가 화면 한가득
        커져서 조회 결과를 보려면 스크롤을 내려야 하던 문제 대응 (조준 박스는 항상 가운데라 잘라도 읽는 영역은 그대로)
   사용법:
     var cam = RobustCameraScan.create({
       elementId: 'camReader',              // html5-qrcode가 영상을 그릴 div id
       isKnown: function(text){ return true/false; },   // 이미 아는 바코드인지(재고파일에 있는지)
       onAccept: function(text){ ... },     // 확정된 값 (여기서 조회/기록)
       onStatus: function(msg, kind){ ... } // kind: 'info' | 'ok' | 'warn' (선택)
     });
     await cam.start();  await cam.stop();  cam.isRunning();
*/
(function (global) {
  'use strict';

  function create(opts) {
    var o = opts || {};
    var needKnown = o.needKnown || 2, dwellKnown = o.dwellKnown || 350;
    var needUnknown = o.needUnknown || 4, dwellUnknown = o.dwellUnknown || 900;
    var windowMs = o.windowMs || 1800, sameCooldownMs = o.sameCooldownMs || 3000, anyCooldownMs = o.anyCooldownMs || 700;
    var minLen = o.minLen || 4;
    var viewportH = o.viewportHeight || 170;    // 화면에 보이는 카메라 띠의 높이(px)
    var viewportEl = null;
    var qr = null, running = false, starting = false;
    var hist = [], acceptedAt = {}, lastAcceptTs = 0, lastStatusTs = 0;

    function status(msg, kind) { if (o.onStatus) { try { o.onStatus(msg, kind || 'info'); } catch (e) {} } }

    function feed(raw) {
      var text = String(raw == null ? '' : raw).trim();
      if (text.length < minLen || /[\u0000-\u001f]/.test(text)) return;   // 너무 짧거나 이상한 문자 → 노이즈
      var now = Date.now();
      if (now - lastAcceptTs < anyCooldownMs) return;
      if (acceptedAt[text] && now - acceptedAt[text] < sameCooldownMs) {
        if (now - lastStatusTs > 800) { status('방금 읽은 바코드예요 (' + text + ')', 'warn'); lastStatusTs = now; }
        return;
      }
      hist = hist.filter(function (h) { return now - h.ts <= windowMs; });
      hist.push({ t: text, ts: now });
      var same = hist.filter(function (h) { return h.t === text; });
      var known = true;
      try { known = o.isKnown ? !!o.isKnown(text) : true; } catch (e) { known = true; }
      var need = known ? needKnown : needUnknown;
      var dwell = known ? dwellKnown : dwellUnknown;
      var span = now - same[0].ts;
      if (same.length >= need && span >= dwell) {
        hist = [];
        acceptedAt[text] = now; lastAcceptTs = now;
        try { if (navigator.vibrate) navigator.vibrate(40); } catch (e) {}
        status('✔ 인식됨: ' + text, 'ok');
        try { o.onAccept && o.onAccept(text, known); } catch (e) { console.error(e); }
        return;
      }
      if (now - lastStatusTs > 150) {
        status('인식 중… ' + text + ' (' + Math.min(same.length, need) + '/' + need + ')' + (known ? '' : ' · 등록 안 된 값이라 더 확실히 읽는 중'), 'info');
        lastStatusTs = now;
      }
    }

    function formatList() {
      var F = global.Html5QrcodeSupportedFormats;
      if (!F) return undefined;
      var list = [F.CODE_128, F.CODE_39, F.CODE_93, F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.ITF, F.CODABAR, F.QR_CODE];
      return list.filter(function (x) { return x !== undefined; });
    }

    async function start() {
      if (running || starting) return;
      if (typeof global.Html5Qrcode === 'undefined') throw new Error('카메라 스캔 라이브러리를 불러오지 못했어요');
      starting = true;
      try {
        hist = []; acceptedAt = {}; lastAcceptTs = 0;
        var cfg = { verbose: false, experimentalFeatures: { useBarCodeDetectorIfSupported: true } };
        var fm = formatList(); if (fm && fm.length) cfg.formatsToSupport = fm;
        mountViewport();
        qr = new global.Html5Qrcode(o.elementId, cfg);
        await qr.start(
          // (해상도 videoConstraints는 일부러 안 넣는다 — 1280x720을 요청하면 폰 세로 화면에서 영상 박스가 아주 길게
          //  잡히고 조준 박스가 영상 밖으로 밀리는 레이아웃 문제가 있었음. 라이브러리 기본 설정이 검증된 동작.)
          { facingMode: 'environment' },
          {
            fps: o.fps || 10,
            // 가운데 가로로 긴 박스만 읽음 — 1차원 바코드에 맞는 모양이고, 배경 오인식을 줄인다.
            // 높이는 화면에 보이는 띠(viewportH) 안에 들어오게 제한
            qrbox: function (vw, vh) {
              return { width: Math.floor(Math.min(vw * 0.9, 420)), height: Math.floor(Math.min(vh * 0.38, 150, viewportH - 24)) };
            }
          },
          function (text) { feed(text); },
          function () { /* 프레임에서 못 읽음 — 정상, 무시 */ }
        );
        running = true;
        var video = document.querySelector('#' + o.elementId + ' video');
        if (video) { video.setAttribute('playsinline', 'true'); video.muted = true; }
        status('바코드를 박스 안에 가만히 비춰주세요', 'info');
      } finally { starting = false; }
    }

    async function stop() {
      if (qr) {
        try { if (running) await qr.stop(); } catch (e) {}
        try { qr.clear(); } catch (e) {}
      }
      qr = null; running = false; hist = [];
      unmountViewport();
    }

    // 카메라 영상이 들어갈 element를 "고정 높이 + 가운데 정렬 + 넘치는 부분 숨김" 박스(viewport)로 감싼다.
    // flex 가운데 정렬이라 영상이 박스보다 커도 위아래가 똑같이 잘려서 가운데 띠가 보인다(조준 박스 위치와 일치).
    function mountViewport() {
      var el = document.getElementById(o.elementId);
      if (!el) return;
      var vp = el.parentNode;
      if (!vp.classList || !vp.classList.contains('rcs-viewport')) {
        vp = document.createElement('div');
        vp.className = 'rcs-viewport';
        el.parentNode.insertBefore(vp, el);
        vp.appendChild(el);
      }
      vp.style.cssText = 'display:flex;align-items:center;justify-content:center;overflow:hidden;width:100%;max-width:480px;margin:0 auto;' +
        'height:' + viewportH + 'px;background:#000;border-radius:10px;';
      el.style.display = 'block'; el.style.width = '100%'; el.style.flex = 'none'; el.style.minHeight = '0';
      viewportEl = vp;
    }
    function unmountViewport() {
      var el = document.getElementById(o.elementId);
      if (el) { el.style.display = ''; el.style.minHeight = ''; }
      if (viewportEl) viewportEl.style.display = 'none';
    }

    return { start: start, stop: stop, isRunning: function () { return running; }, _feed: feed };
  }

  global.RobustCameraScan = { create: create };
})(window);
