// BUYEST AI 릴스 스튜디오 — 화면 동작 (기획 · 생성 · 타임라인 편집 · 저장 · 내보내기)
(function () {
  "use strict";
  const SE = window.SE, RS = window.RS, BG = window.RSBGM;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const W = SE.W, H = SE.H, FPS = SE.FPS;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const REELS = "https://buyest-reels.buyest.workers.dev", LOOK = "https://buyest-lookbook.buyest.workers.dev";
  const KRW = 1400, KLING_USD_SEC = 0.065, TTS_USD = 0.02;
  const usd = (v) => `$${v.toFixed(2)} (약 ${(Math.round((v * KRW) / 100) * 100).toLocaleString("ko-KR")}원)`;
  const fmt = (s) => { s = Math.max(0, s); const m = Math.floor(s / 60); return `${String(m).padStart(2, "0")}:${(s - m * 60).toFixed(1).padStart(4, "0")}`; };
  const SAFE_TXT = " The product's shape, colors, logos and patterns stay exactly unchanged. No text, captions or watermarks appear.";

  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (k === "class") e.className = v; else if (k === "style") e.style.cssText = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) e.setAttribute(k, v === true ? "" : v);
    }
    kids.flat().forEach((c) => { if (c == null || c === false) return; e.append(c.nodeType ? c : document.createTextNode(c)); });
    return e;
  }

  // ── 상태 ──
  let AUTH = null; try { const a = JSON.parse(localStorage.getItem("buyest.dash.auth") || "null"); if (a && a.id) AUTH = a; } catch (_) {}
  let P = RS.newProject(); const M = {};
  let sel = null, zoom = 36, t = 0, playing = false, RH = null, LH = null;
  let photos = [], board = null, brand = "buyest", genBusy = false;

  function toast(msg, ms) { const el = $("#toast"); el.textContent = msg; el.style.display = "block"; clearTimeout(toast._t); toast._t = setTimeout(() => { el.style.display = "none"; }, ms || 2600); }

  // ── 서버 호출 ──
  async function api(base, path, opts) {
    opts = opts || {};
    if (!AUTH) { const e = new Error("툴키트에 로그인한 뒤 이 화면을 새로고침해 주세요."); e.status = 401; throw e; }
    let r;
    try { r = await fetch(base + path, { method: opts.method || "GET", headers: { "Content-Type": "application/json", "X-Studio-User": encodeURIComponent(AUTH.id), "X-Studio-Pass": encodeURIComponent(AUTH.pass), "X-Studio-Enc": "1", ...(opts.headers || {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined }); }
    catch (_) { const e = new Error("서버에 연결하지 못했습니다"); e.status = 0; throw e; }
    let data = null; try { data = await r.json(); } catch (_) {}
    if (!r.ok) { const e = new Error((data && data.error) || `서버 오류 (${r.status})`); e.status = r.status; throw e; }
    return data;
  }
  async function health(base) { const r = await fetch(base + "/api/health"); return r.json(); }

  // ══════════ 실행 취소 / 다시 ══════════
  const hist = { s: [], i: -1 };
  const snap = () => JSON.stringify(P);
  function updUndo() { $("#bUndo").disabled = hist.i <= 0; $("#bRedo").disabled = hist.i >= hist.s.length - 1; }
  function commit(o) {
    o = o || {};
    const s = snap(); if (hist.s[hist.i] === s) { if (!o.insp) renderInspector(); return; }
    hist.s = hist.s.slice(0, hist.i + 1); hist.s.push(s); if (hist.s.length > 80) hist.s.shift(); hist.i = hist.s.length - 1;
    updUndo(); refreshAll(o.insp); queueSave();
  }
  function restore(i) { hist.i = i; P = JSON.parse(hist.s[i]); if (sel && !find(sel.k, sel.id)) sel = null; updUndo(); refreshAll(); queueSave(); }

  function find(k, id) { return (k === "clip" ? P.clips : k === "text" ? P.texts : P.audio).find((x) => x.id === id) || null; }
  function selected() { return sel ? find(sel.k, sel.id) : null; }
  function select(s) { sel = s; renderTimeline(); renderInspector(); renderFx(); renderSublist(); }

  // ══════════ 미리보기 ══════════
  const cv = $("#cv"), cx = cv.getContext("2d", { alpha: false });
  function draw() { cx.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0); RS.drawFrame(cx, P, t, M); updTime(); updPlayhead(); }
  let drawQ = 0;
  function scheduleDraw() { if (drawQ) return; drawQ = requestAnimationFrame(() => { drawQ = 0; if (!playing) { syncVideos(false); draw(); } }); }
  function syncVideos(isPlaying) {
    const need = RS.neededVideos(P, t, M), ids = new Set(need.map((n) => n.m.id));
    Object.values(M).forEach((m) => { if (m.isVideo && !ids.has(m.id) && !m.el.paused) m.el.pause(); });
    need.forEach((n) => {
      const el = n.m.el;
      if (isPlaying && !n.hold) {
        el.playbackRate = clamp(n.c.speed, 0.25, 4);
        if (el.paused) { el.currentTime = n.time; el.play().catch(() => {}); } else if (Math.abs(el.currentTime - n.time) > 0.35) el.currentTime = n.time;
      } else { if (!el.paused) el.pause(); if (Math.abs(el.currentTime - n.time) > 0.03) el.currentTime = n.time; }
    });
  }
  function hookSeek(m) { if (m.isVideo && !m._h) { m._h = true; m.el.addEventListener("seeked", scheduleDraw); } }

  let pBase = 0, pT0 = 0, pTotal = 0, srcs = [];
  function setPlayIcon() { $("#playIc").innerHTML = playing ? '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>' : '<path d="M7 4v16l13-8z"/>'; }
  async function play() {
    if (playing) return;
    pTotal = RS.projectDur(P); if (!pTotal) { toast("타임라인에 영상이나 사진을 먼저 넣어 주세요."); return; }
    if (t >= pTotal - 0.04) t = 0;
    const a = RS.ac(); try { await a.resume(); } catch (_) {}
    await RS.prepareAudio(P, M);
    playing = true; setPlayIcon(); pT0 = t; pBase = a.currentTime + 0.08;
    srcs = RS.scheduleAll(a, a.destination, P, M, t, pBase);
    loop();
  }
  function loop() {
    if (!playing) return;
    t = clamp(pT0 + (RS.ac().currentTime - pBase), pT0, pTotal);
    syncVideos(true); draw(); keepPlayheadVisible();
    if (t >= pTotal - 0.001) { pause(); return; }
    requestAnimationFrame(loop);
  }
  function pause() {
    if (!playing) return; playing = false; setPlayIcon();
    srcs.forEach((s) => { try { s.stop(); } catch (_) {} }); srcs = [];
    Object.values(M).forEach((m) => { if (m.isVideo && !m.el.paused) m.el.pause(); });
    syncVideos(false); draw();
  }
  function seekTo(x) {
    const was = playing; if (was) pause();
    t = clamp(x, 0, Math.max(RS.projectDur(P), 0.0001)); syncVideos(false); draw(); if (was) play();
  }
  function updTime() { $("#tCur").textContent = fmt(t); $("#tTot").textContent = fmt(RS.projectDur(P)); }

  // ══════════ 타임라인 ══════════
  const LBL = 92;
  const tls = $("#tls"), tlin = $("#tlin");
  let lanes = {}, snapEl = null;
  const ICON = {
    v: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/></svg>',
    t: '<svg viewBox="0 0 24 24"><path d="M5 6V4h14v2M12 4v16M9 20h6"/></svg>',
    a: '<svg viewBox="0 0 24 24"><path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 11v2"/></svg>',
  };
  function packLanes(items) {
    const ends = [], pos = new Map();
    items.slice().sort((a, b) => a.start - b.start).forEach((it) => {
      let k = ends.findIndex((e) => e <= it.start + 1e-4); if (k < 0) { k = ends.length; ends.push(0); }
      ends[k] = it.start + it.dur; pos.set(it.id, k);
    });
    return { pos, n: Math.max(1, ends.length) };
  }
  function renderTimeline() {
    const dur = RS.projectDur(P), total = Math.max(dur + 12, 40), laneW = Math.ceil(total * zoom);
    tlin.innerHTML = ""; lanes = {};
    tlin.style.width = LBL + laneW + "px";
    // 눈금
    const ruler = h("div", { class: "ruler", "data-ruler": "1" });
    const major = zoom >= 90 ? 1 : zoom >= 48 ? 2 : zoom >= 24 ? 5 : 10;
    for (let s = 0; s <= total; s += major / 2) {
      const isM = Math.abs(s / major - Math.round(s / major)) < 1e-6;
      ruler.append(h("div", { class: "tk" + (isM ? "" : " mn"), style: `left:${LBL + s * zoom}px` }, isM ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : ""));
    }
    tlin.append(ruler);
    const rows = [
      { id: "v2", name: "영상 2", ic: ICON.v, type: "clip", track: 1, hh: 52 },
      { id: "v1", name: "영상 1", ic: ICON.v, type: "clip", track: 0, hh: 72 },
      { id: "tx", name: "글자", ic: ICON.t, type: "text", items: P.texts },
      { id: "vo", name: "음성", ic: ICON.a, type: "audio", items: P.audio.filter((a) => a.kind !== "bgm") },
      { id: "bg", name: "BGM", ic: ICON.a, type: "audio", items: P.audio.filter((a) => a.kind === "bgm") },
    ];
    rows.forEach((r) => {
      let items, lp = null, hh = r.hh;
      if (r.type === "clip") items = P.clips.filter((c) => c.track === r.track);
      else { items = r.items; lp = packLanes(items); hh = lp.n * 32 + 8; }
      const lane = h("div", { class: "lane", "data-row": r.id, style: `width:${laneW}px;height:${hh}px` });
      lanes[r.id] = lane;
      items.forEach((it) => lane.append(makeBlock(r, it, lp ? lp.pos.get(it.id) : 0, hh)));
      tlin.append(h("div", { class: "row" }, h("div", { class: "rlabel", style: `height:${hh}px` }, h("span", { html: "" }), r.name), lane));
      const lb = tlin.lastChild.firstChild; lb.firstChild.outerHTML = r.ic;
    });
    snapEl = h("div", { class: "snapline" }); tlin.append(snapEl, h("div", { class: "ph", id: "ph" }));
    updPlayhead();
  }
  function peaksOf(m) { if (!m.peaks && m.buf) m.peaks = RS.peaks(m.buf, 320); return m.peaks; }
  function makeBlock(r, it, lane, rowH) {
    const left = it.start * zoom, width = Math.max(6, it.dur * zoom);
    const isSel = sel && sel.id === it.id;
    const b = h("div", { class: "blk", "data-k": r.type, "data-id": it.id });
    b.style.left = left + "px"; b.style.width = width + "px";
    if (r.type === "clip") {
      const m = M[it.mediaId]; b.style.top = "4px"; b.style.height = rowH - 8 + "px";
      b.classList.add(it.pending ? "pend" : it.ai ? "ai" : m && m.isVideo ? "vid" : "img");
      if (m && m.thumb && !it.pending) { const f = h("div", { class: "film" }); f.style.backgroundImage = `url(${m.thumb})`; b.append(f); }
      if (it.trans && it.trans.type !== "none") b.append(h("div", { class: "trn", style: `width:${Math.min(width, it.trans.dur * zoom)}px` }));
      b.append(h("div", { class: "tx" }, it.pending ? "AI 만드는 중…" : (it.ai ? "AI · " : "") + (it.label && it.ai ? it.label : m ? m.name : "")));
    } else if (r.type === "text") {
      b.style.top = 4 + lane * 32 + "px"; b.style.height = "28px"; b.classList.add("txt"); b.append(h("div", { class: "tx" }, it.text));
    } else {
      b.style.top = 4 + lane * 32 + "px"; b.style.height = "28px"; b.classList.add(it.kind === "bgm" ? "bgm" : "voice");
      const m = M[it.mediaId], pk = m && peaksOf(m);
      if (pk) {
        const c = document.createElement("canvas"); c.width = Math.max(40, Math.round(width)); c.height = 28; const x = c.getContext("2d"); x.fillStyle = "rgba(255,255,255,.55)";
        const total = m.buf.duration, n = pk.length;
        for (let px = 0; px < c.width; px += 2) { const sec = it.in + (px / c.width) * it.dur, idx = clamp(Math.floor((sec / total) * n), 0, n - 1), v = pk[idx] * 12; x.fillRect(px, 14 - v, 1.4, Math.max(1, v * 2)); }
        b.append(c);
      }
      b.append(h("div", { class: "tx" }, it.label || (it.kind === "bgm" ? "BGM" : "음성")));
    }
    if (isSel) b.classList.add("sel");
    b.append(h("div", { class: "hdl l" }), h("div", { class: "hdl r" }));
    return b;
  }
  function updPlayhead() { const ph = $("#ph"); if (ph) ph.style.left = LBL + t * zoom + "px"; }
  function keepPlayheadVisible() { const x = LBL + t * zoom; if (x > tls.scrollLeft + tls.clientWidth - 40) tls.scrollLeft = x - LBL - 60; else if (x < tls.scrollLeft + LBL) tls.scrollLeft = Math.max(0, x - LBL - 60); }

  // 끌기: 이동 · 양끝 줄이기/늘이기 · 눈금자에서 재생 위치 옮기기
  let drag = null;
  const secAt = (e) => (e.clientX - tlin.getBoundingClientRect().left - LBL) / zoom;
  tlin.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    if (e.target.closest(".ruler")) { drag = { scrub: true }; seekTo(secAt(e)); return; }
    const blk = e.target.closest(".blk");
    if (!blk) { if (e.target.closest(".lane")) { select(null); seekTo(secAt(e)); } return; }
    const k = blk.dataset.k, id = blk.dataset.id, it = find(k, id); if (!it) return;
    select({ k, id });
    const rect = blk.getBoundingClientRect(), ox = e.clientX - rect.left;
    drag = { k, id, mode: ox < 9 ? "l" : ox > rect.width - 9 ? "r" : "m", x0: e.clientX, o: JSON.parse(JSON.stringify(it)), moved: false };
    e.preventDefault();
  });
  function snapPts(k, id) {
    const pts = [0, t]; const list = k === "clip" ? P.clips : k === "text" ? P.texts : P.audio;
    list.forEach((x) => { if (x.id !== id) { pts.push(x.start, x.start + x.dur); } }); return pts;
  }
  function snapTo(v, pts) { const th = 8 / zoom; let best = null, bd = th; pts.forEach((p) => { const d = Math.abs(p - v); if (d < bd) { bd = d; best = p; } }); return best; }
  document.addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (drag.scrub) { seekTo(secAt(e)); return; }
    const it = find(drag.k, drag.id); if (!it) return;
    const dt = (e.clientX - drag.x0) / zoom; if (Math.abs(e.clientX - drag.x0) > 2) drag.moved = true; if (!drag.moved) return;
    const o = drag.o, pts = snapPts(drag.k, drag.id); let sx = null;
    const m = drag.k !== "text" ? M[it.mediaId] : null;
    if (drag.mode === "m") {
      let s = Math.max(0, o.start + dt), a = snapTo(s, pts), b2 = snapTo(s + o.dur, pts);
      if (a != null && (b2 == null || Math.abs(a - s) <= Math.abs(b2 - s - o.dur))) { s = a; sx = a; } else if (b2 != null) { s = b2 - o.dur; sx = b2; }
      it.start = Math.max(0, s);
      if (drag.k === "clip") { const el = document.elementFromPoint(e.clientX, e.clientY), ln = el && el.closest && el.closest(".lane"); if (ln && (ln.dataset.row === "v1" || ln.dataset.row === "v2")) it.track = ln.dataset.row === "v2" ? 1 : 0; if (it.track === 1 && it.layout === "full" && !o.moved1) { it.layout = "pip"; it.pw = 0.5; it.x = 0.2; it.y = 0.25; o.moved1 = true; } }
    } else if (drag.mode === "l") {
      let ns = clamp(o.start + dt, 0, o.start + o.dur - 0.3), a = snapTo(ns, pts); if (a != null) { ns = clamp(a, 0, o.start + o.dur - 0.3); sx = ns; }
      let d = ns - o.start;
      if (drag.k !== "text" && (m && (m.isVideo || m.kind === "audio") || drag.k === "audio")) { const sp = drag.k === "clip" ? o.speed : 1; if (o.in + d * sp < 0) d = -o.in / sp; it.in = o.in + d * sp; }
      it.start = o.start + d; it.dur = o.dur - d;
    } else {
      let nd = Math.max(0.3, o.dur + dt), a = snapTo(o.start + nd, pts); if (a != null && a - o.start >= 0.3) { nd = a - o.start; sx = a; }
      if (drag.k !== "text" && m && (m.isVideo || m.kind === "audio") && m.dur) { const sp = drag.k === "clip" ? o.speed : 1, mx = (m.dur - o.in) / sp; if (!it.ai && nd > mx + 0.05 && !it.pending) nd = Math.max(0.3, mx); }
      it.dur = nd;
    }
    if (snapEl) { snapEl.style.display = sx != null ? "block" : "none"; if (sx != null) snapEl.style.left = LBL + sx * zoom + "px"; }
    renderTimeline(); scheduleDraw(); updTime();
  });
  document.addEventListener("pointerup", () => {
    if (!drag) return; const d = drag; drag = null; if (snapEl) snapEl.style.display = "none";
    if (!d.scrub && d.moved) commit();
  });

  // 자르기 · 복제 · 삭제 · 빈틈 붙이기
  function splitAt(it, k, at) {
    const rel = at - it.start; if (rel < 0.15 || rel > it.dur - 0.15) { toast("자를 위치가 너무 끝에 있습니다."); return null; }
    const b = JSON.parse(JSON.stringify(it)); b.id = RS.uid(); b.start = at; b.dur = it.dur - rel;
    if (k === "clip") { b.in = it.in + rel * it.speed; b.trans = { type: "none", dur: 0.5 }; b.pending = false; }
    else if (k === "audio") { b.in = it.in + rel; b.fadeIn = 0; it.fadeOut = 0; }
    it.dur = rel; (k === "clip" ? P.clips : k === "text" ? P.texts : P.audio).push(b); return b;
  }
  function doSplit() {
    let it = selected(), k = sel && sel.k;
    if (!it || t <= it.start || t >= it.start + it.dur) { const c = RS.activeClips(P, t).filter((x) => x.track === 0)[0]; if (c) { it = c; k = "clip"; } }
    if (!it) { toast("자를 컷을 고르거나, 재생 위치를 컷 위에 놓아 주세요."); return; }
    const b = splitAt(it, k, t); if (b) { sel = { k, id: b.id }; commit(); }
  }
  function doDup() {
    const it = selected(); if (!it) return; const b = JSON.parse(JSON.stringify(it)); b.id = RS.uid(); b.start = it.start + it.dur;
    (sel.k === "clip" ? P.clips : sel.k === "text" ? P.texts : P.audio).push(b); sel = { k: sel.k, id: b.id }; commit();
  }
  function doDel() {
    const it = selected(); if (!it) return;
    if (sel.k === "clip") { P.clips = P.clips.filter((x) => x.id !== it.id); if ($("#ripple").checked && it.track === 0) P.clips.forEach((c) => { if (c.track === 0 && c.start >= it.start + it.dur - 0.01) c.start = Math.max(0, c.start - it.dur); }); }
    else if (sel.k === "text") P.texts = P.texts.filter((x) => x.id !== it.id); else P.audio = P.audio.filter((x) => x.id !== it.id);
    sel = null; commit();
  }
  function doMagnet() {
    const v1 = P.clips.filter((c) => c.track === 0).sort((a, b) => a.start - b.start); let cur = 0;
    v1.forEach((c) => { c.start = cur; cur += c.dur; }); commit(); toast("영상 1 트랙의 빈틈을 붙였습니다.");
  }

  // ══════════ 인스펙터 ══════════
  function slider(label, obj, key, min, max, step, show, opt) {
    opt = opt || {};
    const val = h("span", {}, show(obj[key]));
    const inp = h("input", { type: "range", min, max, step, value: obj[key] });
    inp.addEventListener("input", () => { obj[key] = Number(inp.value); val.textContent = show(obj[key]); if (opt.live) opt.live(); scheduleDraw(); if (opt.tl) renderTimeline(); });
    inp.addEventListener("change", () => commit({ insp: false }));
    return h("div", { class: "ctl" }, h("div", { class: "l" }, h("span", {}, label), val), inp);
  }
  function numField(label, obj, key, min, max, step) {
    const inp = h("input", { type: "number", min, max, step, value: Number(obj[key]).toFixed(2) });
    inp.addEventListener("change", () => { let v = Number(inp.value); if (!isFinite(v)) return; obj[key] = clamp(v, min, max); inp.value = obj[key].toFixed(2); commit({ insp: false }); });
    return h("div", { class: "ctl" }, h("div", { class: "l" }, h("span", {}, label)), inp);
  }
  function selectField(label, obj, key, opts, after) {
    const s = h("select", {}, opts.map((o) => h("option", { value: o.id, selected: String(obj[key]) === String(o.id) }, o.name)));
    s.addEventListener("change", () => { obj[key] = s.value; if (after) after(); commit({ insp: !!after }); });
    return h("div", { class: "ctl" }, h("div", { class: "l" }, h("span", {}, label)), s);
  }
  const pct = (v) => Math.round(v * 100) + "%", sec2 = (v) => v.toFixed(2) + "초";
  function renderInspector() {
    const box = $("#insp"); box.innerHTML = ""; const it = selected();
    if (!it) {
      const dur = RS.projectDur(P);
      box.append(h("h2", {}, "속성"), h("div", { class: "empty" }, `타임라인에서 컷·글자·소리를 누르면 여기서 고칠 수 있어요.`,
        h("br"), h("br"), `전체 길이 ${fmt(dur)} · 컷 ${P.clips.length}개 · 글자 ${P.texts.length}개`, h("br"), h("br"),
        h("span", { class: "hint" }, "단축키: Space 재생 · S 자르기 · Delete 삭제 · Ctrl+Z 되돌리기 · Ctrl+D 복제 · ←/→ 0.1초 이동")));
      return;
    }
    if (sel.k === "clip") {
      const m = M[it.mediaId];
      box.append(h("h2", {}, "컷", h("i", {}, it.ai ? "AI 영상" : m && m.isVideo ? "영상" : "사진")));
      box.append(numField("길이 (초)", it, "dur", 0.3, 120, 0.1));
      if (m && m.isVideo) box.append(slider("속도", it, "speed", 0.25, 4, 0.05, (v) => v.toFixed(2) + "배", { live: () => {} }));
      box.append(h("div", { class: "sec" }, "화면"));
      box.append(selectField("배치", it, "layout", [{ id: "full", name: "전체 화면" }, { id: "pip", name: "작은 화면 (영상 위에 겹침)" }], () => {}));
      box.append(slider("확대", it, "zoom", 0.4, 3, 0.01, (v) => v.toFixed(2) + "배"));
      if (it.layout === "pip") box.append(slider("작은 화면 크기", it, "pw", 0.2, 1, 0.01, pct));
      box.append(slider("가로 위치", it, "x", -0.5, 0.5, 0.005, pct), slider("세로 위치", it, "y", -0.5, 0.5, 0.005, pct), slider("회전", it, "rot", -180, 180, 1, (v) => v + "°"), slider("불투명도", it, "opacity", 0, 1, 0.01, pct));
      box.append(selectField("사진 움직임", it, "kb", RS.KENBURNS, () => {}));
      box.append(h("div", { class: "sec" }, "색감"));
      box.append(selectField("필터", it, "filter", RS.FILTERS, () => {}), slider("밝기", it, "bright", 0.4, 1.8, 0.01, pct), slider("대비", it, "contrast", 0.4, 1.8, 0.01, pct), slider("채도", it, "sat", 0, 2.5, 0.01, pct));
      box.append(h("div", { class: "sec" }, "들어오는 전환"));
      const tr = it.trans || (it.trans = { type: "none", dur: 0.5 });
      box.append(selectField("종류", tr, "type", RS.TRANSITIONS, () => {}), slider("길이", tr, "dur", 0.2, 1.5, 0.05, sec2, { tl: true }));
      if (m && m.isVideo) { box.append(h("div", { class: "sec" }, "소리")); box.append(slider("영상 소리 볼륨", it, "vol", 0, 1.5, 0.01, pct)); }
      if (it.ai) {
        box.append(h("div", { class: "sec" }, "AI 영상"));
        const ta = h("textarea", { rows: 4 }); ta.value = it.label || "";
        ta.addEventListener("input", () => { it.label = ta.value; }); ta.addEventListener("change", () => commit({ insp: false }));
        box.append(h("label", { class: "f" }, "움직임 프롬프트 (영어)"), ta, h("button", { class: "btn full", style: "margin-top:8px", onclick: () => regenClip(it) }, "이 컷만 다시 만들기"));
      }
    } else if (sel.k === "text") {
      box.append(h("h2", {}, "글자", h("i", {}, "자막·제목")));
      const ta = h("textarea", { rows: 3 }); ta.value = it.text;
      ta.addEventListener("input", () => { it.text = ta.value; scheduleDraw(); }); ta.addEventListener("change", () => commit({ insp: false }));
      box.append(h("label", { class: "f", style: "margin-top:0" }, "내용"), ta);
      box.append(selectField("모양", it, "style", RS.TEXT_STYLES, () => {}), selectField("나타나는 방식", it, "anim", RS.TEXT_ANIMS, () => {}));
      box.append(slider("크기", it, "size", 24, 180, 1, (v) => v + "px"), selectField("굵기", it, "weight", [{ id: 400, name: "보통" }, { id: 700, name: "굵게" }, { id: 800, name: "아주 굵게" }], () => {}));
      const col = h("input", { type: "color", value: it.color || "#ffffff" });
      col.addEventListener("input", () => { it.color = col.value; scheduleDraw(); }); col.addEventListener("change", () => commit({ insp: false }));
      box.append(h("div", { class: "ctl" }, h("div", { class: "l" }, h("span", {}, "글자 색")), h("div", { style: "display:flex;gap:8px;align-items:center" }, col, h("button", { class: "btn sm", onclick: () => { it.color = ""; commit({ insp: true }); } }, "모양 기본색"))));
      box.append(slider("가로 위치", it, "x", 0, 1, 0.005, pct), slider("세로 위치", it, "y", 0, 1, 0.005, pct), slider("줄바꿈 폭", it, "w", 0.3, 1, 0.01, pct));
      box.append(numField("시작 (초)", it, "start", 0, 600, 0.1), numField("길이 (초)", it, "dur", 0.3, 120, 0.1));
    } else {
      box.append(h("h2", {}, it.kind === "bgm" ? "배경음악" : "음성"));
      box.append(slider("볼륨", it, "vol", 0, 2, 0.01, pct), slider("서서히 커짐", it, "fadeIn", 0, 6, 0.1, sec2), slider("서서히 작아짐", it, "fadeOut", 0, 6, 0.1, sec2));
      box.append(numField("시작 (초)", it, "start", 0, 600, 0.1), numField("길이 (초)", it, "dur", 0.3, 300, 0.1));
      if (it.kind === "voice" && it.text) {
        const ta = h("textarea", { rows: 4 }); ta.value = it.text;
        ta.addEventListener("input", () => { it.text = ta.value; }); ta.addEventListener("change", () => commit({ insp: false }));
        box.append(h("div", { class: "sec" }, "읽는 문장"), ta, h("button", { class: "btn full", style: "margin-top:8px", onclick: () => reVoice(it) }, "고친 문장으로 다시 읽기 (자막도 다시 맞춤)"));
      }
    }
    box.append(h("div", { class: "sec" }, "편집"), h("div", { style: "display:flex;gap:6px;flex-wrap:wrap" },
      h("button", { class: "btn sm", onclick: doSplit }, "✂ 재생 위치에서 자르기"), h("button", { class: "btn sm", onclick: doDup }, "복제"), h("button", { class: "btn sm", onclick: doDel }, "삭제")));
  }

  // ══════════ 왼쪽 패널 ══════════
  $("#rail").addEventListener("click", (e) => { const b = e.target.closest("button[data-tab]"); if (!b) return; $$("#rail button").forEach((x) => x.classList.toggle("on", x === b)); $$("#panel [data-panel]").forEach((s) => s.classList.toggle("on", s.dataset.panel === b.dataset.tab)); });
  $("#brandSeg").addEventListener("click", (e) => { const b = e.target.closest("button[data-b]"); if (!b) return; brand = b.dataset.b; P.brand = brand; $$("#brandSeg button").forEach((x) => x.classList.toggle("on", x === b)); scheduleDraw(); });

  // 사진 올리기 (최대 10장)
  async function addPhotos(files) {
    for (const f of files) {
      if (photos.length >= 10) { toast("사진은 최대 10장입니다."); break; }
      if (!/^image\//.test(f.type)) continue;
      try { const m = await RS.addMedia(M, f, f.name, "image"); photos.push(m.id); } catch (e) { toast("사진을 읽지 못했습니다: " + f.name); }
    }
    renderPhotos(); renderLib();
  }
  function renderPhotos() {
    const box = $("#photos"); box.innerHTML = ""; $("#photoCnt").textContent = photos.length + " / 10";
    photos.forEach((id, i) => {
      const m = M[id]; if (!m) return;
      const d = h("div", { class: "th" }, h("img", { src: m.url, alt: "" }), h("b", {}, i + 1), h("button", { title: "빼기", onclick: () => { photos.splice(i, 1); renderPhotos(); } }, "✕"));
      box.append(d);
    });
  }
  const drop = $("#drop");
  drop.addEventListener("click", () => $("#photoFile").click());
  $("#photoFile").addEventListener("change", (e) => { addPhotos([...e.target.files]); e.target.value = ""; });
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => addPhotos([...(e.dataTransfer.files || [])]));

  // 스토리보드
  function localBoard(target) {
    const n = photos.length, per = Math.max(4, Math.round(target / Math.max(4, n + 1)));
    const feats = $("#features").value.split("\n").map((x) => x.trim()).filter(Boolean), nm = ($("#brandName").value + " " + $("#productName").value).trim();
    const pr = $("#prompt").value.trim();
    const cuts = [{ role: "hook", sec: 4, photo: 0, mode: "ai", motion: "Slow cinematic push-in with soft drifting light and gentle natural motion.", narration: pr ? pr.split(/[.!?\n]/)[0].slice(0, 40) : (nm || "이 상품 보셨나요?"), caption: "" }];
    for (let i = 0; i < n; i++) cuts.push({ role: i === 0 ? "intro" : "detail", sec: per, photo: i, mode: i % 2 ? "photo" : "ai", motion: "The camera slowly orbits while the fabric sways gently in a light breeze.", narration: feats[i] || (i === 0 ? nm : ""), caption: feats[i] ? feats[i].slice(0, 16) : "" });
    cuts.push({ role: "cta", sec: 4, photo: n - 1, mode: "photo", motion: "", narration: $("#cta").value.trim() || "궁금한 점은 댓글로 남겨 주세요.", caption: $("#price").value.trim() });
    return { hook: nm.slice(0, 18), mood: "bright", cuts };
  }
  async function makeBoard() {
    if (!photos.length) { toast("사진을 먼저 올려 주세요."); return; }
    const prompt = $("#prompt").value.trim(); if (!prompt) { toast("릴스 프롬프트를 적어 주세요."); return; }
    const btn = $("#bBoard"), msg = $("#boardMsg"); btn.disabled = true; msg.textContent = "AI가 컷을 짜는 중…"; msg.className = "hint";
    const target = Number($("#targetSec").value);
    try {
      const images = []; for (const id of photos.slice(0, 6)) images.push(await smallJpegUrl(M[id], 512));
      const d = await api(LOOK, "/api/storyboard", { method: "POST", body: { prompt, brand, brandName: $("#brandName").value.trim(), targetSec: target, photoCount: photos.length, images, product: { name: $("#productName").value.trim(), price: $("#price").value.trim(), features: $("#features").value.trim(), cta: $("#cta").value.trim() } } });
      board = d.board; msg.textContent = `컷 ${board.cuts.length}개를 짰어요 (${d.provider}). 아래에서 마음대로 고치세요.`;
    } catch (e) {
      board = localBoard(target); msg.textContent = `AI 기획을 쓰지 못해 기본 구성으로 만들었어요 (${e.message}). 아래에서 직접 고치세요.`; msg.className = "hint warn";
    }
    if (board.mood) $("#bgmMood").value = board.mood;
    btn.disabled = false; renderBoard();
  }
  async function smallJpegUrl(m, max) {
    const el = m.el, s = Math.min(1, max / Math.max(el.width, el.height)), c = document.createElement("canvas"); c.width = Math.round(el.width * s); c.height = Math.round(el.height * s);
    c.getContext("2d").drawImage(el, 0, 0, c.width, c.height); return c.toDataURL("image/jpeg", 0.8);
  }
  const ROLE_KO = { hook: "훅", intro: "소개", detail: "디테일", style: "스타일링", proof: "근거", cta: "마무리" };
  function renderBoard() {
    $("#boardBox").style.display = board ? "block" : "none"; if (!board) return;
    $("#hookText").value = board.hook || "";
    const box = $("#cuts"); box.innerHTML = "";
    board.cuts.forEach((c, i) => {
      const m = M[photos[clamp(c.photo, 0, photos.length - 1)]];
      const sel2 = h("select", {}, photos.map((_, k) => h("option", { value: k, selected: k === c.photo }, `사진 ${k + 1}`)));
      sel2.addEventListener("change", () => { c.photo = Number(sel2.value); renderBoard(); });
      const mode = h("select", {}, h("option", { value: "ai", selected: c.mode === "ai" }, "AI 영상"), h("option", { value: "photo", selected: c.mode === "photo" }, "사진 효과"));
      mode.addEventListener("change", () => { c.mode = mode.value; renderBoard(); });
      const sec = h("input", { type: "number", min: 3, max: 30, step: 1, value: c.sec }); sec.addEventListener("change", () => { c.sec = clamp(Number(sec.value) || 5, 3, 30); updCost(); });
      const mo = h("textarea", { rows: 2, placeholder: "움직임 (영어)" }); mo.value = c.motion; mo.addEventListener("input", () => { c.motion = mo.value; });
      const na = h("textarea", { rows: 2, placeholder: "나레이션 (한국어, 비우면 소리 없음)" }); na.value = c.narration; na.addEventListener("input", () => { c.narration = na.value; });
      const ca = h("input", { placeholder: "화면 자막 (짧게)", value: c.caption }); ca.addEventListener("input", () => { c.caption = ca.value; });
      box.append(h("div", { class: "cut " + (c.mode === "photo" ? "photo" : "") },
        h("div", { class: "hd" }, h("span", { class: "no" }, String(i + 1).padStart(2, "0")), h("span", { class: "role" }, ROLE_KO[c.role] || c.role), h("span", { class: "sp" }),
          h("button", { class: "mini", title: "위로", onclick: () => { if (i > 0) { [board.cuts[i - 1], board.cuts[i]] = [board.cuts[i], board.cuts[i - 1]]; renderBoard(); } } }, "▲"),
          h("button", { class: "mini", title: "아래로", onclick: () => { if (i < board.cuts.length - 1) { [board.cuts[i + 1], board.cuts[i]] = [board.cuts[i], board.cuts[i + 1]]; renderBoard(); } } }, "▼"),
          h("button", { class: "mini", title: "컷 지우기", onclick: () => { board.cuts.splice(i, 1); renderBoard(); } }, "✕")),
        h("div", { class: "body" }, m ? h("img", { src: m.url, alt: "" }) : h("div"),
          h("div", {}, h("div", { class: "line" }, sel2, mode, sec, h("span", { class: "hint" }, "초")), c.mode === "ai" ? mo : null, na, ca))));
    });
    updCost();
  }
  $("#hookText").addEventListener("input", () => { if (board) board.hook = $("#hookText").value; });
  $("#bAddCut").addEventListener("click", () => { if (!board) return; board.cuts.splice(Math.max(0, board.cuts.length - 1), 0, { role: "detail", sec: 6, photo: 0, mode: "photo", motion: "Slow cinematic push-in.", narration: "", caption: "" }); renderBoard(); });
  $("#bBoard").addEventListener("click", makeBoard);
  const aiReady = () => !!(AUTH && RH && RH.higgsfield) && !$("#dry").checked;
  function plan() {
    if (!board) return { aiSec: 0, aiN: 0, voices: 0, total: 0 };
    let aiSec = 0, aiN = 0, voices = 0, total = 0;
    board.cuts.forEach((c) => { const v = c.narration.trim() ? Math.ceil(c.narration.length / 4.2) : 0; const dur = Math.max(c.sec, v ? v + 0.6 : 0); total += dur; if (c.mode === "ai" && aiReady()) { aiSec += clamp(Math.ceil(dur), 3, 15); aiN++; } if (c.narration.trim()) voices++; });
    return { aiSec, aiN, voices, total };
  }
  function updCost() {
    if (!board) return; const p = plan(), cost = p.aiSec * KLING_USD_SEC + (AUTH ? p.voices * TTS_USD : 0);
    $("#boardSum").textContent = `약 ${Math.round(p.total)}초 · 컷 ${board.cuts.length}개`;
    $("#costLine").innerHTML = aiReady() ? `AI 영상 ${p.aiN}컷 (${p.aiSec}초) · 나레이션 ${p.voices}컷 → 예상 <b>${usd(cost)}</b>` : (AUTH ? `AI 영상은 만들지 않습니다 (무료 테스트). 사진 효과 + 나레이션 약 ${usd(p.voices * TTS_USD)}` : `로그인하지 않아 AI·음성은 쓸 수 없고, 사진 효과로만 만들어집니다.`);
  }
  $("#dry").addEventListener("change", updCost);

  // ── 영상 만들기 (음성 → 타임라인 → AI 클립 → BGM) ──
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const STATE_KO = { queued: "대기 중", in_progress: "AI가 만드는 중", completed: "완료", failed: "실패", nsfw: "내용 검수에서 거절됨", canceled: "취소됨" };
  async function toJpegBlob(m) {
    const el = m.el, s = Math.min(1, 2048 / Math.max(el.width, el.height)), c = document.createElement("canvas"); c.width = Math.round(el.width * s); c.height = Math.round(el.height * s);
    c.getContext("2d").drawImage(el, 0, 0, c.width, c.height);
    return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("사진 변환 실패"))), "image/jpeg", 0.92));
  }
  async function makeClipBlob(photoId, motion, seconds, report, signal) {
    report("사진 올리는 중");
    const blob = await toJpegBlob(M[photoId]);
    const u = await api(REELS, "/api/upload-url", { method: "POST", body: { content_type: "image/jpeg" } });
    let r; try { r = await fetch(u.upload_url, { method: "PUT", headers: u.upload_headers || { "Content-Type": "image/jpeg" }, body: blob, credentials: "omit" }); } catch (_) { throw new Error("사진 업로드 실패 (네트워크)"); }
    if (!r.ok) throw new Error(`사진 업로드 실패 (${r.status})`);
    const key = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random();
    const g = await api(REELS, "/api/generate", { method: "POST", body: { model: "kling3", image: u.public_url, prompt: (motion || "Slow cinematic push-in with gentle natural motion.") + SAFE_TXT, duration: clamp(Math.ceil(seconds), 3, 15) }, headers: { "Idempotency-Key": key } });
    const t0 = Date.now(); let st = { status: g.status };
    while (Date.now() - t0 < 15 * 60 * 1000) {
      if (signal && signal.aborted) throw new Error("멈췄습니다 (이미 시작된 영상은 요금이 나갈 수 있습니다)");
      await sleep(5000);
      try { st = await api(REELS, "/api/status?id=" + encodeURIComponent(g.request_id)); } catch (e) { if (e.status === 401 || e.status === 503) throw e; }
      report(`${STATE_KO[st.status] || st.status} · ${Math.round((Date.now() - t0) / 1000)}초`);
      if (["completed", "failed", "nsfw", "canceled"].includes(st.status)) break;
    }
    if (st.status !== "completed" || !st.video_url) throw new Error(`${STATE_KO[st.status] || st.status}${st.error ? " " + st.error : ""}`);
    const v = await fetch(st.video_url); if (!v.ok) throw new Error("영상을 내려받지 못했습니다");
    return { blob: await v.blob(), usd: g.estimate_usd };
  }
  async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } })); }
  async function makeVoice(text, voice) {
    const d = await api(LOOK, "/api/tts", { method: "POST", body: { text, voice } });
    const blob = await (await fetch(d.audio)).blob(); return { blob, provider: d.provider };
  }
  function bufToWav(buf) {
    const ch = Math.min(2, buf.numberOfChannels), n = buf.length, out = new DataView(new ArrayBuffer(44 + n * ch * 2));
    const wr = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
    wr(0, "RIFF"); out.setUint32(4, 36 + n * ch * 2, true); wr(8, "WAVEfmt "); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
    out.setUint32(24, buf.sampleRate, true); out.setUint32(28, buf.sampleRate * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); wr(36, "data"); out.setUint32(40, n * ch * 2, true);
    const d = []; for (let c = 0; c < ch; c++) d.push(buf.getChannelData(c)); let o = 44;
    for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const v = clamp(d[c][i], -1, 1); out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
    return new Blob([out.buffer], { type: "audio/wav" });
  }
  const KB_CYCLE = ["in", "out", "left", "right"];
  let genAbort = null;
  async function generate() {
    if (genBusy || !board) return;
    if (!photos.length) { toast("사진을 먼저 올려 주세요."); return; }
    if (!SE.supported()) { alert("이 브라우저는 영상 만들기를 지원하지 않습니다. 최신 Chrome·Edge 로 열어 주세요."); return; }
    const p = plan(), ai = aiReady(), voiceOn = !!AUTH && p.voices > 0, cost = p.aiSec * KLING_USD_SEC + (voiceOn ? p.voices * TTS_USD : 0);
    if (P.clips.length && !confirm("지금 타임라인에 있는 편집 내용이 새로 만든 릴스로 바뀝니다. 계속할까요?")) return;
    if (ai && !confirm(`릴스 1편을 만듭니다.\n\nAI 영상 ${p.aiN}컷 (${p.aiSec}초) · 나레이션 ${p.voices}컷\n예상 금액 ${usd(cost)}\n\n보통 3~10분 걸리고, 실패한 AI 영상은 과금되지 않습니다.\n계속할까요?`)) return;
    genBusy = true; $("#bGen").disabled = true; $("#bBoard").disabled = true; genAbort = new AbortController();
    const prog = $("#prog"), lines = {}, notes = []; let spent = 0;
    const paint = (head, pct) => { prog.innerHTML = `<b>${esc(head)}</b><div class="bar"><i style="width:${pct || 0}%"></i></div>` + Object.keys(lines).map((k) => `<div>${esc(k)} ${esc(lines[k])}</div>`).join("") + (notes.length ? `<div class="warn">${notes.map(esc).join("<br>")}</div>` : "") + (ai ? `<button class="btn sm" id="bStop" style="margin-top:6px">기다리기 멈추기</button>` : ""); const s = $("#bStop"); if (s) s.onclick = () => genAbort.abort(); };
    try {
      pause(); await SE.ensureFonts(board.cuts.map((c) => c.narration + c.caption).join(" ") + board.hook);
      // 1) 나레이션
      const voices = []; paint("나레이션 만드는 중", 3);
      if (voiceOn) {
        const voiceName = $("#voice").value; let done = 0;
        await pool(board.cuts.map((c, i) => ({ c, i })).filter((x) => x.c.narration.trim()), 3, async (x) => {
          try { const v = await makeVoice(x.c.narration.trim(), voiceName); const m = await RS.addMedia(M, v.blob, `나레이션 ${x.i + 1}.wav`, "audio"); voices[x.i] = m; spent += TTS_USD; }
          catch (e) { notes.push(`컷 ${x.i + 1} 나레이션 실패: ${e.message}`); }
          done++; paint("나레이션 만드는 중", 3 + (done / p.voices) * 15);
        });
      }
      // 2) 타임라인에 컷 배치 (AI 컷은 자리표시 먼저)
      paint("타임라인 만드는 중", 20);
      const np = RS.newProject(); np.id = P.id; np.name = $("#pname").value || "새 릴스"; np.brand = brand; np.brandName = $("#brandName").value.trim(); np.settings = P.settings; P = np; sel = null;
      let cur = 0; const jobs = [];
      board.cuts.forEach((c, i) => {
        const vm = voices[i], vd = vm ? vm.dur : 0, dur = Math.max(c.sec, vd ? vd + 0.6 : 0), pid = photos[clamp(c.photo, 0, photos.length - 1)];
        const aiThis = ai && c.mode === "ai";
        const clip = RS.newClip({ track: 0, mediaId: pid, start: cur, dur, kb: aiThis ? "none" : KB_CYCLE[i % 4], pending: aiThis, ai: aiThis, label: c.motion, srcPhoto: pid, trans: i > 0 ? { type: "fade", dur: 0.35 } : { type: "none", dur: 0.5 } });
        P.clips.push(clip); if (aiThis) jobs.push({ clip, i, c });
        if (vm) {
          P.audio.push(RS.newAudio({ kind: "voice", mediaId: vm.id, start: cur + 0.15, dur: vd, vol: 1, label: `나레이션 ${i + 1}`, text: c.narration.trim() }));
          RS.subtitleTimes(c.narration.trim(), cur + 0.15, vd).forEach((s) => P.texts.push(RS.newText({ text: s.text, start: s.start, dur: s.dur, style: "stroke", size: 66, y: 0.74, anim: "fade", sub: true })));
        } else if (c.narration.trim()) {
          RS.subtitleTimes(c.narration.trim(), cur + 0.2, Math.max(2, dur - 0.5)).forEach((s) => P.texts.push(RS.newText({ text: s.text, start: s.start, dur: s.dur, style: "stroke", size: 66, y: 0.74, anim: "fade", sub: true })));
        }
        if (c.caption.trim()) P.texts.push(RS.newText({ text: c.caption.trim(), start: cur + 0.25, dur: Math.max(1.5, Math.min(dur - 0.5, 3.4)), style: "box", size: 54, y: 0.2, anim: "rise" }));
        if (i === 0 && board.hook.trim()) P.texts.push(RS.newText({ text: board.hook.trim(), start: 0.2, dur: Math.max(1.6, Math.min(dur - 0.4, 2.8)), style: "stroke", size: 92, y: 0.4, anim: "pop" }));
        cur += dur;
      });
      const total = cur; hist.s = []; hist.i = -1; commit(); t = 0; draw();
      // 3) BGM
      paint("배경음악 만드는 중", 25);
      try {
        const buf = await BG.render($("#bgmMood").value, total + 1), bm = await RS.addMedia(M, bufToWav(buf), "BGM " + (BG.PRESETS.find((x) => x.id === $("#bgmMood").value) || {}).name + ".wav", "audio");
        P.audio.push(RS.newAudio({ kind: "bgm", mediaId: bm.id, start: 0, dur: total, vol: voiceOn ? 0.22 : 0.4, fadeIn: 0.6, fadeOut: 2.5, label: "BGM" }));
      } catch (e) { notes.push("배경음악을 만들지 못했습니다: " + e.message); }
      commit();
      // 4) AI 클립 (동시 3개)
      if (jobs.length) {
        let stopAll = false, doneN = 0;
        await pool(jobs, 3, async (j) => {
          const key = `컷 ${j.i + 1}`;
          if (stopAll) { lines[key] = "건너뜀 → 사진 효과"; j.clip.pending = false; j.clip.ai = false; j.clip.kb = KB_CYCLE[j.i % 4]; return; }
          try {
            const res = await makeClipBlob(j.clip.srcPhoto, j.c.motion, j.clip.dur, (s) => { lines[key] = s; paint("AI 영상 만드는 중", 28 + (doneN / jobs.length) * 70); }, genAbort.signal);
            const m = await RS.addMedia(M, res.blob, `AI 컷 ${j.i + 1}.mp4`, "video"); hookSeek(m);
            j.clip.mediaId = m.id; j.clip.pending = false; j.clip.in = 0; j.clip.speed = m.dur && m.dur < j.clip.dur && m.dur / j.clip.dur >= 0.85 ? m.dur / j.clip.dur : 1; j.clip.kb = "none"; j.clip.vol = 0;
            spent += res.usd || j.clip.dur * KLING_USD_SEC; lines[key] = "완료 ✓";
          } catch (e) {
            lines[key] = "실패 → 사진 효과로 대신합니다 (" + (e.message || e) + ")"; j.clip.pending = false; j.clip.ai = false; j.clip.kb = KB_CYCLE[j.i % 4]; notes.push(`컷 ${j.i + 1}의 AI 영상이 실패해 사진으로 대신했습니다.`);
            if (e.status === 402 || /잔액/.test(e.message)) { stopAll = true; notes.push("Higgsfield 잔액이 부족합니다. 콘솔에서 충전해 주세요."); }
            if (genAbort.signal.aborted) stopAll = true;
          }
          doneN++; renderTimeline(); scheduleDraw(); paint("AI 영상 만드는 중", 28 + (doneN / jobs.length) * 70);
        });
      }
      if (spent) spendAdd(spent);
      commit(); paint("완료 — 아래 타임라인에서 마음대로 고치세요", 100);
      toast("릴스를 타임라인에 올렸습니다. 재생해서 확인해 보세요.", 4000);
    } catch (e) { paint("실패", 0); prog.innerHTML += `<div class="errc">${esc(e.message || e)}</div>`; console.error(e); }
    genBusy = false; $("#bGen").disabled = false; $("#bBoard").disabled = false;
  }
  $("#bGen").addEventListener("click", generate);

  // 한 컷만 다시 만들기 / 한 문장만 다시 읽기
  async function regenClip(c) {
    if (genBusy) return; if (!aiReady()) { toast("AI 영상을 쓸 수 없는 상태입니다 (로그인·서버 확인, 또는 '만들지 않기'를 꺼 주세요)."); return; }
    const cost = Math.ceil(c.dur) * KLING_USD_SEC; if (!confirm(`이 컷을 AI로 다시 만듭니다.\n예상 금액 ${usd(cost)}\n\n계속할까요?`)) return;
    c.pending = true; renderTimeline(); scheduleDraw(); genBusy = true;
    try {
      const res = await makeClipBlob(c.srcPhoto || c.mediaId, c.label, c.dur, (s) => toast("컷 다시 만드는 중 · " + s, 6000), null);
      const m = await RS.addMedia(M, res.blob, "AI 컷 다시.mp4", "video"); hookSeek(m);
      c.mediaId = m.id; c.pending = false; c.in = 0; c.speed = 1; c.kb = "none"; c.ai = true; spendAdd(res.usd || cost); commit({ insp: true }); toast("다시 만들었습니다.");
    } catch (e) { c.pending = false; renderTimeline(); toast("실패: " + e.message, 5000); }
    genBusy = false;
  }
  async function reVoice(a) {
    try {
      toast("다시 읽는 중…", 8000); const v = await makeVoice(a.text.trim(), $("#voice").value), m = await RS.addMedia(M, v.blob, "나레이션.wav", "audio");
      a.mediaId = m.id; a.dur = m.dur; a.in = 0; P.texts = P.texts.filter((x) => !(x.sub && x.start >= a.start - 0.01 && x.start < a.start + a.dur + 5 && false));
      commit({ insp: true }); toast("다시 읽었습니다. 자막이 필요하면 '텍스트' 탭에서 고치세요.");
    } catch (e) { toast("실패: " + e.message, 5000); }
  }

  // 비용 기록 (이 브라우저)
  const SPEND = "buyest.reelsstudio.spend";
  function spendAdd(v) { try { const s = JSON.parse(localStorage.getItem(SPEND) || "{}"), d = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); s[d] = (s[d] || 0) + v; localStorage.setItem(SPEND, JSON.stringify(s)); } catch (_) {} }

  // ── 소재 탭 ──
  function renderLib() {
    const box = $("#lib"); box.innerHTML = ""; const ids = Object.keys(M); $("#libEmpty").style.display = ids.length ? "none" : "block";
    ids.forEach((id) => {
      const m = M[id];
      const it = m.kind === "audio" ? h("div", { class: "it au", title: "눌러서 소리 트랙에 넣기" }, h("span", {}, "♪ " + m.name), h("span", { class: "tag" }, m.dur.toFixed(1) + "s"))
        : h("div", { class: "it", title: "눌러서 영상 1 트랙 끝에 넣기 (Shift+클릭: 겹쳐 올리기)" }, m.thumb ? h("img", { src: m.thumb, alt: "" }) : null, h("span", { class: "tag" }, m.isVideo ? m.dur.toFixed(1) + "s" : "사진"));
      it.addEventListener("click", (e) => addToTimeline(m, e.shiftKey)); box.append(it);
    });
  }
  function endOfTrack(track) { let e = 0; P.clips.forEach((c) => { if (c.track === track) e = Math.max(e, c.start + c.dur); }); return e; }
  function addToTimeline(m, overlay) {
    if (m.kind === "audio") {
      const bgm = m.dur > 25; const dur = bgm ? Math.min(m.dur, Math.max(RS.projectDur(P), 5)) : m.dur;
      const a = RS.newAudio({ kind: bgm ? "bgm" : "voice", mediaId: m.id, start: bgm ? 0 : t, dur, vol: bgm ? 0.35 : 1, fadeOut: bgm ? 2 : 0, label: m.name }); P.audio.push(a); sel = { k: "audio", id: a.id }; commit(); return;
    }
    hookSeek(m);
    const c = overlay ? RS.newClip({ track: 1, mediaId: m.id, start: t, dur: m.isVideo ? Math.min(m.dur, 6) : 4, layout: "pip", pw: 0.5, x: 0.2, y: 0.25 })
      : RS.newClip({ track: 0, mediaId: m.id, start: endOfTrack(0), dur: m.isVideo ? m.dur : 4, kb: m.isVideo ? "none" : "in", trans: { type: P.clips.length ? "fade" : "none", dur: 0.35 }, vol: m.isVideo ? 1 : 0 });
    P.clips.push(c); sel = { k: "clip", id: c.id }; commit();
  }
  $("#bUp").addEventListener("click", () => $("#upFile").click());
  $("#upFile").addEventListener("change", async (e) => {
    for (const f of e.target.files) { try { const m = await RS.addMedia(M, f, f.name); hookSeek(m); } catch (err) { toast(err.message, 4000); } }
    e.target.value = ""; renderLib(); queueSave();
  });

  // ── 텍스트 탭 ──
  const PRESET = {
    sub: { text: "자막을 입력하세요", style: "stroke", size: 66, y: 0.74, anim: "fade", dur: 3 },
    title: { text: "큰 제목", style: "stroke", size: 104, y: 0.3, anim: "pop", dur: 2.6 },
    box: { text: "포인트 문구", style: "box", size: 56, y: 0.2, anim: "rise", dur: 3 },
    marker: { text: "형광펜 강조", style: "marker", size: 60, y: 0.5, anim: "fade", dur: 3 },
    price: { text: "", style: "box", size: 76, y: 0.55, anim: "pop", dur: 3 },
  };
  $$("[data-addtext]").forEach((b) => b.addEventListener("click", () => {
    const d = Object.assign({}, PRESET[b.dataset.addtext]); if (b.dataset.addtext === "price") d.text = $("#price").value.trim() || "₩000,000";
    const x = RS.newText(Object.assign(d, { start: t })); P.texts.push(x); sel = { k: "text", id: x.id }; commit();
  }));
  "✨ 🔥 💛 ❤️ 👀 🎁 ⭐ 🧸 ❄️ ⚡ ✅ 📦 👇 💬".split(" ").forEach((s) => $("#stickers").append(h("button", { class: "chip", style: "font-size:20px;padding:2px 9px", onclick: () => { const x = RS.newText({ text: s, start: t, dur: 2.5, style: "plain", size: 170, x: 0.5, y: 0.5, w: 0.5, anim: "pop" }); P.texts.push(x); sel = { k: "text", id: x.id }; commit(); } }, s)));
  function renderSublist() {
    const box = $("#sublist"); if (!box) return; box.innerHTML = ""; const list = P.texts.slice().sort((a, b) => a.start - b.start); $("#txtCnt").textContent = list.length ? list.length + "개" : "";
    list.forEach((x) => {
      const inp = h("input", { value: x.text }); inp.addEventListener("input", () => { x.text = inp.value; scheduleDraw(); }); inp.addEventListener("change", () => commit({ insp: false }));
      inp.addEventListener("focus", () => { if (!sel || sel.id !== x.id) { sel = { k: "text", id: x.id }; renderTimeline(); renderInspector(); seekTo(x.start + 0.05); } });
      box.append(h("div", { class: "si" + (sel && sel.id === x.id ? " sel" : "") }, h("span", {}, fmt(x.start).slice(0, 7)), inp));
    });
    if (!list.length) box.append(h("p", { class: "hint" }, "아직 글자가 없습니다."));
  }

  // ── 소리 탭 ──
  const previewBuf = {}; let previewNode = null;
  $("#bgmMood").innerHTML = BG.PRESETS.map((x) => `<option value="${x.id}">${x.name}</option>`).join("");
  function renderBgmList() {
    const box = $("#bgmList"); box.innerHTML = "";
    BG.PRESETS.forEach((x) => {
      const pv = h("button", { class: "btn sm", onclick: async (e) => { e.stopPropagation(); await previewBgm(x.id, pv); } }, "▶ 듣기");
      const ad = h("button", { class: "btn sm pri", onclick: async (e) => { e.stopPropagation(); await addBgm(x.id, ad); } }, "+ 넣기");
      box.append(h("div", { class: "opt", style: "cursor:default" }, h("div", {}, x.name, h("small", {}, x.note)), h("div", { style: "display:flex;gap:6px" }, pv, ad)));
    });
  }
  async function previewBgm(id, btn) {
    if (previewNode) { try { previewNode.stop(); } catch (_) {} previewNode = null; btn.textContent = "▶ 듣기"; return; }
    btn.textContent = "만드는 중…";
    try {
      const buf = previewBuf[id] || (previewBuf[id] = await BG.render(id, 14)); const a = RS.ac(); await a.resume();
      const s = a.createBufferSource(); s.buffer = buf; s.connect(a.destination); s.onended = () => { previewNode = null; btn.textContent = "▶ 듣기"; }; s.start(); previewNode = s; btn.textContent = "■ 멈춤";
    } catch (e) { btn.textContent = "▶ 듣기"; toast("미리듣기 실패: " + e.message); }
  }
  async function addBgm(id, btn) {
    const total = Math.max(RS.projectDur(P), 10); btn.textContent = "만드는 중…"; btn.disabled = true;
    try {
      const buf = await BG.render(id, total + 1), pr = BG.PRESETS.find((x) => x.id === id), m = await RS.addMedia(M, bufToWav(buf), "BGM " + pr.name + ".wav", "audio");
      P.audio = P.audio.filter((a) => a.kind !== "bgm");
      const a = RS.newAudio({ kind: "bgm", mediaId: m.id, start: 0, dur: total, vol: P.audio.some((x) => x.kind === "voice") ? 0.22 : 0.4, fadeIn: 0.6, fadeOut: 2.5, label: "BGM · " + pr.name }); P.audio.push(a); sel = { k: "audio", id: a.id }; commit(); renderLib();
    } catch (e) { toast("실패: " + e.message, 4000); }
    btn.textContent = "+ 넣기"; btn.disabled = false;
  }
  $("#bBgmUp").addEventListener("click", () => $("#bgmFile").click());
  $("#bgmFile").addEventListener("change", async (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try { const m = await RS.addMedia(M, f, f.name, "audio"); P.audio = P.audio.filter((a) => a.kind !== "bgm"); const total = Math.max(RS.projectDur(P), m.dur > 0 ? Math.min(m.dur, 60) : 10); const a = RS.newAudio({ kind: "bgm", mediaId: m.id, start: 0, dur: Math.min(m.dur, total), vol: 0.35, fadeIn: 0.6, fadeOut: 2.5, label: f.name }); P.audio.push(a); sel = { k: "audio", id: a.id }; commit(); renderLib(); if (m.dur < RS.projectDur(P) - 1) toast("음악이 영상보다 짧습니다. 영상 길이에 맞게 길이를 조절하거나 다른 음악을 쓰세요.", 4500); }
    catch (err) { toast(err.message, 4000); }
  });
  $("#bVoice").addEventListener("click", async () => {
    const text = $("#vText").value.trim(), msg = $("#vMsg"); if (!text) { msg.textContent = "읽을 문장을 적어 주세요."; return; }
    msg.textContent = "음성 만드는 중…"; msg.className = "hint";
    try {
      const v = await makeVoice(text, $("#voice").value), m = await RS.addMedia(M, v.blob, "나레이션.wav", "audio");
      const a = RS.newAudio({ kind: "voice", mediaId: m.id, start: t, dur: m.dur, vol: 1, label: "나레이션", text }); P.audio.push(a);
      RS.subtitleTimes(text, t, m.dur).forEach((s) => P.texts.push(RS.newText({ text: s.text, start: s.start, dur: s.dur, style: "stroke", size: 66, y: 0.74, anim: "fade", sub: true })));
      sel = { k: "audio", id: a.id }; commit(); renderLib(); msg.textContent = `${m.dur.toFixed(1)}초 · 재생 위치에 넣고 자막도 맞췄습니다.`; spendAdd(TTS_USD);
    } catch (e) { msg.textContent = e.message; msg.className = "hint errc"; }
  });

  // ── 효과 탭 ──
  function renderFx() {
    const c = sel && sel.k === "clip" ? selected() : null;
    const mk = (box, list, key, apply) => { const b = $(box); b.innerHTML = ""; list.forEach((o) => b.append(h("button", { class: "chip" + (c && ((key === "trans" ? c.trans && c.trans.type : c[key]) === o.id) ? " on" : ""), onclick: () => apply(o.id) }, o.name))); };
    const targets = () => ($("#fxAll").checked ? P.clips.filter((x) => x.track === 0) : (c ? [c] : []));
    const need = () => { if (!$("#fxAll").checked && !c) { toast("타임라인에서 컷을 먼저 고르거나, '모든 컷에 적용'을 켜 주세요."); return false; } return true; };
    mk("#fxTrans", RS.TRANSITIONS, "trans", (id) => { if (!need()) return; targets().forEach((x, i) => { if (!x.trans) x.trans = { type: "none", dur: 0.5 }; x.trans.type = id; if (id !== "none" && !x.trans.dur) x.trans.dur = 0.5; }); commit({ insp: true }); });
    mk("#fxFilter", RS.FILTERS, "filter", (id) => { if (!need()) return; targets().forEach((x) => { x.filter = id; }); commit({ insp: true }); });
    mk("#fxKb", RS.KENBURNS, "kb", (id) => { if (!need()) return; targets().forEach((x) => { const m = M[x.mediaId]; if (!m || !m.isVideo || id === "none") x.kb = id; }); commit({ insp: true }); });
  }
  $("#fxAll").addEventListener("change", renderFx);

  // ══════════ 저장 · 프로젝트 ══════════
  const DB = {
    open() { return new Promise((res, rej) => { const r = indexedDB.open("buyest-reels-studio", 1); r.onupgradeneeded = () => r.result.createObjectStore("proj", { keyPath: "id" }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
    async tx(mode, fn) { const db = await this.open(); return new Promise((res, rej) => { const t2 = db.transaction("proj", mode), req = fn(t2.objectStore("proj")); t2.oncomplete = () => res(req && req.result); t2.onerror = () => rej(t2.error); t2.onabort = () => rej(t2.error); }); },
    put(r) { return this.tx("readwrite", (s) => s.put(r)); }, get(id) { return this.tx("readonly", (s) => s.get(id)); }, all() { return this.tx("readonly", (s) => s.getAll()); }, del(id) { return this.tx("readwrite", (s) => s.delete(id)); },
  };
  let saveT = 0;
  function queueSave() { clearTimeout(saveT); saveT = setTimeout(() => saveProject(true), 5000); }
  async function saveProject(silent) {
    try {
      P.name = $("#pname").value || "새 릴스"; const blobs = {}, used = new Set();
      P.clips.forEach((c) => { used.add(c.mediaId); if (c.srcPhoto) used.add(c.srcPhoto); }); P.audio.forEach((a) => used.add(a.mediaId)); photos.forEach((p) => used.add(p));
      used.forEach((id) => { const m = M[id]; if (m) blobs[id] = { blob: m.blob, name: m.name, kind: m.kind }; });
      await DB.put({ id: P.id, name: P.name, updated: Date.now(), json: JSON.stringify(P), photos: photos.slice(), blobs });
      if (!silent) toast("저장했습니다.");
    } catch (e) { if (!silent) toast("저장하지 못했습니다: " + (e.message || e), 4500); }
  }
  $("#bSave").addEventListener("click", () => saveProject(false));
  async function openProject(id) {
    const r = await DB.get(id); if (!r) return; pause();
    Object.keys(M).forEach((k) => RS.dropMedia(M, k)); photos = [];
    P = JSON.parse(r.json); $("#pname").value = P.name; brand = P.brand || "buyest";
    $$("#brandSeg button").forEach((x) => x.classList.toggle("on", x.dataset.b === brand));
    for (const id2 in r.blobs) { try { const m = await RS.addMedia(M, r.blobs[id2].blob, r.blobs[id2].name, r.blobs[id2].kind, id2); hookSeek(m); } catch (_) {} }
    photos = (r.photos || []).filter((x) => M[x]); board = null; renderBoard(); renderPhotos(); renderLib();
    hist.s = []; hist.i = -1; sel = null; t = 0; commit(); $("#mProj").classList.remove("on");
  }
  async function listProjects() {
    const box = $("#plist"); box.innerHTML = ""; let all = []; try { all = (await DB.all()) || []; } catch (_) {}
    all.sort((a, b) => b.updated - a.updated);
    if (!all.length) box.append(h("p", { class: "hint" }, "저장된 프로젝트가 없습니다."));
    all.forEach((r) => box.append(h("div", { class: "pi" }, h("b", {}, r.name), h("span", {}, new Date(r.updated).toLocaleString("ko-KR")), h("button", { class: "btn sm", onclick: () => openProject(r.id) }, "열기"), h("button", { class: "btn sm", onclick: async () => { if (confirm("이 프로젝트를 지울까요?")) { await DB.del(r.id); listProjects(); } } }, "삭제"))));
  }
  $("#bProjects").addEventListener("click", () => { $("#mProj").classList.add("on"); listProjects(); });
  $("#bProjClose").addEventListener("click", () => $("#mProj").classList.remove("on"));
  $("#bNew").addEventListener("click", () => { if (!confirm("새 프로젝트를 시작합니다. 지금 작업은 저장돼 있어야 합니다.")) return; pause(); Object.keys(M).forEach((k) => RS.dropMedia(M, k)); photos = []; board = null; P = RS.newProject(); P.brand = brand; $("#pname").value = P.name; renderBoard(); renderPhotos(); renderLib(); hist.s = []; hist.i = -1; sel = null; t = 0; commit(); $("#mProj").classList.remove("on"); });
  $("#pname").addEventListener("change", () => { P.name = $("#pname").value; queueSave(); });

  // ══════════ 내보내기 ══════════
  async function doExport() {
    if (!SE.supported()) { alert("이 브라우저는 영상 내보내기를 지원하지 않습니다. 최신 Chrome·Edge 로 열어 주세요."); return; }
    if (!RS.projectDur(P)) { toast("내보낼 장면이 없습니다."); return; }
    if (P.clips.some((c) => c.pending)) { if (!confirm("아직 AI 영상이 만들어지는 컷이 있습니다. 자리표시 화면으로 내보내집니다. 계속할까요?")) return; }
    pause(); const m = $("#mExport"), body = $("#exBody"); m.classList.add("on");
    const ac = new AbortController(), t0 = Date.now(); body.innerHTML = "";
    const stage = h("div", {}, "준비 중…"), bar = h("div", { class: "bar" }, h("i")), info = h("div", { class: "hint" });
    const cancel = h("button", { class: "btn", onclick: () => ac.abort() }, "취소");
    body.append(stage, bar, info, h("div", { style: "margin-top:12px" }, cancel));
    try {
      const blob = await RS.exportMp4(P, M, { signal: ac.signal, onStage: (s) => { stage.textContent = s; }, onProgress: (p) => { bar.firstChild.style.width = Math.round(p * 100) + "%"; const el = (Date.now() - t0) / 1000; info.textContent = `${Math.round(p * 100)}% · ${Math.round(el)}초 지남${p > 0.05 ? ` · 약 ${Math.round(el / p - el)}초 남음` : ""}`; } });
      const url = URL.createObjectURL(blob), name = (P.name || "릴스").replace(/[\\/:*?"<>|\s]+/g, "_") + ".mp4";
      body.innerHTML = ""; body.append(h("div", { class: "okc" }, `완료 · ${(blob.size / 1048576).toFixed(1)}MB · ${fmt(RS.projectDur(P))}`), h("video", { src: url, controls: true, playsinline: true }),
        h("div", { style: "margin-top:12px;display:flex;gap:8px" }, h("a", { class: "btn pri", href: url, download: name, style: "text-decoration:none;color:#1b160b" }, "MP4 다운로드"), h("button", { class: "btn", onclick: () => m.classList.remove("on") }, "닫기")));
    } catch (e) { body.innerHTML = ""; body.append(h("div", { class: "errc" }, e.message || String(e)), h("div", { style: "margin-top:12px" }, h("button", { class: "btn", onclick: () => m.classList.remove("on") }, "닫기"))); console.error(e); }
  }
  $("#bExport").addEventListener("click", doExport);

  // ══════════ 연결 · 버튼 · 단축키 ══════════
  $("#bUndo").addEventListener("click", () => { if (hist.i > 0) restore(hist.i - 1); });
  $("#bRedo").addEventListener("click", () => { if (hist.i < hist.s.length - 1) restore(hist.i + 1); });
  $("#bPlay").addEventListener("click", () => (playing ? pause() : play()));
  $("#bBegin").addEventListener("click", () => seekTo(0)); $("#bEnd").addEventListener("click", () => seekTo(RS.projectDur(P)));
  $("#bSplit").addEventListener("click", doSplit); $("#bDup").addEventListener("click", doDup); $("#bDel").addEventListener("click", doDel); $("#bMagnet").addEventListener("click", doMagnet);
  $("#safeTg").addEventListener("change", () => $("#safe").classList.toggle("on", $("#safeTg").checked));
  $("#zoom").addEventListener("input", () => { const c = (tls.scrollLeft + tls.clientWidth / 2 - LBL) / zoom; zoom = Number($("#zoom").value); renderTimeline(); tls.scrollLeft = Math.max(0, c * zoom - tls.clientWidth / 2 + LBL); });
  tls.addEventListener("wheel", (e) => { if (e.ctrlKey) { e.preventDefault(); zoom = clamp(zoom * (e.deltaY < 0 ? 1.15 : 0.87), 12, 160); $("#zoom").value = zoom; renderTimeline(); } }, { passive: false });
  document.addEventListener("keydown", (e) => {
    const tag = (e.target.tagName || "").toLowerCase(); if (tag === "input" || tag === "textarea" || tag === "select") return;
    const k = e.key.toLowerCase();
    if (e.code === "Space") { e.preventDefault(); playing ? pause() : play(); }
    else if (k === "s" && !e.ctrlKey && !e.metaKey) doSplit();
    else if (k === "delete" || k === "backspace") { e.preventDefault(); doDel(); }
    else if ((e.ctrlKey || e.metaKey) && k === "z") { e.preventDefault(); if (e.shiftKey) $("#bRedo").click(); else $("#bUndo").click(); }
    else if ((e.ctrlKey || e.metaKey) && k === "y") { e.preventDefault(); $("#bRedo").click(); }
    else if ((e.ctrlKey || e.metaKey) && k === "d") { e.preventDefault(); doDup(); }
    else if (k === "arrowleft") { e.preventDefault(); seekTo(t - (e.shiftKey ? 1 : 0.1)); }
    else if (k === "arrowright") { e.preventDefault(); seekTo(t + (e.shiftKey ? 1 : 0.1)); }
    else if (k === "home") seekTo(0); else if (k === "end") seekTo(RS.projectDur(P));
  });
  window.addEventListener("beforeunload", (e) => { if (genBusy) { e.preventDefault(); e.returnValue = ""; } });

  function refreshAll(insp) { renderTimeline(); if (insp !== false) renderInspector(); renderSublist(); renderFx(); if (!playing) { syncVideos(false); draw(); } else updTime(); }

  // 서버 상태 표시
  (async () => {
    const net = $("#net"), label = net.lastChild; let ok = 0, parts = [];
    if (!AUTH) { net.className = "net bad"; label.textContent = "로그인 안 됨 — 편집만 가능 (툴키트 로그인 후 새로고침)"; return; }
    try { RH = await health(REELS); parts.push(RH.higgsfield ? "AI 영상 ✓" : "AI 영상 키 없음"); if (RH.higgsfield) ok++; } catch (_) { parts.push("AI 영상 서버 연결 실패"); }
    try { LH = await health(LOOK); parts.push(LH.tts ? "음성 ✓" : "음성 키 없음"); if (LH.tts) ok++; if (LH.voices && LH.voices.length) $("#voice").innerHTML = LH.voices.map((v) => `<option value="${v.id}">${esc(v.label)}</option>`).join(""); } catch (_) { parts.push("음성 서버 연결 실패"); }
    net.className = "net " + (ok === 2 ? "ok" : "bad"); label.textContent = AUTH.id + " · " + parts.join(" · "); updCost();
  })();

  // 시작
  renderBgmList(); renderLib(); renderPhotos(); renderFx();
  SE.ensureFonts("가나다 BUYEST").then(() => { hist.s = [snap()]; hist.i = 0; updUndo(); renderTimeline(); renderInspector(); renderSublist(); draw(); });
  window.__rs = { get P() { return P; }, M, RS, commit, select, seekTo, play, pause, draw, get board() { return board; }, set board(v) { board = v; renderBoard(); }, addToTimeline, photos: () => photos, addPhotos };
})();
