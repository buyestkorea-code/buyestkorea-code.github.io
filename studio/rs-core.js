// BUYEST 릴스 스튜디오 — 편집 핵심 (프로젝트 모양 · 한 프레임 그리기 · 소리 섞기 · mp4 내보내기)
// 화면 미리보기와 mp4 내보내기가 같은 drawFrame 을 쓰므로 "보이는 그대로" 나온다.
(function () {
  const SE = window.SE;
  const W = SE.W, H = SE.H, FPS = SE.FPS;
  const clamp = SE.clamp, easeOut = SE.easeOut, easeInOut = SE.easeInOut;
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);

  // ── 화면에 보이는 이름 목록 ──
  const FILTERS = [
    { id: "none", name: "원본", css: "" },
    { id: "warm", name: "따뜻하게", css: "sepia(.22) saturate(1.2) hue-rotate(-8deg)" },
    { id: "cool", name: "시원하게", css: "saturate(1.1) hue-rotate(12deg) brightness(1.03)" },
    { id: "vivid", name: "선명하게", css: "saturate(1.5) contrast(1.08)" },
    { id: "fade", name: "빛바랜 필름", css: "contrast(.88) brightness(1.08) saturate(.85)" },
    { id: "film", name: "필름 톤", css: "sepia(.16) contrast(1.12) saturate(1.1)" },
    { id: "bw", name: "흑백", css: "grayscale(1) contrast(1.1)" },
  ];
  const TRANSITIONS = [
    { id: "none", name: "없음" }, { id: "fade", name: "페이드" }, { id: "slideL", name: "오른쪽에서 밀기" }, { id: "slideR", name: "왼쪽에서 밀기" },
    { id: "slideUp", name: "아래에서 올리기" }, { id: "zoom", name: "줌 인" }, { id: "wipe", name: "닦아내기" }, { id: "flash", name: "번쩍임" },
  ];
  const KENBURNS = [{ id: "none", name: "없음" }, { id: "in", name: "천천히 확대" }, { id: "out", name: "천천히 축소" }, { id: "left", name: "왼쪽으로 이동" }, { id: "right", name: "오른쪽으로 이동" }];
  const TEXT_STYLES = [
    { id: "stroke", name: "굵은 외곽선 (릴스 기본)" }, { id: "box", name: "박스" }, { id: "paper", name: "종이컷" }, { id: "vhs", name: "VHS 레트로" },
    { id: "marker", name: "형광펜" }, { id: "minimal", name: "미니멀 라인" }, { id: "plain", name: "그림자만" },
  ];
  const TEXT_ANIMS = [{ id: "fade", name: "페이드" }, { id: "rise", name: "아래서 올라옴" }, { id: "pop", name: "톡 튀어나옴" }, { id: "none", name: "없음" }];

  // ── 프로젝트 모양 ──
  function newProject() {
    return { v: 1, id: uid(), name: "새 릴스", brand: "buyest", brandName: "", clips: [], texts: [], audio: [], board: null, settings: { voice: "Kore", bgm: "bright", ripple: true }, created: Date.now() };
  }
  const newClip = (o) => Object.assign({ id: uid(), track: 0, mediaId: null, start: 0, dur: 5, in: 0, speed: 1, zoom: 1, x: 0, y: 0, rot: 0, opacity: 1, kb: "none", filter: "none", bright: 1, contrast: 1, sat: 1, trans: { type: "none", dur: 0.5 }, vol: 0, layout: "full", pw: 0.5, label: "", pending: false }, o);
  const newText = (o) => Object.assign({ id: uid(), start: 0, dur: 3, text: "자막", style: "stroke", size: 68, weight: 800, color: "", x: 0.5, y: 0.72, w: 0.86, anim: "fade" }, o);
  const newAudio = (o) => Object.assign({ id: uid(), kind: "bgm", mediaId: null, start: 0, dur: 5, in: 0, vol: 1, fadeIn: 0, fadeOut: 0, label: "" }, o);

  function projectDur(P) {
    let e = 0; P.clips.forEach((c) => { e = Math.max(e, c.start + c.dur); });
    if (!e) P.texts.forEach((t) => { e = Math.max(e, t.start + t.dur); });
    return e;
  }

  // ── 소재(미디어) 읽기 ──
  // M[id] = { id, kind:'image'|'video'|'audio', name, blob, url, el, isVideo, dur, w, h, thumb, buf }
  async function thumbOf(el, isVideo) {
    const c = document.createElement("canvas"); c.width = 108; c.height = 192;
    const x = c.getContext("2d");
    const iw = el.videoWidth || el.width, ih = el.videoHeight || el.height;
    if (!iw) return "";
    const s = Math.max(108 / iw, 192 / ih);
    x.drawImage(el, (108 - iw * s) / 2, (192 - ih * s) / 2, iw * s, ih * s);
    try { return c.toDataURL("image/jpeg", 0.7); } catch (_) { return ""; }
  }
  async function addMedia(M, blob, name, forceKind, forceId) {
    const type = blob.type || "";
    const kind = forceKind || (/^video\//.test(type) || /\.(mp4|mov|m4v|webm)$/i.test(name || "") ? "video" : /^audio\//.test(type) || /\.(mp3|wav|m4a|aac|ogg)$/i.test(name || "") ? "audio" : "image");
    const m = { id: forceId || uid(), kind, name: name || "소재", blob, url: URL.createObjectURL(blob), el: null, isVideo: kind === "video", dur: 0, w: 0, h: 0, thumb: "", buf: undefined };
    if (kind === "image") {
      m.el = await SE.loadImage(blob); m.w = m.el.width; m.h = m.el.height; m.thumb = await thumbOf(m.el);
    } else if (kind === "video") {
      const v = document.createElement("video"); v.muted = true; v.playsInline = true; v.preload = "auto"; v.crossOrigin = "anonymous"; v.src = m.url;
      await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error("영상을 읽지 못했습니다 (" + m.name + ")")); });
      m.el = v; m.dur = v.duration || 0; m.w = v.videoWidth; m.h = v.videoHeight;
      try { await SE.seekVideo(v, Math.min(0.2, m.dur / 2)); m.thumb = await thumbOf(v, true); await SE.seekVideo(v, 0); } catch (_) {}
    } else {
      const buf = await ensureBuf({ [m.id]: m }, m.id);
      m.dur = buf ? buf.duration : 0;
      if (!buf) throw new Error("음악·음성 파일을 읽지 못했습니다 (" + m.name + ")");
    }
    M[m.id] = m; return m;
  }
  function dropMedia(M, id) { const m = M[id]; if (!m) return; try { URL.revokeObjectURL(m.url); } catch (_) {} delete M[id]; }

  // ── 소리 ──
  let _ac = null;
  function ac() { if (!_ac) { const AC = window.AudioContext || window.webkitAudioContext; _ac = new AC(); } return _ac; }
  async function ensureBuf(M, id) {
    const m = M[id]; if (!m) return null;
    if (m.buf !== undefined) return m.buf;
    try { m.buf = await ac().decodeAudioData(await m.blob.arrayBuffer()); } catch (_) { m.buf = null; }
    return m.buf;
  }
  function peaks(buf, n) {
    const d = buf.getChannelData(0), step = Math.max(1, Math.floor(d.length / n)), out = new Float32Array(n);
    for (let i = 0; i < n; i++) { let mx = 0; const s = i * step, e = Math.min(d.length, s + step); for (let j = s; j < e; j += 8) { const v = Math.abs(d[j]); if (v > mx) mx = v; } out[i] = mx; }
    let top = 0; out.forEach((v) => { if (v > top) top = v; });
    if (top > 0) for (let i = 0; i < n; i++) out[i] /= top;
    return out;
  }
  // 소리 한 덩어리를 일정에 맞춰 예약 (미리듣기·내보내기 공용). fromT = 타임라인에서 시작하는 위치(초), whenBase = ctx 시계로 그 위치에 해당하는 시각
  function scheduleOne(ctx, dest, buf, o, fromT, whenBase) {
    const itemEnd = o.start + o.dur;
    if (!buf || itemEnd <= fromT + 1e-4) return null;
    const rate = o.rate || 1, local = Math.max(0, fromT - o.start);
    const when = whenBase + Math.max(0, o.start - fromT), dur = o.dur - local;
    if (dur <= 0.01) return null;
    const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
    const g = ctx.createGain(), vol = Math.max(0, o.vol);
    const fi = Math.min(o.fadeIn || 0, o.dur / 2), fo = Math.min(o.fadeOut || 0, o.dur / 2);
    const gainAt = (tl) => { let v = vol; if (fi > 0 && tl < fi) v *= tl / fi; if (fo > 0 && tl > o.dur - fo) v *= Math.max(0, (o.dur - tl) / fo); return v; };
    g.gain.setValueAtTime(gainAt(local), when);
    if (fi > 0 && local < fi) g.gain.linearRampToValueAtTime(vol, when + (fi - local));
    if (fo > 0) { const tStart = Math.max(local, o.dur - fo); g.gain.setValueAtTime(gainAt(tStart), when + (tStart - local)); g.gain.linearRampToValueAtTime(0, when + (o.dur - local)); }
    src.connect(g); g.connect(dest);
    src.start(when, (o.in || 0) + local * rate); src.stop(when + dur);
    return src;
  }
  function scheduleAll(ctx, dest, P, M, fromT, whenBase) {
    const nodes = [];
    P.audio.forEach((a) => { const m = M[a.mediaId]; if (m && m.buf) { const n = scheduleOne(ctx, dest, m.buf, { start: a.start, dur: a.dur, in: a.in, vol: a.vol, fadeIn: a.fadeIn, fadeOut: a.fadeOut, rate: 1 }, fromT, whenBase); if (n) nodes.push(n); } });
    P.clips.forEach((c) => { const m = M[c.mediaId]; if (m && m.isVideo && m.buf && c.vol > 0) { const n = scheduleOne(ctx, dest, m.buf, { start: c.start, dur: c.dur, in: c.in, vol: c.vol, fadeIn: 0, fadeOut: 0, rate: c.speed }, fromT, whenBase); if (n) nodes.push(n); } });
    return nodes;
  }
  async function prepareAudio(P, M) { // 쓰는 소리를 모두 미리 풀어 둔다
    const ids = new Set(); P.audio.forEach((a) => ids.add(a.mediaId)); P.clips.forEach((c) => { const m = M[c.mediaId]; if (m && m.isVideo && c.vol > 0) ids.add(c.mediaId); });
    for (const id of ids) await ensureBuf(M, id);
  }
  async function mixAudio(P, M, total) {
    await prepareAudio(P, M);
    const has = P.audio.some((a) => M[a.mediaId] && M[a.mediaId].buf) || P.clips.some((c) => M[c.mediaId] && M[c.mediaId].isVideo && M[c.mediaId].buf && c.vol > 0);
    if (!has) return null;
    const sr = 44100, OC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ctx = new OC(2, Math.ceil(total * sr), sr);
    const comp = ctx.createDynamicsCompressor(); comp.connect(ctx.destination); // 소리가 겹쳐도 갈라지지 않게
    scheduleAll(ctx, comp, P, M, 0, 0);
    return ctx.startRendering();
  }

  // ── 어떤 영상 소재가 이 시각에 필요한지 ──
  const filterCss = (c) => {
    const f = (FILTERS.find((x) => x.id === c.filter) || FILTERS[0]).css;
    const adj = (c.bright !== 1 || c.contrast !== 1 || c.sat !== 1) ? `brightness(${c.bright}) contrast(${c.contrast}) saturate(${c.sat})` : "";
    return [f, adj].filter(Boolean).join(" ");
  };
  const srcTime = (c, lt, m) => { const t = c.in + lt * c.speed; return m && m.dur ? Math.min(t, Math.max(0, m.dur - 0.04)) : t; };
  function activeClips(P, t) {
    return P.clips.filter((c) => t >= c.start - 1e-6 && t < c.start + c.dur - 1e-6).sort((a, b) => (a.track - b.track) || (a.start - b.start));
  }
  function transOf(P, c, lt) { // 들어오는 전환 중이면 { k(0~1), prev }
    const tr = c.trans; if (!tr || tr.type === "none") return null;
    const td = Math.min(tr.dur || 0.5, c.dur / 2); if (lt >= td) return null;
    const prev = P.clips.filter((x) => x !== c && x.track === c.track && x.start + x.dur <= c.start + 0.06).sort((a, b) => (b.start + b.dur) - (a.start + a.dur))[0] || null;
    return { k: easeInOut(lt / td), prev, type: tr.type };
  }
  function neededVideos(P, t, M) {
    const out = [];
    activeClips(P, t).forEach((c) => {
      const m = M[c.mediaId]; if (!m || !m.isVideo || c.pending) return;
      const lt = t - c.start;
      out.push({ c, m, time: srcTime(c, lt, m), hold: false });
      const tr = transOf(P, c, lt);
      if (tr && tr.prev && tr.prev.mediaId !== c.mediaId) { const pm = M[tr.prev.mediaId]; if (pm && pm.isVideo) out.push({ c: tr.prev, m: pm, time: srcTime(tr.prev, tr.prev.dur - 0.02, pm), hold: true }); }
    });
    return out;
  }
  async function seekVideos(P, t, M) {
    const need = neededVideos(P, t, M);
    for (const n of need) await SE.seekVideo(n.m.el, n.time);
  }

  // ── 한 프레임 그리기 ──
  function drawMedia(ctx, c, lt, m) {
    const el = m.el, iw = m.isVideo ? el.videoWidth : el.width, ih = m.isVideo ? el.videoHeight : el.height;
    if (!iw || !ih) return;
    const p = c.dur > 0 ? clamp(lt / c.dur, 0, 1) : 0;
    let kz = 1, kx = 0;
    if (c.kb === "in") kz = 1 + 0.14 * p; else if (c.kb === "out") kz = 1.14 - 0.14 * p;
    else if (c.kb === "left") { kz = 1.12; kx = (0.5 - p) * 70; } else if (c.kb === "right") { kz = 1.12; kx = (p - 0.5) * 70; }
    ctx.save();
    if (c.layout === "pip") {
      const bw = W * c.pw * (c.zoom || 1), bh = bw * ih / iw, cx = W * (0.5 + c.x), cy = H * (0.5 + c.y);
      ctx.translate(cx, cy); ctx.rotate((c.rot * Math.PI) / 180);
      SE.roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 28); ctx.clip();
      ctx.shadowColor = "rgba(0,0,0,.4)"; ctx.shadowBlur = 30;
      ctx.drawImage(el, -bw / 2 * kz, -bh / 2 * kz, bw * kz, bh * kz);
    } else {
      const s = Math.max(W / iw, H / ih) * (c.zoom || 1) * kz;
      ctx.translate(W / 2 + W * c.x + kx, H / 2 + H * c.y); ctx.rotate((c.rot * Math.PI) / 180);
      ctx.drawImage(el, -iw * s / 2, -ih * s / 2, iw * s, ih * s);
    }
    ctx.restore();
  }
  function drawPlaceholder(ctx, c) {
    const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#1c1b19"); g.addColorStop(1, "#2b2823");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(200,169,106,.9)"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    SE.font(ctx, 64, 700); ctx.fillText(c.pendingText || "AI 영상 만드는 중…", W / 2, H / 2 - 30);
    SE.font(ctx, 38, 400); ctx.fillStyle = "rgba(255,255,255,.55)";
    SE.wrap(ctx, c.label || "", W * 0.7).slice(0, 3).forEach((l, i) => ctx.fillText(l, W / 2, H / 2 + 50 + i * 52));
  }
  function drawClip(ctx, c, lt, M, o) {
    const m = M[c.mediaId]; o = o || {};
    ctx.save();
    if (o.wipe != null) { ctx.beginPath(); ctx.rect(0, 0, W * o.wipe, H); ctx.clip(); }
    ctx.globalAlpha *= (c.opacity == null ? 1 : c.opacity) * (o.alpha == null ? 1 : o.alpha);
    if (o.tx || o.ty || o.scale) { ctx.translate(W / 2 + (o.tx || 0), H / 2 + (o.ty || 0)); ctx.scale(o.scale || 1, o.scale || 1); ctx.translate(-W / 2, -H / 2); }
    const f = filterCss(c); if (f) ctx.filter = f;
    if (c.pending || !m || !m.el) drawPlaceholder(ctx, c); else drawMedia(ctx, c, lt, m);
    ctx.restore();
  }
  function drawText(ctx, P, tx, t) {
    const lt = t - tx.start; if (lt < 0 || lt >= tx.dur || !String(tx.text || "").trim()) return;
    const inD = 0.3, outD = 0.2, pin = clamp(lt / inD, 0, 1), pout = clamp((tx.dur - lt) / outD, 0, 1);
    let a = tx.anim === "none" ? 1 : Math.min(pin, pout), sc = 1, dy = 0;
    if (tx.anim === "rise") dy = (1 - easeOut(pin)) * 46; else if (tx.anim === "pop") sc = 0.72 + 0.28 * easeOut(pin);
    const T = SE.themeOf(P.brand), cx = tx.x * W, cy = tx.y * H + dy, size = tx.size, maxW = W * tx.w;
    ctx.save(); ctx.globalAlpha *= a;
    ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.translate(-cx, -cy);
    if (["box", "paper", "vhs", "marker", "minimal"].includes(tx.style)) {
      SE.drawCaption(ctx, { text: tx.text, x: cx, y: cy, anchor: "center", align: "center", maxW, size, weight: tx.weight, T, theme: tx.style, p: 1, noRise: true, color: tx.color || undefined });
    } else {
      SE.font(ctx, size, tx.weight, T.sans); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
      const lines = SE.wrap(ctx, tx.text, maxW), lh = Math.round(size * 1.28), top = cy - (lines.length * lh) / 2 + lh / 2;
      lines.forEach((l, i) => {
        const y = top + i * lh;
        if (tx.style === "stroke") { ctx.strokeStyle = "rgba(0,0,0,.92)"; ctx.lineWidth = Math.max(6, size * 0.2); ctx.strokeText(l, cx, y); }
        else { ctx.shadowColor = "rgba(0,0,0,.65)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 4; }
        ctx.fillStyle = tx.color || "#ffffff"; ctx.fillText(l, cx, y); ctx.shadowColor = "transparent";
      });
    }
    ctx.restore();
  }
  function drawFrame(ctx, P, t, M) {
    ctx.save(); ctx.globalAlpha = 1; ctx.filter = "none"; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    activeClips(P, t).forEach((c) => {
      const lt = t - c.start, tr = transOf(P, c, lt);
      if (!tr) { drawClip(ctx, c, lt, M); return; }
      const k = tr.k;
      if (tr.prev) drawClip(ctx, tr.prev, tr.prev.dur - 0.02, M);
      const o = {};
      if (tr.type === "fade") o.alpha = k; else if (tr.type === "slideL") o.tx = (1 - k) * W; else if (tr.type === "slideR") o.tx = -(1 - k) * W;
      else if (tr.type === "slideUp") o.ty = (1 - k) * H; else if (tr.type === "zoom") { o.scale = 1 + 0.35 * (1 - k); o.alpha = k; } else if (tr.type === "wipe") o.wipe = k;
      drawClip(ctx, c, lt, M, o);
      if (tr.type === "flash") { ctx.save(); ctx.fillStyle = `rgba(255,255,255,${(1 - k) * 0.9})`; ctx.fillRect(0, 0, W, H); ctx.restore(); }
    });
    P.texts.slice().sort((a, b) => a.start - b.start).forEach((tx) => drawText(ctx, P, tx, t));
    ctx.restore();
  }

  // ── mp4 내보내기 ──
  async function exportMp4(P, M, opts) {
    opts = opts || {};
    const total = projectDur(P);
    if (total <= 0) throw new Error("내보낼 장면이 없습니다. 타임라인에 영상이나 사진을 먼저 놓아 주세요.");
    await SE.ensureFonts(P.texts.map((x) => x.text).join(" "));
    if (opts.onStage) opts.onStage("소리 섞는 중");
    const audio = await mixAudio(P, M, total);
    if (opts.onStage) opts.onStage("영상 만드는 중");
    const scene = { frames: Math.round(total * FPS), fps: FPS, prepare: (i) => seekVideos(P, i / FPS, M), draw: (ctx, i) => drawFrame(ctx, P, i / FPS, M) };
    return SE.renderToMp4(scene, { audio, onProgress: opts.onProgress, signal: opts.signal });
  }

  // ── 문장 나누기 (자막 자동 타이밍) ──
  function splitPhrases(text, maxChars) {
    maxChars = maxChars || 14;
    const raw = String(text || "").replace(/\s+/g, " ").trim(); if (!raw) return [];
    const parts = raw.split(/(?<=[.!?。…])\s+|(?<=,)\s+/).map((s) => s.trim()).filter(Boolean), out = [];
    parts.forEach((p) => {
      if (p.length <= maxChars) { out.push(p); return; }
      let cur = ""; p.split(" ").forEach((w) => { if (cur && (cur + " " + w).length > maxChars) { out.push(cur); cur = w; } else cur = cur ? cur + " " + w : w; }); if (cur) out.push(cur);
    });
    const merged = []; out.forEach((s) => { if (merged.length && s.length < 4) merged[merged.length - 1] += " " + s; else merged.push(s); });
    return merged.map((s) => s.replace(/[.!?。]+$/, "").trim()).filter(Boolean);
  }
  // 나레이션 시작·길이에 맞춰 자막 덩어리마다 시간을 나눠 준다 (글자 수 비례)
  function subtitleTimes(text, start, dur) {
    const ph = splitPhrases(text), tot = ph.reduce((s, x) => s + x.length, 0) || 1; let t = start;
    return ph.map((s) => { const d = Math.max(0.8, (dur * s.length) / tot); const o = { text: s, start: t, dur: d }; t += d; return o; });
  }

  // ══════ 자동 편집: 말하는 구간 찾기 · 무음 잘라내기 · 음성 인식용 파일 · 자막 줄 만들기 ══════
  // 소리 크기(RMS)를 20ms 단위로 재서 "말하는 구간"을 찾는다. sens: 클수록 작은 소리도 무음으로 본다 (기본 1)
  function detectSpeech(buf, o) {
    o = Object.assign({ minSilence: 0.5, pad: 0.15, minSeg: 0.25, sens: 1 }, o || {});
    const sr = buf.sampleRate, d = buf.getChannelData(0), hop = Math.max(1, Math.round(sr * 0.02)), n = Math.floor(d.length / hop), rms = new Float32Array(n);
    for (let i = 0; i < n; i++) { let s = 0; const b = i * hop; for (let j = 0; j < hop; j++) { const v = d[b + j]; s += v * v; } rms[i] = Math.sqrt(s / hop); }
    const sorted = Array.from(rms).sort((a, b) => a - b), p10 = sorted[Math.floor(n * 0.1)] || 0, p90 = sorted[Math.floor(n * 0.9)] || 0;
    const thr = Math.max(p10 * 3, p90 * 0.08, 0.003) * o.sens, step = hop / sr;
    // 1) 말소리 켜짐/꺼짐  2) 짧은 끊김은 이어 붙임  3) 너무 짧은 소리는 버림  4) 앞뒤 여유
    let segs = [], cur = null;
    for (let i = 0; i < n; i++) { const on = rms[i] > thr, t = i * step; if (on && !cur) cur = { start: t, end: t + step }; else if (on && cur) cur.end = t + step; else if (!on && cur) { segs.push(cur); cur = null; } }
    if (cur) segs.push(cur);
    const merged = []; segs.forEach((s) => { const last = merged[merged.length - 1]; if (last && s.start - last.end < o.minSilence) last.end = s.end; else merged.push({ start: s.start, end: s.end }); });
    const dur = buf.duration;
    const padded = merged.filter((s) => s.end - s.start >= o.minSeg).map((s) => ({ start: Math.max(0, s.start - o.pad), end: Math.min(dur, s.end + o.pad) }));
    const out = []; padded.forEach((s) => { const l = out[out.length - 1]; if (l && s.start <= l.end) l.end = Math.max(l.end, s.end); else out.push(s); }); // 여유를 붙이다 겹치면 하나로
    return out;
  }
  // 컷 하나를 "말하는 구간"만 남긴 여러 컷으로 바꾸고, 뒤의 컷은 빈 만큼 앞으로 당긴다. ranges: 원본 영상 시간 기준 [{s,e}]
  function applyCuts(P, c, ranges) {
    if (!ranges.length) return null;
    let cur = c.start; const out = [];
    ranges.forEach((r, i) => { const nc = JSON.parse(JSON.stringify(c)); nc.id = uid(); nc.in = r.s; nc.dur = (r.e - r.s) / c.speed; nc.start = cur; nc.trans = i === 0 ? c.trans : { type: "none", dur: 0.5 }; out.push(nc); cur += nc.dur; });
    const removed = c.dur - (cur - c.start);
    P.clips = P.clips.filter((x) => x !== c);
    P.clips.forEach((x) => { if (x.track === c.track && x.start >= c.start + c.dur - 0.01) x.start = Math.max(0, x.start - removed); });
    P.clips.push(...out); return { removed, count: out.length };
  }
  // 음성 인식용: 16kHz 모노 WAV (1분에 약 1.9MB)
  async function wav16k(buf) {
    const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext, sr = 16000, ctx = new OC(1, Math.max(1, Math.ceil(buf.duration * sr)), sr);
    const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination); src.start(0);
    const r = await ctx.startRendering(), d = r.getChannelData(0), out = new DataView(new ArrayBuffer(44 + d.length * 2));
    const wr = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
    wr(0, "RIFF"); out.setUint32(4, 36 + d.length * 2, true); wr(8, "WAVEfmt "); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
    out.setUint32(24, sr, true); out.setUint32(28, sr * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); wr(36, "data"); out.setUint32(40, d.length * 2, true);
    for (let i = 0; i < d.length; i++) { const v = clamp(d[i], -1, 1); out.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true); }
    return new Blob([out.buffer], { type: "audio/wav" });
  }
  // 음성 인식 결과(단어별 시간) → 자막 줄 [{text,start,end}] (원본 영상 시간 기준). 단어가 없으면 문장을 글자 수 비례로 나눈다
  function subtitleLines(tr, maxChars) {
    maxChars = maxChars || 14; const lines = [];
    if (tr && tr.words && tr.words.length) {
      let cur = null;
      tr.words.forEach((w) => {
        const word = String(w.word || "").trim(); if (!word) return;
        if (cur && ((cur.text + " " + word).length > maxChars || w.start - cur.end > 0.8 || /[.!?。…]$/.test(cur.text))) { lines.push(cur); cur = null; }
        if (!cur) cur = { text: word, start: w.start, end: w.end }; else { cur.text += " " + word; cur.end = w.end; }
      });
      if (cur) lines.push(cur);
    } else if (tr && tr.segments) {
      tr.segments.forEach((s) => { const ph = splitPhrases(s.text, maxChars), tot = ph.reduce((a, x) => a + x.length, 0) || 1; let t = s.start; ph.forEach((p) => { const d = ((s.end - s.start) * p.length) / tot; lines.push({ text: p, start: t, end: t + d }); t += d; }); });
    }
    return lines.map((l) => ({ text: l.text.replace(/[.!?。]+$/, "").trim(), start: l.start, end: l.end })).filter((l) => l.text);
  }

  window.RS = {
    detectSpeech, applyCuts, wav16k, subtitleLines,
    FILTERS, TRANSITIONS, KENBURNS, TEXT_STYLES, TEXT_ANIMS, uid, newProject, newClip, newText, newAudio, projectDur,
    addMedia, dropMedia, ensureBuf, peaks, ac, prepareAudio, mixAudio, scheduleAll,
    activeClips, neededVideos, seekVideos, srcTime, drawFrame, exportMp4, splitPhrases, subtitleTimes,
  };
})();
