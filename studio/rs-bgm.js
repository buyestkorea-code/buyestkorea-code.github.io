// BUYEST 릴스 스튜디오 — 배경음악(BGM) 생성기
// 저작권 걱정 없는 배경음악을 브라우저가 직접 합성한다 (OfflineAudioContext). 분위기 4가지, 길이는 자유.
// 직접 가진 음악 파일(mp3/wav)을 올려서 쓰는 방법은 편집기 "소리" 탭에 따로 있다.
(function () {
  const PRESETS = [
    { id: "bright", name: "밝고 경쾌한", note: "봄·신상 소개에 어울리는 108BPM", bpm: 108 },
    { id: "calm", name: "차분한 라운지", note: "고급스러운 분위기, 드럼 없이 72BPM", bpm: 72 },
    { id: "emotional", name: "감성 피아노", note: "스토리·후기 느낌 80BPM", bpm: 80 },
    { id: "hype", name: "힙한 비트", note: "빠른 컷 편집용 124BPM", bpm: 124 },
  ];
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // 코드 진행 (MIDI 음). 각 코드는 [루트, 3도, 5도, 7도] 오프셋으로 만든다.
  const PROG = {
    bright: { roots: [60, 67, 57, 65], q: ["maj", "maj", "min", "maj"] }, // C G Am F
    calm: { roots: [53, 52, 50, 48], q: ["maj7", "min7", "min7", "maj7"] }, // Fmaj7 Em7 Dm7 Cmaj7
    emotional: { roots: [57, 53, 60, 55], q: ["min", "maj", "maj", "maj"] }, // Am F C G
    hype: { roots: [57, 53, 48, 55], q: ["min", "maj", "maj", "maj"] },
  };
  const Q = { maj: [0, 4, 7, 12], min: [0, 3, 7, 12], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10] };

  function env(g, t, a, d, peak, end) { // 짧은 어택 + 감쇠 엔벨로프
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, Math.min(end, t + a + d));
  }
  function tone(ctx, dest, type, freq, t, a, d, vol, cutoff) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    let node = o;
    if (cutoff) { const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = cutoff; o.connect(f); node = f; }
    node.connect(g); g.connect(dest);
    env(g, t, a, d, vol, t + a + d + 0.05);
    o.start(t); o.stop(t + a + d + 0.1);
  }
  function kick(ctx, dest, t, vol) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.3);
  }
  function noiseBuf(ctx) {
    const b = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function hat(ctx, dest, nb, t, vol, len) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = nb; f.type = "highpass"; f.frequency.value = 7000;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t); s.stop(t + len + 0.02);
  }
  function snare(ctx, dest, nb, t, vol) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = nb; f.type = "bandpass"; f.frequency.value = 1800;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t); s.stop(t + 0.2);
  }

  // 분위기·길이 → AudioBuffer (스테레오, 44.1kHz). 끝 2.5초는 서서히 줄어든다.
  async function render(preset, seconds, sampleRate) {
    const sr = sampleRate || 44100, total = Math.max(4, Math.min(240, seconds));
    const p = PRESETS.find((x) => x.id === preset) || PRESETS[0];
    const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ctx = new OC(2, Math.ceil(total * sr), sr);
    const master = ctx.createGain(); master.gain.value = 0.9;
    // 가벼운 리버브 대용: 짧은 딜레이 두 개
    const dl = ctx.createDelay(1); dl.delayTime.value = (60 / p.bpm) * 0.75;
    const fb = ctx.createGain(); fb.gain.value = 0.22; dl.connect(fb); fb.connect(dl);
    const wet = ctx.createGain(); wet.gain.value = 0.28; dl.connect(wet); wet.connect(master);
    const bus = ctx.createGain(); bus.connect(master); bus.connect(dl);
    master.connect(ctx.destination);
    // 끝부분 페이드아웃
    master.gain.setValueAtTime(0.9, Math.max(0, total - 2.5)); master.gain.linearRampToValueAtTime(0.0001, total);

    const beat = 60 / p.bpm, bar = beat * 4, prog = PROG[p.id], nb = noiseBuf(ctx);
    const bars = Math.ceil(total / bar);
    for (let b = 0; b < bars; b++) {
      const t0 = b * bar, ci = b % 4, root = prog.roots[ci], ch = Q[prog.q[ci]];
      const intro = b === 0; // 첫 마디는 부드럽게 시작
      if (p.id === "bright") {
        ch.slice(0, 3).forEach((n) => tone(ctx, bus, "triangle", mtof(n), t0, 0.08, bar * 0.95, 0.05, 2600)); // 패드
        for (let i = 0; i < 8; i++) { const n = root + 12 + ch[(i * 2 + (i >> 2)) % 4]; tone(ctx, bus, "triangle", mtof(n), t0 + i * beat * 0.5, 0.005, beat * 0.45, 0.05, 3800); } // 아르페지오
        tone(ctx, bus, "sine", mtof(root - 12), t0, 0.01, beat * 1.6, 0.16); tone(ctx, bus, "sine", mtof(root - 12), t0 + beat * 2, 0.01, beat * 1.4, 0.13);
        if (!intro) for (let i = 0; i < 4; i++) { kick(ctx, bus, t0 + i * beat, i % 2 ? 0.2 : 0.34); hat(ctx, bus, nb, t0 + i * beat + beat / 2, 0.07, 0.05); }
      } else if (p.id === "calm") {
        ch.forEach((n) => tone(ctx, bus, "sine", mtof(n), t0, 0.5, bar * 0.95, 0.06, 1800));
        tone(ctx, bus, "sine", mtof(root - 12), t0, 0.05, bar * 0.9, 0.16);
        [0, 1.5, 2.5, 3.25].forEach((o, i) => tone(ctx, bus, "triangle", mtof(root + 12 + ch[(i + 1) % 4]), t0 + o * beat, 0.01, beat * 1.6, 0.045, 2400)); // 드문 벨
      } else if (p.id === "emotional") {
        const arp = [0, 1, 2, 3, 2, 1, 2, 1];
        for (let i = 0; i < 8; i++) tone(ctx, bus, "triangle", mtof(root + 12 + ch[arp[i] % 4]), t0 + i * beat * 0.5, 0.008, beat * 1.3, 0.07, 3000); // 피아노 느낌
        tone(ctx, bus, "sine", mtof(root - 12), t0, 0.02, bar * 0.95, 0.17);
        ch.slice(0, 3).forEach((n) => tone(ctx, bus, "sine", mtof(n), t0, 0.35, bar * 0.9, 0.035, 1600));
        if (!intro) { kick(ctx, bus, t0, 0.22); kick(ctx, bus, t0 + beat * 2.5, 0.14); }
      } else { // hype
        for (let i = 0; i < 4; i++) { kick(ctx, bus, t0 + i * beat, 0.42); hat(ctx, bus, nb, t0 + i * beat + beat / 2, 0.1, 0.06); }
        snare(ctx, bus, nb, t0 + beat, 0.16); snare(ctx, bus, nb, t0 + beat * 3, 0.16);
        for (let i = 0; i < 8; i++) { const n = root - 12 + (i % 4 === 3 ? 7 : 0); tone(ctx, bus, "sawtooth", mtof(n), t0 + i * beat * 0.5, 0.004, beat * 0.4, 0.075, 700); } // 베이스
        [0, 1.5, 2.5].forEach((o) => ch.slice(0, 3).forEach((n) => tone(ctx, bus, "square", mtof(n + 12), t0 + o * beat, 0.004, beat * 0.3, 0.022, 2200))); // 스탭
      }
    }
    return ctx.startRendering();
  }

  window.RSBGM = { PRESETS, render };
})();
