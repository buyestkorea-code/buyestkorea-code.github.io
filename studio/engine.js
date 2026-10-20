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

  // ── ① 상품 릴스 ────────────────────────────────────
  // P: { brand, brandName, productName, price, cta, secondsPerPhoto, hook, lines[], capTheme }  imgs: ImageBitmap[]
  function buildReelScene(P, imgs) {
    const T = themeOf(P.brand);
    const hook = String(P.hook || "").trim();
    const withHook = !!hook;
    const per = Math.round(clamp(Number(P.secondsPerPhoto) || 2.5, 1, 6) * FPS);
    const intro = withHook ? 0 : Math.round(1.2 * FPS);
    const n = Math.max(imgs.length, 1);
    const outroStart = intro + per * imgs.length;
    const total = intro + per * n + Math.round(2.5 * FPS);
    const hookFrames = Math.min(Math.round(1.8 * FPS), per);
    const lines = (P.lines || []).map((s) => String(s).trim());
    const theme = P.capTheme || "box";
    const brandName = String(P.brandName || "").toUpperCase();

    function draw(ctx, frame) {
      const pop = (start) => easeOut((frame - start) / 20);
      ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
      ctx.textBaseline = "alphabetic";

      if (!withHook && frame < intro) { // 로고 인트로
        const p = pop(0);
        ctx.save(); ctx.globalAlpha = p;
        font(ctx, 96, 400, T.font); setLS(ctx, 18); ctx.textAlign = "center"; ctx.fillStyle = T.fg;
        ctx.fillText(T.label, W / 2 + 9, H / 2 + (1 - p) * 40);
        ctx.restore();
        ctx.fillStyle = T.accent; const lw = 160 * pop(6); ctx.fillRect(W / 2 - lw / 2, H / 2 + 28, lw, 3);
      }

      imgs.forEach((img, i) => { // 사진 슬라이드 (팬/줌)
        const f = frame - (intro + i * per);
        if (f < 0 || f >= per) return;
        const zoom = interp(f, [0, per], i % 2 === 0 ? [1.0, 1.12] : [1.12, 1.0]);
        const dx = interp(f, [0, per], i % 3 === 0 ? [-20, 20] : [20, -20]);
        const op = interp(f, [0, 8, per - 8, per], [i === 0 ? 1 : 0, 1, 1, 0]);
        ctx.save(); ctx.globalAlpha = op; drawCover(ctx, img, 0, 0, W, H, zoom, dx, 0); ctx.restore();
      });

      imgs.forEach((_, i) => { // 사진마다 화면 글자
        if (withHook && i === 0) return;
        const f = frame - (intro + i * per);
        if (f < 0 || f >= per) return;
        const line = withHook ? lines[i - 1] : lines[i];
        if (line) {
          drawCaption(ctx, { text: line, x: SAFE.left, y: SAFE_BOX.y + SAFE_BOX.h, anchor: "bottom", maxW: SAFE_BOX.w, size: 68, T, theme, p: easeOut((f - 4) / 20) });
        } else {
          const gy = SAFE_BOX.y + SAFE_BOX.h - 250;
          const g = ctx.createLinearGradient(0, gy, 0, gy + 250);
          g.addColorStop(0, hexA(T.bg, 0)); g.addColorStop(1, hexA(T.bg, 0.87));
          ctx.fillStyle = g; ctx.fillRect(SAFE.left - 28, gy, SAFE_BOX.w + 56, 250);
          ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
          font(ctx, 40, 400, T.font); setLS(ctx, 8); ctx.fillStyle = T.accent; ctx.fillText(brandName, SAFE.left, SAFE_BOX.y + SAFE_BOX.h - 110);
          font(ctx, 60, 500, T.sans); setLS(ctx, 0); ctx.fillStyle = T.fg;
          const pl = wrap(ctx, P.productName || "", SAFE_BOX.w).slice(0, 2);
          pl.forEach((l, k) => ctx.fillText(l, SAFE.left, SAFE_BOX.y + SAFE_BOX.h - 40 - (pl.length - 1 - k) * 76));
        }
      });

      if (withHook && frame < hookFrames) drawHook(ctx, T, hook, theme); // 0~2초 훅: 첫 프레임부터 보인다

      if (frame >= outroStart) drawOutro(ctx, T, P, brandName, (s) => pop(outroStart + s)); // 아웃트로: 가격 + CTA
    }
    return { frames: total, fps: FPS, draw, prepare: null };
  }

  // ── ② 템플릿 ──────────────────────────────────────
  // 템플릿 한 개 = 미디어 칸(slots) + 글자 줄(texts, 시작·길이 수정 가능) + 그리는 함수
  const TEMPLATES = [
    {
      id: "overlay", name: "촬영본 + 자막 오버레이", brandLock: null, duration: 12, durationFromVideo: true,
      desc: "촬영한 영상(또는 사진) 위에 브랜드 로고, 자막 두 줄, 마지막 문구를 얹습니다. 영상 길이에 맞춰 최대 60초.",
      slots: [{ id: "clip", label: "촬영본 (영상 또는 사진)", accept: "video/*,image/*" }],
      texts: [
        { id: "l1", label: "자막 1", text: "밀라노에서\n직접 바잉한", start: 1, dur: 4 },
        { id: "l2", label: "자막 2", text: "이번 시즌\n신상 입고", start: 5, dur: 4 },
        { id: "cta", label: "마지막 문구", text: "DM으로 문의주세요", start: 9, dur: 3, cta: true },
      ],
      draw(ctx, t, S) {
        const { T, theme } = S;
        ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
        if (S.media.clip) drawMedia(ctx, S.media.clip, t, S.dur, 0, 0, W, H, 1 + 0.06 * (t / S.dur));
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, "rgba(0,0,0,.35)"); g.addColorStop(0.3, "rgba(0,0,0,0)"); g.addColorStop(0.6, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.75)");
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.save(); font(ctx, 44, 400, T.font); setLS(ctx, 16); ctx.fillStyle = "#f5f1ea"; ctx.textAlign = "center";
        ctx.globalAlpha = easeOut((t - 0.3) / 0.6); ctx.fillText(T.label, W / 2 + 8, SAFE.top + 20); ctx.restore();
        S.texts.forEach((x) => {
          if (t < x.start || t >= x.start + x.dur) return;
          const p = Math.min(easeOut((t - x.start) / 0.5), easeOut((x.start + x.dur - t) / 0.35));
          if (x.cta) {
            drawCaption(ctx, { text: x.text, x: SAFE.left, y: SAFE_BOX.y + SAFE_BOX.h - 20, anchor: "bottom", maxW: SAFE_BOX.w, size: 46, T: { ...T, bg: "#000", fg: "#f5f1ea", accent: T.accent }, theme, p, color: T.accent === "#e8a0a0" ? "#ffffff" : T.accent });
          } else {
            drawCaption(ctx, { text: x.text, x: SAFE.left, y: SAFE_BOX.y + SAFE_BOX.h - 190, anchor: "bottom", maxW: SAFE_BOX.w, size: 78, weight: 800, T: { ...T, bg: "#000", fg: "#f5f1ea" }, theme, p });
          }
        });
      },
    },
    {
      id: "kidsnew", name: "키즈 신상 타이틀", brandLock: "kids", duration: 8,
      desc: "사진 2장을 둥근 카드에 한 장씩 보여 주고 NEW ARRIVAL 문구를 올립니다. (BUYEST Kids 톤)",
      slots: [{ id: "p1", label: "사진 1", accept: "image/*" }, { id: "p2", label: "사진 2", accept: "image/*" }],
      texts: [
        { id: "title", label: "윗줄", text: "NEW ARRIVAL", start: 0.5, dur: 7.5, big: true },
        { id: "name", label: "브랜드명 · 상품명", text: "브랜드명 · 상품명", start: 1, dur: 7 },
      ],
      draw(ctx, t, S) {
        const T = themeOf("kids");
        ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
        ctx.save(); font(ctx, 40, 400, T.font); setLS(ctx, 14); ctx.fillStyle = T.fg; ctx.textAlign = "center"; ctx.fillText(T.label, W / 2 + 7, SAFE.top + 10); ctx.restore();
        [["p1", 0, 4], ["p2", 4, 8]].forEach(([id, a, b]) => {
          if (t < a || t >= b) return;
          const img = S.media[id]; if (!img) return;
          const p = easeOut((t - a) / 0.6), out = easeOut((b - t) / 0.4);
          ctx.save(); ctx.globalAlpha = Math.min(p, out);
          ctx.translate((1 - p) * 120, 0);
          ctx.shadowColor = "rgba(43,43,43,.18)"; ctx.shadowBlur = 40; ctx.shadowOffsetY = 18;
          roundRect(ctx, 90, 380, 900, 1000, 40); ctx.fillStyle = "#fff"; ctx.fill(); ctx.shadowColor = "transparent";
          ctx.clip(); drawCover(ctx, img.el, 90, 380, 900, 1000, 1 + 0.06 * ((t - a) / (b - a)), 0, 0);
          ctx.restore();
        });
        S.texts.forEach((x) => {
          if (t < x.start || t >= x.start + x.dur) return;
          const p = Math.min(easeOut((t - x.start) / 0.5), 1);
          ctx.save(); ctx.globalAlpha = p; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
          if (x.big) { font(ctx, 64, 800, T.sans); setLS(ctx, 2); ctx.fillStyle = T.accent; ctx.fillText(x.text, W / 2, SAFE.top + 110 + (1 - p) * 20); }
          else { font(ctx, 48, 500, T.sans); setLS(ctx, 0); ctx.fillStyle = T.fg; const ls = wrap(ctx, x.text, 900).slice(0, 2); ls.forEach((l, k) => ctx.fillText(l, W / 2, 1480 + k * 62 + (1 - p) * 20)); }
          ctx.restore();
        });
      },
    },
    {
      id: "collage", name: "정보형 콜라주 (가격·소재·사이즈)", brandLock: null, duration: 10,
      desc: "사진 1~4장을 폴라로이드처럼 겹쳐 붙이고, 아래에 가격·소재·사이즈 같은 정보를 한 줄씩 띄웁니다. 정보형 릴스용.",
      slots: [
        { id: "c1", label: "사진 1", accept: "image/*" }, { id: "c2", label: "사진 2 (선택)", accept: "image/*", optional: true },
        { id: "c3", label: "사진 3 (선택)", accept: "image/*", optional: true }, { id: "c4", label: "사진 4 (선택)", accept: "image/*", optional: true },
      ],
      texts: [
        { id: "title", label: "제목", text: "상품명", start: 0.3, dur: 9.7, title: true },
        { id: "i1", label: "정보 1", key: "가격", text: "₩890,000", start: 3.0, dur: 7 },
        { id: "i2", label: "정보 2", key: "소재", text: "광택 나일론", start: 4.2, dur: 5.8 },
        { id: "i3", label: "정보 3", key: "사이즈", text: "4A~10A", start: 5.4, dur: 4.6 },
        { id: "i4", label: "정보 4", key: "원산지", text: "이탈리아", start: 6.6, dur: 3.4 },
        { id: "cta", label: "마지막 문구", text: "댓글에 '사이즈' 남겨 주세요", start: 8, dur: 2, cta: true },
      ],
      draw(ctx, t, S) {
        const { T } = S;
        ctx.fillStyle = T.dark ? "#161513" : T.bg; ctx.fillRect(0, 0, W, H);
        // 종이 질감 점
        const rr = rnd(7); ctx.fillStyle = T.dark ? "rgba(255,255,255,.035)" : "rgba(0,0,0,.035)";
        for (let i = 0; i < 260; i++) ctx.fillRect(rr() * W, rr() * H, 3, 3);
        const ids = ["c1", "c2", "c3", "c4"].filter((id) => S.media[id]);
        const spots = [[-5, 90, 330, 380, 310], [4, 470, 345, 380, 310], [4, 90, 670, 380, 310], [-4, 470, 680, 380, 310]];
        // 사진 장수에 따라 배치를 키운다
        const layoutOne = [[-3, 150, 340, 600, 630]];
        const layoutTwo = [[-5, 100, 330, 520, 330], [5, 320, 655, 520, 330]];
        const L = ids.length === 1 ? layoutOne : ids.length === 2 ? layoutTwo : spots;
        ids.forEach((id, i) => {
          const [rot, x, y, w, h] = L[i]; const p = easeOut((t - 0.6 - i * 0.35) / 0.55);
          if (p <= 0) return;
          const s = 0.7 + 0.3 * p;
          ctx.save(); ctx.globalAlpha = clamp(p * 1.5, 0, 1);
          ctx.translate(x + w / 2, y + h / 2); ctx.rotate((rot * Math.PI) / 180); ctx.scale(s, s); ctx.translate(-w / 2, -h / 2);
          ctx.shadowColor = "rgba(0,0,0,.4)"; ctx.shadowBlur = 28; ctx.shadowOffsetY = 12;
          ctx.fillStyle = "#faf7f0"; ctx.fillRect(0, 0, w, h); ctx.shadowColor = "transparent";
          drawCover(ctx, S.media[id].el, 18, 18, w - 36, h - 90, 1 + 0.05 * clamp((t - 1) / 8, 0, 1), 0, 0);
          // 테이프
          ctx.fillStyle = "rgba(230,215,160,.8)"; ctx.save(); ctx.translate(w / 2 - 60, -14); ctx.rotate(-0.04); ctx.fillRect(0, 0, 120, 38); ctx.restore();
          ctx.restore();
        });
        const tx = S.texts.find((x) => x.title);
        if (tx) drawText(ctx, tx.text, SAFE.left, SAFE.top + 4, { size: 56, weight: 800, color: T.fg, p: easeOut((t - tx.start) / 0.5), family: T.sans, maxW: SAFE_BOX.w, maxLines: 1 });
        const infos = S.texts.filter((x) => x.key !== undefined);
        const baseY = 1000;
        infos.forEach((x, i) => {
          if (t < x.start || t >= x.start + x.dur + 0.01) return;
          const p = easeOut((t - x.start) / 0.45);
          const y = baseY + i * 76;
          ctx.save(); ctx.globalAlpha = p; ctx.translate((1 - p) * -80, 0);
          roundRect(ctx, SAFE.left, y, SAFE_BOX.w, 64, 32); ctx.fillStyle = hexA(T.dark ? "#f5f1ea" : "#2b2b2b", 0.10); ctx.fill();
          font(ctx, 28, 700, T.sans); setLS(ctx, 4); ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillStyle = T.accent; ctx.fillText(String(x.key || ""), SAFE.left + 30, y + 33);
          font(ctx, 36, 600, T.sans); setLS(ctx, 0); ctx.fillStyle = T.fg; ctx.textAlign = "right"; ctx.fillText(x.text, SAFE.left + SAFE_BOX.w - 30, y + 33);
          ctx.restore();
        });
        const cta = S.texts.find((x) => x.cta);
        if (cta && t >= cta.start && t < cta.start + cta.dur + 0.01) {
          drawCaption(ctx, { text: cta.text, x: SAFE.left + SAFE_BOX.w / 2, y: SAFE_BOX.y + SAFE_BOX.h - 10, anchor: "bottom", align: "center", maxW: SAFE_BOX.w, size: 44, T, theme: S.theme === "box" ? "paper" : S.theme, p: easeOut((t - cta.start) / 0.45) });
        }
      },
    },
  ];

  function drawText(ctx, text, x, y, o) {
    ctx.save(); ctx.globalAlpha = clamp(o.p, 0, 1);
    font(ctx, o.size, o.weight, o.family); setLS(ctx, 0); ctx.fillStyle = o.color; ctx.textAlign = "left"; ctx.textBaseline = "top";
    wrap(ctx, text, o.maxW || 900).slice(0, o.maxLines || 2).forEach((l, i) => ctx.fillText(l, x, y + i * o.size * 1.25 + (1 - clamp(o.p, 0, 1)) * 24));
    ctx.restore();
  }

  // 미디어(영상/사진)를 시간 t 에 맞춰 그린다. 영상은 이미 해당 시각으로 이동(seek)되어 있어야 한다
  function drawMedia(ctx, m, t, dur, x, y, w, h, zoom) {
    if (!m) return;
    drawCover(ctx, m.el, x, y, w, h, zoom, 0, 0);
  }

  // 템플릿 장면. S = { T, theme, media:{slot: {el, isVideo, duration}}, texts:[...], dur }
  function buildTemplateScene(tpl, S) {
    let dur = tpl.duration;
    const clip = S.media && S.media[tpl.slots[0] && tpl.slots[0].id];
    if (tpl.durationFromVideo && clip && clip.isVideo && clip.duration) dur = clamp(Math.round(clip.duration * 10) / 10, 3, 60);
    S.dur = dur;
    const frames = Math.round(dur * FPS);
    return {
      frames, fps: FPS,
      async prepare(frame) {
        for (const id in S.media) {
          const m = S.media[id];
          if (m && m.isVideo) await seekVideo(m.el, m.duration ? (frame / FPS) % m.duration : frame / FPS);
        }
      },
      draw(ctx, frame) { tpl.draw(ctx, frame / FPS, S); },
    };
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
  async function renderToMp4(scene, opts) {
    opts = opts || {};
    if (!supported()) throw new Error("이 브라우저는 영상 만들기를 지원하지 않습니다. 최신 Chrome 또는 Edge, 최신 iPhone Safari 로 열어 주세요.");
    const cfg = await pickConfig();
    if (!cfg) throw new Error("이 기기에서 MP4(H.264) 인코더를 찾지 못했습니다. Chrome 최신 버전 PC에서 열어 주세요.");
    const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d", { alpha: false });
    const muxer = new Mp4Muxer.Muxer({ target: new Mp4Muxer.ArrayBufferTarget(), video: { codec: "avc", width: W, height: H }, fastStart: "in-memory" });
    let encErr = null;
    const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { encErr = e; } });
    enc.configure(cfg);
    const t0 = performance.now();
    try {
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

  // ── AI 자동 릴스 장면 ───────────────────────────────
  // 컷마다 (AI 움직임 영상 또는 사진) + 화면 글자. 처음 1.8초는 훅, 끝에는 가격·요청 화면.
  // P: { brand, brandName, productName, hook, price, cta, capTheme }
  // shots: [{ media: { el, isVideo, duration }, seconds, caption }]
  function buildStoryScene(P, shots) {
    const T = themeOf(P.brand), theme = P.capTheme || "box";
    const hook = String(P.hook || "").trim();
    const FADE = 8, hookFrames = hook ? Math.round(1.8 * FPS) : 0;
    let at = 0;
    const tl = shots.map((s, i) => { const fr = Math.max(1, Math.round(clamp(Number(s.seconds) || 3, 1, 10) * FPS)); const o = { ...s, i, start: at, fr }; at += fr; return o; });
    const outroStart = at, total = outroStart + Math.round(2.5 * FPS);
    const brandName = String(P.brandName || "").toUpperCase();
    const which = (frame) => tl.findIndex((s) => frame >= s.start && frame < s.start + s.fr);
    const clipTime = (sh, local) => { const m = sh.media; return Math.min(local / FPS, Math.max(0, (m.duration || 1) - 0.05)); };

    function drawShot(ctx, sh, local) {
      const m = sh.media; if (!m) return;
      if (m.isVideo) { drawCover(ctx, m.el, 0, 0, W, H, 1, 0, 0); return; }
      // 사진만 쓴 컷은 천천히 팬/줌
      const zoom = interp(local, [0, sh.fr], sh.i % 2 === 0 ? [1.0, 1.12] : [1.12, 1.0]);
      const dx = interp(local, [0, sh.fr], sh.i % 3 === 0 ? [-20, 20] : [20, -20]);
      drawCover(ctx, m.el, 0, 0, W, H, zoom, dx, 0);
    }
    return {
      frames: total, fps: FPS,
      async prepare(frame) {
        const i = which(frame); if (i < 0) return;
        const sh = tl[i], local = frame - sh.start;
        if (sh.media && sh.media.isVideo) await seekVideo(sh.media.el, clipTime(sh, local));
        if (i > 0 && local < FADE) { const pv = tl[i - 1]; if (pv.media && pv.media.isVideo && pv.media !== sh.media) await seekVideo(pv.media.el, clipTime(pv, pv.fr - 1)); }
      },
      draw(ctx, frame) {
        ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
        ctx.textBaseline = "alphabetic";
        if (frame >= outroStart) { drawOutro(ctx, T, { productName: P.productName, price: P.price, cta: P.cta }, brandName, (s) => easeOut((frame - outroStart - s) / 20 + 0)); return; }
        const i = which(frame), sh = tl[i], local = frame - sh.start;
        if (i > 0 && local < FADE) drawShot(ctx, tl[i - 1], tl[i - 1].fr - 1); // 앞 컷 위로 부드럽게 겹친다
        ctx.save(); ctx.globalAlpha = i > 0 ? interp(local, [0, FADE], [0, 1]) : 1; drawShot(ctx, sh, local); ctx.restore();
        if (hook && i === 0 && frame < hookFrames) { drawHook(ctx, T, hook, theme); return; }
        if (sh.caption) {
          const from = i === 0 && hook ? hookFrames : 4;
          const out = interp(local, [sh.fr - 6, sh.fr], [1, 0]);
          drawCaption(ctx, { text: sh.caption, x: SAFE.left, y: SAFE_BOX.y + SAFE_BOX.h, anchor: "bottom", maxW: SAFE_BOX.w, size: 68, T, theme, p: Math.min(easeOut((local - from) / 20), out) });
        }
      },
    };
  }

  window.SE = { W, H, FPS, SAFE, THEMES, themeOf, CAPTION_THEMES, TEMPLATES, buildReelScene, buildStoryScene, buildTemplateScene, loadMedia, loadImage, ensureFonts, renderToMp4, supported, wrap };
})();
