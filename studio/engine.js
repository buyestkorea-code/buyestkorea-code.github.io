// BUYEST 영상 스튜디오 — 브라우저 렌더 엔진
// 서버 없이 이 브라우저 안에서 캔버스로 한 프레임씩 그리고 → WebCodecs(H.264)로 인코딩 → mp4-muxer 로 MP4 를 만든다.
// 예전 PC 설치형의 Remotion(ProductReel.tsx) · HyperFrames 템플릿을 같은 모양으로 옮긴 것.
(function () {
  const W = 1080, H = 1920, FPS = 30;
  // 인스타 릴스 화면에서 캡션·버튼이 덮는 곳을 비운다: 위 230px, 1440px 아래, 오른쪽 230px
  const SAFE = { top: 230, bottom: 1920 - 1440, right: 230, left: 72 };
  const SAFE_BOX = { x: SAFE.left, y: SAFE.top, w: W - SAFE.left - SAFE.right, h: H - SAFE.top - SAFE.bottom };

  const SANS = "'Noto Sans KR','Pretendard','Apple SD Gothic Neo','Malgun Gothic',sans-serif";
  const THEMES = {
    buyest: { bg: "#0d0d0d", fg: "#f5f1ea", accent: "#c8a96a", label: "BUYEST", font: "'Noto Serif KR','Didot','Bodoni 72','Times New Roman',serif", sans: SANS, dark: true },
    kids: { bg: "#fbf6ef", fg: "#2b2b2b", accent: "#e8a0a0", label: "BUYEST KIDS", font: "'Avenir Next','Helvetica Neue',Arial," + SANS, sans: SANS, dark: false },
  };
  const themeOf = (b) => THEMES[b] || THEMES.buyest;

  // 화면 글자(자막) 모양 — 이름은 직원 화면에 그대로 보인다
  const CAPTION_THEMES = [
    { id: "box", name: "기본 박스" },
    { id: "paper", name: "종이컷" },
    { id: "vhs", name: "VHS 레트로" },
    { id: "marker", name: "형광펜" },
    { id: "minimal", name: "미니멀 라인" },
  ];

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const easeInOut = (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  // interpolate(x, [x0,x1,..], [y0,y1,..]) — remotion 의 interpolate 와 같은 모양(범위 밖은 끝값 유지)
  function interp(x, xs, ys) {
    if (x <= xs[0]) return ys[0];
    for (let i = 1; i < xs.length; i++) {
      if (x <= xs[i]) { const span = xs[i] - xs[i - 1] || 1; return ys[i - 1] + ((x - xs[i - 1]) / span) * (ys[i] - ys[i - 1]); }
    }
    return ys[ys.length - 1];
  }
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const rnd = (seed) => { let s = seed || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909)) >>> 0) / 4294967296; };

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }
  function setLS(ctx, px) { if ("letterSpacing" in ctx) ctx.letterSpacing = px + "px"; }

  // ── 글자 도구 ──────────────────────────────────────
  // 띄어쓰기에서만 줄을 바꾸고(keep-all), 한 낱말이 너무 길 때만 글자 단위로 자른다
  function wrap(ctx, text, maxW) {
    const out = [];
    String(text).split("\n").forEach((para) => {
      const words = para.split(/\s+/).filter(Boolean);
      let cur = "";
      const push = () => { if (cur) out.push(cur); cur = ""; };
      for (const w of words) {
        const test = cur ? cur + " " + w : w;
        if (ctx.measureText(test).width <= maxW) { cur = test; continue; }
        push();
        if (ctx.measureText(w).width <= maxW) { cur = w; continue; }
        for (const ch of w) { // 아주 긴 낱말
          if (ctx.measureText(cur + ch).width > maxW) push();
          cur += ch;
        }
      }
      push();
      if (!words.length) out.push("");
    });
    return out;
  }
  function font(ctx, size, weight, family) { ctx.font = `${weight || 400} ${size}px ${family || SANS}`; }

  // 자막 한 덩어리를 그린다. anchor: "bottom" 이면 y 가 아랫선, "top" 이면 윗선, "center" 면 가운데
  // o: { text, x, y, maxW, size, weight, T, theme, p(0~1 등장), anchor, align, color }
  function drawCaption(ctx, o) {
    const T = o.T, size = o.size || 64, weight = o.weight || 700, p = o.p == null ? 1 : o.p;
    if (p <= 0 || !String(o.text || "").trim()) return null;
    ctx.save();
    font(ctx, size, weight, T.sans); setLS(ctx, 0);
    const padX = 28, padY = 20, maxW = (o.maxW || SAFE_BOX.w) - padX * 2;
    const lines = wrap(ctx, o.text, maxW);
    const lh = Math.round(size * 1.3);
    const tw = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const bw = Math.ceil(tw + padX * 2), bh = lines.length * lh + padY * 2;
    const align = o.align || "left";
    let bx = o.x; if (align === "center") bx = o.x - bw / 2; else if (align === "right") bx = o.x - bw;
    let by = o.y; if (o.anchor === "bottom") by = o.y - bh; else if (o.anchor === "center") by = o.y - bh / 2;
    const theme = o.theme || "box";
    const rise = (1 - easeOut(p)) * 30;
    ctx.globalAlpha = clamp(p, 0, 1);
    ctx.translate(0, rise);
    const fg = o.color || T.fg;
    const drawLines = (dx, dy, color) => {
      ctx.fillStyle = color; ctx.textBaseline = "middle";
      lines.forEach((l, i) => {
        const ty = by + padY + i * lh + lh / 2 + dy;
        let tx = bx + padX + dx;
        if (align === "center") { ctx.textAlign = "center"; tx = bx + bw / 2 + dx; } else ctx.textAlign = "left";
        ctx.fillText(l, tx, ty);
      });
    };

    if (theme === "box") {
      ctx.fillStyle = hexA(T.bg, 0.8); roundRect(ctx, bx, by, bw, bh, 6); ctx.fill();
      ctx.fillStyle = T.accent; ctx.fillRect(bx, by, 6, bh);
      drawLines(0, 0, fg);
    } else if (theme === "paper") {
      // 종이를 가위로 오린 느낌: 삐뚤빼뚤한 가장자리 + 살짝 기울기 + 그림자
      const r = rnd(hash(String(o.text)));
      const cx = bx + bw / 2, cy = by + bh / 2;
      ctx.translate(cx, cy); ctx.rotate(((r() - 0.5) * 3 * Math.PI) / 180); ctx.translate(-cx, -cy);
      ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = 18; ctx.shadowOffsetY = 8;
      ctx.fillStyle = "#f4efe4";
      ctx.beginPath();
      const step = 26, j = 7;
      ctx.moveTo(bx, by + r() * j);
      for (let x = bx + step; x < bx + bw; x += step) ctx.lineTo(x, by + r() * j);
      ctx.lineTo(bx + bw, by + r() * j);
      for (let y = by + step; y < by + bh; y += step) ctx.lineTo(bx + bw + (r() - 0.5) * j, y);
      ctx.lineTo(bx + bw, by + bh - r() * j);
      for (let x = bx + bw - step; x > bx; x -= step) ctx.lineTo(x, by + bh - r() * j);
      ctx.lineTo(bx, by + bh - r() * j);
      for (let y = by + bh - step; y > by; y -= step) ctx.lineTo(bx + (r() - 0.5) * j, y);
      ctx.closePath(); ctx.fill();
      ctx.shadowColor = "transparent";
      drawLines(0, 0, "#1b1b1b");
    } else if (theme === "vhs") {
      ctx.fillStyle = "rgba(10,10,18,.62)"; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = "rgba(255,255,255,.06)";
      for (let y = by; y < by + bh; y += 4) ctx.fillRect(bx, y, bw, 1.5); // 주사선
      drawLines(-4, 0, "rgba(255,40,80,.75)");
      drawLines(4, 0, "rgba(0,230,255,.75)");
      drawLines(0, 0, "#ffffff");
    } else if (theme === "marker") {
      // 줄마다 형광펜을 긋는다
      lines.forEach((l, i) => {
        const w = ctx.measureText(l).width;
        const ly = by + padY + i * lh;
        const grow = easeOut(clamp(p * 1.4 - i * 0.2, 0, 1));
        ctx.fillStyle = "#ffe45c";
        let lx = bx + padX; if (align === "center") lx = bx + bw / 2 - w / 2;
        ctx.fillRect(lx - 10, ly + lh * 0.38, (w + 20) * grow, lh * 0.55);
      });
      drawLines(0, 0, "#111111");
    } else { // minimal
      ctx.shadowColor = "rgba(0,0,0,.6)"; ctx.shadowBlur = 22; ctx.shadowOffsetY = 3;
      drawLines(0, 0, o.color || (T.dark ? "#ffffff" : "#ffffff"));
      ctx.shadowColor = "transparent";
      ctx.fillStyle = T.accent; ctx.fillRect(bx + padX, by + bh - 4, Math.min(160, bw - padX * 2) * easeOut(p), 4);
    }
    ctx.restore();
    return { x: bx, y: by, w: bw, h: bh };
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  // 이미지를 칸에 꽉 채워(cover) 그린다. zoom 은 1.0 이 기본, dx 는 가로 이동(px)
  function drawCover(ctx, img, x, y, w, h, zoom, dx, dy) {
    const iw = img.width || img.videoWidth, ih = img.height || img.videoHeight;
    if (!iw || !ih) return;
    const s = Math.max(w / iw, h / ih) * (zoom || 1);
    const dw = iw * s, dh = ih * s;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.drawImage(img, x + (w - dw) / 2 + (dx || 0), y + (h - dh) / 2 + (dy || 0), dw, dh);
    ctx.restore();
  }

  // 0~2초 훅 화면 (상품 릴스·AI 릴스 공용)
  function drawHook(ctx, T, hook, theme) {
    const g = ctx.createLinearGradient(0, H * 0.3, 0, H);
    g.addColorStop(0, hexA(T.bg, 0)); g.addColorStop(1, hexA(T.bg, 0.6));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const cy = SAFE_BOX.y + SAFE_BOX.h / 2;
    ctx.save(); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    font(ctx, 34, 400, T.font); setLS(ctx, 10); ctx.fillStyle = T.accent;
    // 훅 글자 높이를 먼저 재서 라벨+훅을 세로 가운데에 놓는다
    font(ctx, 84, 800, T.sans); setLS(ctx, 0);
    const hl = wrap(ctx, hook, SAFE_BOX.w - (theme === "box" && !T.dark ? 56 : 0));
    const blockH = 34 + 24 + hl.length * 105;
    const top = cy - blockH / 2;
    font(ctx, 34, 400, T.font); setLS(ctx, 10); ctx.fillStyle = T.accent; ctx.fillText(T.label, SAFE.left, top + 34);
    ctx.restore();
    if (theme === "box" || theme === "minimal") {
      ctx.save(); font(ctx, 84, 800, T.sans); setLS(ctx, 0);
      const kidsBox = !T.dark;
      hl.forEach((l, k) => {
        const ty = top + 34 + 24 + 74 + k * 105; // 라벨(34) + 간격(24) 아래에서 첫 줄 기준선
        const w = ctx.measureText(l).width;
        if (kidsBox) { ctx.fillStyle = hexA(T.bg, 0.87); roundRect(ctx, SAFE.left, ty - 62, w + 56, 100, 8); ctx.fill(); }
        ctx.fillStyle = T.fg; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
        if (!kidsBox) { ctx.shadowColor = "rgba(0,0,0,.55)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 4; }
        ctx.fillText(l, SAFE.left + (kidsBox ? 28 : 0), ty);
      });
      ctx.restore();
    } else {
      drawCaption(ctx, { text: hook, x: SAFE.left, y: top + 34 + 24, anchor: "top", maxW: SAFE_BOX.w, size: 78, weight: 800, T, theme, p: 1 });
    }
  }
  // 마지막 화면: 브랜드·상품명·가격·요청 (a(s) 는 s프레임 뒤에 나타나는 정도 0~1)
  function drawOutro(ctx, T, P, brandName, a) {
    ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
    const cx = SAFE.left + SAFE_BOX.w / 2;
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    let y = SAFE_BOX.y + SAFE_BOX.h / 2 - 230;
    
    ctx.save(); ctx.globalAlpha = a(0);
    font(ctx, 44, 400, T.font); setLS(ctx, 10); ctx.fillStyle = T.accent; ctx.fillText(brandName, cx + 5, y + 20 + (1 - a(0)) * 20); ctx.restore();
    font(ctx, 64, 500, T.sans); setLS(ctx, 0);
    const pl = wrap(ctx, P.productName || "", SAFE_BOX.w).slice(0, 3);
    ctx.save(); ctx.globalAlpha = a(4); ctx.fillStyle = T.fg;
    pl.forEach((l, k) => ctx.fillText(l, cx, y + 100 + k * 80)); ctx.restore();
    y += 100 + pl.length * 80;
    if (P.price) {
      ctx.save(); ctx.globalAlpha = a(10); font(ctx, 100, 600, T.font); setLS(ctx, 0); ctx.fillStyle = T.fg; ctx.fillText(P.price, cx, y + 90); ctx.restore(); y += 130;
    }
    if (P.cta) {
      ctx.save(); ctx.globalAlpha = a(18); font(ctx, 42, 500, T.sans); setLS(ctx, 0);
      const cl = wrap(ctx, P.cta, SAFE_BOX.w - 130).slice(0, 2);
      const cw = Math.max(...cl.map((l) => ctx.measureText(l).width)) + 88, chh = cl.length * 56 + 40;
      ctx.strokeStyle = T.accent; ctx.lineWidth = 2; roundRect(ctx, cx - cw / 2, y + 36, cw, chh, Math.min(chh / 2, 60)); ctx.stroke();
      ctx.fillStyle = T.fg; cl.forEach((l, k) => ctx.fillText(l, cx, y + 36 + 20 + 40 + k * 56 - 8)); ctx.restore(); y += 36 + chh;
    }
    ctx.save(); ctx.globalAlpha = 0.7; font(ctx, 32, 400, T.font); setLS(ctx, 12); ctx.fillStyle = T.fg; ctx.fillText(T.label, cx + 6, y + 110); ctx.restore();
  }

  function seekVideo(v, time) {
    return new Promise((res) => {
      if (Math.abs(v.currentTime - time) < 0.001) return res();
      let done = false;
      const fin = () => { if (done) return; done = true; v.removeEventListener("seeked", fin); res(); };
      v.addEventListener("seeked", fin);
      v.currentTime = Math.min(time, Math.max(0, (v.duration || time) - 0.001));
      setTimeout(fin, 3000);
    });
  }

  // ── 미디어 읽기 ────────────────────────────────────
  async function loadImage(file) {
    let bmp = await createImageBitmap(file);
    const m = Math.max(bmp.width, bmp.height);
    if (m > 2600) { // 너무 큰 사진은 줄여서 메모리를 아낀다
      const s = 2600 / m; const nb = await createImageBitmap(bmp, { resizeWidth: Math.round(bmp.width * s), resizeHeight: Math.round(bmp.height * s), resizeQuality: "high" });
      bmp.close(); bmp = nb;
    }
    return bmp;
  }
  async function loadMedia(file) {
    if (/^video\//.test(file.type) || /\.(mp4|mov|m4v|webm)$/i.test(file.name)) {
      const v = document.createElement("video");
      v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = URL.createObjectURL(file);
      await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error("영상을 읽지 못했습니다 (" + file.name + ")")); });
      return { el: v, isVideo: true, duration: v.duration, name: file.name };
    }
    const bmp = await loadImage(file);
    return { el: bmp, isVideo: false, duration: 0, name: file.name };
  }

  // 한글 글꼴이 실제로 내려받아진 뒤에 그려야 글자가 깨지지 않는다
  async function ensureFonts(sample) {
    if (!document.fonts || !document.fonts.load) return;
    const s = String(sample || "가나다라마바사 BUYEST 0123456789 ₩").slice(0, 400) + " 가나다라마바사아자차카타파하";
    try {
      await Promise.all([
        document.fonts.load("400 40px 'Noto Sans KR'", s), document.fonts.load("500 40px 'Noto Sans KR'", s), document.fonts.load("700 40px 'Noto Sans KR'", s), document.fonts.load("800 40px 'Noto Sans KR'", s),
        document.fonts.load("400 40px 'Noto Serif KR'", s), document.fonts.load("600 40px 'Noto Serif KR'", s),
      ]);
    } catch (_) {}
  }

  // ── 인코딩 ────────────────────────────────────────
  const yieldNow = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });

  function supported() {
    return typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined" && typeof Mp4Muxer !== "undefined";
  }
  async function pickConfig() {
    const base = { width: W, height: H, bitrate: 8_000_000, framerate: FPS, avc: { format: "avc" } };
    for (const codec of ["avc1.640029", "avc1.4d0029", "avc1.42001f"]) {
      for (const hw of ["no-preference", "prefer-software"]) {
        const cfg = { ...base, codec, hardwareAcceleration: hw };
        try { const r = await VideoEncoder.isConfigSupported(cfg); if (r && r.supported) return cfg; } catch (_) {}
      }
    }
    return null;
  }

  // scene → MP4 Blob.  opts: { onProgress(0~1), signal }

  // ── 오디오: AI 영상의 소리를 그대로 이어 붙이기 ───────────────
  // MP4(소리 포함)를 디코딩해서 AAC 로 다시 인코딩한다. 소리가 없거나 이 브라우저가 못 하면 null (영상만 만든다)
  async function decodeAudio(blob) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC || typeof AudioEncoder === "undefined" || typeof AudioData === "undefined") return null;
      const ctx = new AC();
      try { return await ctx.decodeAudioData(await blob.arrayBuffer()); } finally { try { ctx.close(); } catch (_) {} }
    } catch (_) { return null; }
  }
  async function audioConfig(buf) {
    const base = { codec: "mp4a.40.2", sampleRate: buf.sampleRate, numberOfChannels: Math.min(2, buf.numberOfChannels), bitrate: 128000 };
    try { const r = await AudioEncoder.isConfigSupported(base); return r && r.supported ? base : null; } catch (_) { return null; }
  }
  async function encodeAudio(buf, cfg, muxer, totalSec) {
    let err = null;
    const enc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => { err = e; } });
    enc.configure(cfg);
    const ch = cfg.numberOfChannels, sr = buf.sampleRate, total = Math.min(buf.length, Math.round(totalSec * sr)), step = 4096;
    const data = []; for (let c = 0; c < ch; c++) data.push(buf.getChannelData(Math.min(c, buf.numberOfChannels - 1)));
    for (let off = 0; off < total; off += step) {
      const n = Math.min(step, total - off), planar = new Float32Array(n * ch);
      for (let c = 0; c < ch; c++) planar.set(data[c].subarray(off, off + n), c * n);
      const ad = new AudioData({ format: "f32-planar", sampleRate: sr, numberOfFrames: n, numberOfChannels: ch, timestamp: Math.round((off / sr) * 1e6), data: planar });
      enc.encode(ad); ad.close();
      while (enc.encodeQueueSize > 16) await yieldNow();
      if (err) throw err;
    }
    await enc.flush(); enc.close();
    if (err) throw err;
  }

  // scene → MP4 Blob.  opts: { onProgress(0~1, ms), signal, audio: AudioBuffer|null }
  async function renderToMp4(scene, opts) {
    opts = opts || {};
    if (!supported()) throw new Error("이 브라우저는 영상 만들기를 지원하지 않습니다. 최신 Chrome 또는 Edge, 최신 iPhone Safari 로 열어 주세요.");
    const cfg = await pickConfig();
    if (!cfg) throw new Error("이 기기에서 MP4(H.264) 인코더를 찾지 못했습니다. Chrome 최신 버전 PC에서 열어 주세요.");
    const aCfg = opts.audio ? await audioConfig(opts.audio) : null;
    const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d", { alpha: false });
    const muxer = new Mp4Muxer.Muxer({
      target: new Mp4Muxer.ArrayBufferTarget(), video: { codec: "avc", width: W, height: H }, fastStart: "in-memory",
      ...(aCfg ? { audio: { codec: "aac", numberOfChannels: aCfg.numberOfChannels, sampleRate: aCfg.sampleRate } } : {}),
    });
    let encErr = null;
    const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { encErr = e; } });
    enc.configure(cfg);
    const t0 = performance.now();
    try {
      if (aCfg) await encodeAudio(opts.audio, aCfg, muxer, scene.frames / FPS);
      for (let i = 0; i < scene.frames; i++) {
        if (opts.signal && opts.signal.aborted) throw new Error("취소했습니다");
        if (encErr) throw encErr;
        if (scene.prepare) await scene.prepare(i);
        scene.draw(ctx, i);
        const vf = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
        enc.encode(vf, { keyFrame: i % FPS === 0 });
        vf.close();
        while (enc.encodeQueueSize > 8) await yieldNow();
        if (i % 6 === 0) { if (opts.onProgress) opts.onProgress((i + 1) / scene.frames, performance.now() - t0); await yieldNow(); }
      }
      await enc.flush();
      if (encErr) throw encErr;
      muxer.finalize();
    } finally { try { enc.close(); } catch (_) {} }
    if (opts.onProgress) opts.onProgress(1, performance.now() - t0);
    return new Blob([muxer.target.buffer], { type: "video/mp4" });
  }

  // ── 릴스 장면: AI 영상(또는 미리보기용 사진) 위에 훅·자막을 얹고, 끝에 가격·요청 화면을 붙인다 ──
  // P: { brand, brandName, productName, hook, captions[], price, cta, capTheme, outro }
  // clip: { el, isVideo, duration }  (미리보기에서는 사진, duration 은 길이(초))
  function buildClipScene(P, clip, durationSec) {
    const T = themeOf(P.brand), theme = P.capTheme || "box";
    const hook = String(P.hook || "").trim();
    const dur = Math.max(1, clip && clip.isVideo && clip.duration ? clip.duration : durationSec || 10);
    const clipFrames = Math.round(dur * FPS);
    const outroOn = !!P.outro && !!(P.price || P.cta || P.productName);
    const total = clipFrames + (outroOn ? Math.round(2.5 * FPS) : 0);
    const hookFrames = hook ? Math.min(Math.round(1.8 * FPS), clipFrames) : 0;
    const caps = (P.captions || []).map((s) => String(s).trim()).filter(Boolean);
    const brandName = String(P.brandName || "").toUpperCase();
    const slot = caps.length ? Math.max(1, Math.floor((clipFrames - hookFrames) / caps.length)) : 0;
    return {
      frames: total, fps: FPS, clipFrames,
      async prepare(frame) { if (clip && clip.isVideo && frame < clipFrames) await seekVideo(clip.el, Math.min(frame / FPS, Math.max(0, clip.duration - 0.05))); },
      draw(ctx, frame) {
        ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H); ctx.textBaseline = "alphabetic";
        if (frame >= clipFrames) { drawOutro(ctx, T, { productName: P.productName, price: P.price, cta: P.cta }, brandName, (s) => easeOut((frame - clipFrames - s) / 20)); return; }
        if (clip && clip.el) drawCover(ctx, clip.el, 0, 0, W, H, clip.isVideo ? 1 : interp(frame, [0, clipFrames], [1, 1.08]), 0, 0);
        if (hook && frame < hookFrames) { drawHook(ctx, T, hook, theme); return; }
        if (caps.length) {
          const k = Math.min(caps.length - 1, Math.floor((frame - hookFrames) / slot)), local = frame - hookFrames - k * slot;
          const fadeOut = interp(local, [slot - 6, slot], [1, 0]);
          drawCaption(ctx, { text: caps[k], x: SAFE.left, y: SAFE_BOX.y + SAFE_BOX.h, anchor: "bottom", maxW: SAFE_BOX.w, size: 68, T, theme, p: Math.min(easeOut(local / 20), fadeOut) });
        }
      },
    };
  }

  window.SE = { W, H, FPS, SAFE, THEMES, themeOf, CAPTION_THEMES, buildClipScene, decodeAudio, loadMedia, loadImage, ensureFonts, renderToMp4, supported, wrap };
})();
