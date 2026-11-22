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

    // ---- 안드로이드(갤럭시 등) 초점 보강 (2026-11-23) ----
    // 아이폰은 해상도·초점을 따로 요청하지 않아도 자동초점이 잘 되지만, 안드로이드 크롬은 기본값(640x480, 초점 모드 미지정)으로
    // 열려서 갤럭시에서 흐릿하게 고정되는 경우가 있다(해상도가 낮으면 바코드를 채우려고 폰을 너무 가까이 대야 해서 최소 초점거리 안쪽이 된다).
    // 그래서 안드로이드에서만 ① 1920x1080 요청(안 되면 기기가 가까운 해상도로 맞춤) ② 연속 자동초점 요청을 추가하고,
    // 거절되면 예전 방식(기본값)으로 다시 열며 ③ 확대·손전등·초점 다시 맞추기를 쓸 수 있게 열어 둔다. 아이폰은 기존 동작 그대로.
    var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var track = null, caps = {}, torchOn = false, focusTimer = null;

    function currentTrack() {
      var v = document.querySelector('#' + o.elementId + ' video');
      var s = v && v.srcObject;
      return (s && s.getVideoTracks && s.getVideoTracks()[0]) || null;
    }
    async function tune() {
      track = currentTrack(); torchOn = false;
      if (!track) return;
      try { caps = track.getCapabilities ? track.getCapabilities() : {}; } catch (e) { caps = {}; }
      if (!isIOS && caps.focusMode && caps.focusMode.indexOf('continuous') > -1) {
        try { await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch (e) {}
      }
    }
    async function refocus() {
      if (!track || !caps.focusMode) return false;
      try {
        if (caps.focusMode.indexOf('single-shot') > -1) await track.applyConstraints({ advanced: [{ focusMode: 'single-shot' }] });
        if (caps.focusMode.indexOf('continuous') > -1) {
          clearTimeout(focusTimer);
          focusTimer = setTimeout(function () { try { track && track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch (e) {} }, 900);
        }
        return true;
      } catch (e) { return false; }
    }
    async function setZoom(z) {
      if (!track || !caps.zoom) return false;
      var zz = Math.max(caps.zoom.min || 1, Math.min(caps.zoom.max || 1, z));
      try { await track.applyConstraints({ advanced: [{ zoom: zz }] }); return zz; } catch (e) { return false; }
    }
    async function toggleTorch() {
      if (!track || !caps.torch) return null;
      try { await track.applyConstraints({ advanced: [{ torch: !torchOn }] }); torchOn = !torchOn; return torchOn; } catch (e) { return null; }
    }
    function info() {
      if (!track) return null;
      var st = {}; try { st = track.getSettings ? track.getSettings() : {}; } catch (e) {}
      return { label: track.label || '', width: st.width || 0, height: st.height || 0, focusMode: st.focusMode || '',
               focusModes: caps.focusMode || [], zoom: caps.zoom || null, torch: !!caps.torch, ios: isIOS };
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
        function scanConfig(withAndroidTuning) {
          var c = {
            fps: o.fps || 10,
            // 가운데 가로로 긴 박스만 읽음 — 1차원 바코드에 맞는 모양이고, 배경 오인식을 줄인다.
            // 높이는 화면에 보이는 띠(viewportH) 안에 들어오게 제한
            qrbox: function (vw, vh) {
              return { width: Math.floor(Math.min(vw * 0.9, 420)), height: Math.floor(Math.min(vh * 0.38, 150, viewportH - 24)) };
            }
          };
          // 아이폰: 해상도 videoConstraints를 넣지 않는다(예전에 영상 박스가 길어지는 문제가 있었고, 아이폰은 기본값이 검증된 동작).
          // 안드로이드: 1280x720 + 연속 자동초점 요청. (영상은 고정 높이 띠로 잘라 보여주므로 레이아웃 문제 없음)
          if (withAndroidTuning) c.videoConstraints = { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 }, advanced: [{ focusMode: 'continuous' }] };
          return c;
        }
        var okCb = function (text) { feed(text); };
        var errCb = function () { /* 프레임에서 못 읽음 — 정상, 무시 */ };
        qr = new global.Html5Qrcode(o.elementId, cfg);
        try {
          await qr.start({ facingMode: 'environment' }, scanConfig(!isIOS), okCb, errCb);
        } catch (e1) {
          if (isIOS) throw e1;
          // 안드로이드에서 해상도/초점 요청이 거절되면 예전 방식(기본값)으로 한 번 더 시도
          try { await qr.stop(); } catch (e) {}
          try { qr.clear(); } catch (e) {}
          qr = new global.Html5Qrcode(o.elementId, cfg);
          await qr.start({ facingMode: 'environment' }, scanConfig(false), okCb, errCb);
        }
        running = true;
        var video = document.querySelector('#' + o.elementId + ' video');
        if (video) { video.setAttribute('playsinline', 'true'); video.muted = true; }
        await tune();
        status('바코드를 박스 안에 가만히 비춰주세요', 'info');
      } finally { starting = false; }
    }

    async function stop() {
      if (qr) {
        try { if (running) await qr.stop(); } catch (e) {}
        try { qr.clear(); } catch (e) {}
      }
      qr = null; running = false; hist = [];
      clearTimeout(focusTimer); track = null; caps = {}; torchOn = false;
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

    return { start: start, stop: stop, isRunning: function () { return running; }, _feed: feed,
             info: info, refocus: refocus, setZoom: setZoom, toggleTorch: toggleTorch };
  }

  global.RobustCameraScan = { create: create };
})(window);
