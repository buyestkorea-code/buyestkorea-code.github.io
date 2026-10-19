// BUYEST 영상 스튜디오 — ⓪ 기획·대본 탭 (웹 버전: 브라우저에서 바로 돈다)
// 서버도 API 키도 쓰지 않는다. 전부 이 브라우저 안에서 돈다.
// 훅 공식·대본 규칙·캡션 검사는 github.com/Jakeschincariol/instagram-agent-skill (MIT) 의 방식을
// BUYEST 병행수입·키즈 상황에 맞게 한국어로 다시 쓴 것이다.
(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const brandNow = () => (window.STUDIO && window.STUDIO.brand()) || "buyest";

  // ── 훅 공식 (원본 번호를 # 으로 표시) ─────────────────────────
  // {브} 브랜드 {상} 상품 {가} 가격 {백} 백화점가 {포} 포인트 첫 줄 {수} 숫자 {사} 사이즈
  const HOOKS = [
    { id: "price", name: "가격 먼저", ref: 4, t: "{가} {브} {상}, 정품일까요?", when: "가격 경쟁력이 확실할 때. 숫자가 첫 화면에 보여야 한다" },
    { id: "compare", name: "백화점과 비교", ref: 17, t: "백화점 {백} → 바이스트 {가}", when: "백화점가를 알고 있을 때. 같은 상품이라는 건 다음 비트에서" },
    { id: "real", name: "정품 의심 정면 돌파", ref: 12, t: "\"병행수입이면 가품 아니에요?\"", when: "신뢰가 핵심인 고가 상품. 다음 비트에서 18년 직거래로 답한다" },
    { id: "insider", name: "바이어의 속사정", ref: 8, t: "18년 바잉, 매 시즌 먼저 빠지는 {브}", when: "스테디셀러, 재입고 상품" },
    { id: "scarce", name: "입고 소식", ref: 19, t: "{브} {상}, 이번 시즌 {수}장 입고", when: "수량이 적은 신상 입고" },
    { id: "unbox", name: "박스 오픈부터", ref: 18, t: "밀라노에서 막 온 {브}, 같이 열어볼게요", when: "입고 박스·택이 있는 촬영본" },
    { id: "mistake", name: "사기 전 실수", ref: 7, t: "{상}, 이렇게 사면 사이즈 실패해요", when: "사이즈·핏 문의가 많은 상품" },
    { id: "question", name: "고객 질문 그대로", ref: 16, t: "\"{사}, 몇 살까지 입어요?\"", when: "키즈, DM 문의가 반복될 때" },
    { id: "list", name: "숫자 체크리스트", ref: 11, t: "{브} 사기 전 볼 {수}가지", when: "정보형, 저장 유도" },
    { id: "detail", name: "디테일 한 방", ref: 26, t: "{상}, 이 {포} 하나로 값을 해요", when: "소재·로고·마감 클로즈업이 있을 때" },
    { id: "flip", name: "통념 뒤집기", ref: 22, t: "명품 키즈는 비싸기만 하다? 절반은 틀렸어요", when: "키즈, 가격 저항이 있을 때" },
    { id: "callout", name: "대상 콕 집기", ref: 14, t: "{브} 기다리던 분, 이번 입고 보세요", when: "팬층이 확실한 브랜드" },
  ];

  // AI 티 나는 말, 과장어 (ig-human 의 slop 목록을 한국어 쇼핑 문구로 바꾼 것)
  const SLOP = ["역대급", "미쳤다", "미친", "대박", "꿀템", "무조건", "강추", "인생템", "핫한", "완벽한", "압도적", "혁신적", "놓치지 마세요", "지금 바로", "서두르세요", "가성비 甲", "갓성비"];
  // 병행수입 사업자가 조심할 표현
  const RISKY = ["최저가", "공식 수입", "공식수입", "정식 수입", "정식수입", "공식 매장", "공식매장", "공식 판매", "100% 정품 보장", "본사"];
  const BAD_OPEN = ["안녕하세요", "여러분", "스크롤 멈추", "주목", "잠깐만요", "오늘은"];

  // ── 영상 스타일 (③ 기획 영상·미르·Claude 에 붙여 넣는 프롬프트에 들어가는 화면 분위기) ─────────
  // fit: 어느 브랜드에 어울리는지 / cap: 상품 릴스·템플릿에서 추천하는 자막 모양
  const STYLES = [
    { id: "", name: "지정 안 함", fit: "both", cap: "box", prompt: "" },
    { id: "editorial", name: "클린 에디토리얼 (매거진 화보)", fit: "buyest", cap: "minimal", prompt: "매거진 화보처럼 여백을 크게 쓰고, 세리프 제목과 가는 선, 느린 줌. 컷은 적게, 한 컷을 길게. 색은 검정·아이보리·골드만." },
    { id: "gold", name: "블랙&골드 시그니처", fit: "buyest", cap: "box", prompt: "검정 배경에 골드 포인트. 상품이 어둠 속에서 빛을 받아 드러나는 조명, 느린 전환, 글자는 얇은 세리프와 넓은 자간." },
    { id: "film", name: "필름 그레인 (35mm)", fit: "both", cap: "minimal", prompt: "35mm 필름 질감: 약한 그레인, 따뜻한 톤, 살짝 번진 하이라이트, 손으로 든 듯한 미세한 흔들림. 과한 효과 없이 자연광 느낌." },
    { id: "collage", name: "종이 콜라주 (찢은 종이·테이프)", fit: "both", cap: "paper", prompt: "종이를 찢어 붙인 콜라주: 사진은 폴라로이드나 찢은 종이 조각처럼 겹치고, 테이프·스티커·손글씨 메모를 얹는다. 컷마다 종이가 툭 붙는 움직임." },
    { id: "lito", name: "리소그래프 인쇄", fit: "both", cap: "marker", prompt: "2도 리소그래프 인쇄 질감: 색이 살짝 어긋난 겹침, 거친 잉크 점, 단순한 색 두 가지로 상품을 표현." },
    { id: "silk", name: "실크스크린 포스터", fit: "both", cap: "box", prompt: "굵은 색면과 단순화한 윤곽의 실크스크린 포스터. 상품명은 크고 굵게, 배경은 한 가지 색, 컷 전환은 색면이 밀려오듯이." },
    { id: "glass", name: "광택 제품 광고 (유리·반사)", fit: "buyest", cap: "minimal", prompt: "고급 제품 광고: 매끈한 바닥 반사, 하이라이트가 훑고 지나가는 빛, 어두운 배경, 클로즈업 위주. 로고·소재 디테일을 강조." },
    { id: "vhs", name: "VHS 레트로", fit: "both", cap: "vhs", prompt: "90년대 캠코더 느낌: 주사선, 색 번짐, 타임코드 같은 작은 글자, 약간의 노이즈. 가볍고 장난스럽게." },
    { id: "water", name: "수채화 일러스트", fit: "kids", cap: "marker", prompt: "수채 물감이 번지는 배경에 상품 사진을 올린 따뜻한 느낌. 파스텔 색, 손글씨 제목, 부드러운 전환." },
    { id: "popup", name: "파스텔 팝업북", fit: "kids", cap: "paper", prompt: "종이 팝업북처럼 카드가 펼쳐지며 상품이 튀어나오는 구성. 파스텔 색, 둥근 모서리, 통통 튀는 움직임, 귀여운 스티커." },
  ];
  const styleNow = () => STYLES.find((x) => x.id === ($("#p-style") ? $("#p-style").value : "")) || STYLES[0];
  const styleLine = () => { const st = styleNow(); return st.id ? `영상 스타일: ${st.name} — ${st.prompt}` : ""; };
  window.STYLES = STYLES;

  // ── 상태 ────────────────────────────────────────────
  let beats = []; // { role, say, screen }
  const WPM = 110; // 한국어는 어절 기준 분당 100~120

  const words = (s) => (String(s).match(/[A-Za-z0-9가-힣%₩$.,'’-]+/g) || []).length;
  const secs = (s) => Math.max(0.6, (words(s) / WPM) * 60);
  const clen = (s) => String(s).replace(/[\s0-9,.₩%]/g, "").length + Math.ceil((String(s).match(/[0-9,.₩%]/g) || []).length / 3); // 숫자는 한눈에 읽히니 1/3로 센다
  const v = (id) => ($(id) ? $(id).value.trim() : "");

  function fill(t) {
    const map = { 브: v("#p-brand") || "[브랜드]", 상: v("#p-product") || "[상품]", 가: v("#p-price") || "[가격]", 백: v("#p-dept") || "[백화점가]", 포: (v("#p-points").split("\n")[0] || "[포인트]").trim(), 수: v("#p-count") || "[숫자]", 사: v("#p-size") || "[사이즈]" };
    return t.replace(/\{(브|상|가|백|포|수|사)\}/g, (_, k) => map[k]);
  }

  // ── 훅 검사 ──────────────────────────────────────────
  function hookChecks(h) {
    const out = [];
    const s = h.trim();
    if (BAD_OPEN.some((w) => s.startsWith(w))) out.push(["bad", "인사·주목 요청으로 시작 — 첫 2초에 넘겨집니다"]);
    if (/\[[^\]]+\]/.test(s)) out.push(["warn", "빈칸이 남아 있어요"]);
    if (/[0-9]/.test(s)) out.push(["ok", "숫자가 있음"]); else out.push(["warn", "숫자가 없음 (가격·연차·수량 중 하나 넣기)"]);
    if (clen(s) > 24) out.push(["warn", `화면 글자로 길어요 (${clen(s)}자 · 24자 이하 권장)`]);
    if (secs(s) > 4) out.push(["bad", `말로 ${secs(s).toFixed(1)}초 — 3초 안에 끝나야 합니다`]);
    else if (secs(s) > 3) out.push(["warn", `말로 ${secs(s).toFixed(1)}초 — 조금 줄이면 좋아요`]);
    const sl = SLOP.filter((w) => s.includes(w)); if (sl.length) out.push(["bad", "과장어: " + sl.join(", ")]);
    const rk = RISKY.filter((w) => s.includes(w)); if (rk.length) out.push(["bad", "병행수입 주의 표현: " + rk.join(", ")]);
    return out;
  }
  const badge = (c) => c.map(([k, m]) => `<span class="pc ${k}">${k === "ok" ? "✓" : k === "warn" ? "!" : "✗"} ${esc(m)}</span>`).join("");

  function renderHooks() {
    const list = $("#p-hooklist");
    list.innerHTML = HOOKS.map((h, i) => {
      const text = fill(h.t);
      return `<label class="hook"><input type="radio" name="p-hook" value="${i}"><div><b>${esc(h.name)}</b> <span class="ref">원본 #${h.ref}</span><div class="ht">${esc(text)}</div><div class="when">${esc(h.when)}</div><div>${badge(hookChecks(text))}</div></div></label>`;
    }).join("");
    list.querySelectorAll("input").forEach((r) => (r.onchange = () => { $("#p-hook").value = fill(HOOKS[r.value].t); onHookEdit(); }));
  }
  function onHookEdit() {
    $("#p-hookcheck").innerHTML = badge(hookChecks($("#p-hook").value));
  }

  // ── 대본 비트 만들기 ─────────────────────────────────
  function buildBeats() {
    const hook = v("#p-hook") || fill(HOOKS[0].t);
    const points = v("#p-points").split("\n").map((s) => s.trim()).filter(Boolean);
    const kids = brandNow() === "kids";
    const brand = v("#p-brand") || "[브랜드]";
    beats = [
      { role: "훅 0~2초", say: hook, screen: hook },
      { role: "왜 중요한지", say: kids ? "아이 옷이라 소재랑 사이즈부터 보셔야 해요." : "같은 정품인데 가격이 다른 이유, 바로 보여드릴게요.", screen: kids ? "소재·사이즈부터" : "가격이 다른 이유" },
      ...points.slice(0, 4).map((p) => ({ role: "근거", say: p, screen: p.length > 16 ? p.slice(0, 16) : p })),
      { role: "요청 하나", say: v("#p-cta") ? `${v("#p-cta")}` : "궁금하면 댓글에 '사이즈' 남겨 주세요.", screen: v("#p-cta") || "댓글에 '사이즈'" },
    ];
    if (points.length === 0) beats.splice(2, 0, { role: "근거", say: `18년째 이탈리아 부티크에서 직접 들여오는 ${brand}입니다.`, screen: "이탈리아 직수입" });
    renderBeats();
  }

  function renderBeats() {
    $("#p-beats").innerHTML = beats.map((b, i) => `
      <div class="beat"><div class="br"><b>${i + 1}. ${esc(b.role)}</b><span class="bt" id="bt${i}"></span><button class="mini" data-del="${i}" title="삭제">✕</button></div>
      <div class="bg"><div><label>말 (내레이션)</label><textarea data-i="${i}" data-k="say" rows="2">${esc(b.say)}</textarea></div>
      <div><label>화면 글자 (카드 하나에 짧게)</label><textarea data-i="${i}" data-k="screen" rows="2">${esc(b.screen)}</textarea></div></div></div>`).join("")
      + `<button class="mini" id="p-addbeat">+ 비트 추가</button>`;
    $("#p-beats").querySelectorAll("textarea").forEach((t) => (t.oninput = () => { beats[t.dataset.i][t.dataset.k] = t.value; timing(); }));
    $("#p-beats").querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => { beats.splice(b.dataset.del, 1); renderBeats(); }));
    $("#p-addbeat").onclick = () => { beats.splice(beats.length - 1, 0, { role: "근거", say: "", screen: "" }); renderBeats(); };
    timing();
  }

  // ── 시간표 + 경고 (beats.py 의 네 가지 검사) ─────────────
  function timing() {
    let t = 0; const warn = [];
    beats.forEach((b, i) => {
      const s = secs(b.say); const el = $("#bt" + i);
      if (el) el.textContent = `${t.toFixed(1)}초 → ${(t + s).toFixed(1)}초 (${s.toFixed(1)}초)`;
      if (i === 0 && s > 3) warn.push([s > 4 ? "bad" : "warn", `훅이 ${s.toFixed(1)}초 — 3초 안으로 줄이기`]);
      if (i > 0 && s > 4) warn.push(["warn", `${i + 1}번 비트가 ${s.toFixed(1)}초 — 나누거나 그 사이 화면을 바꾸기`]);
      const lim = i === 0 ? 24 : 16;
      if (clen(b.screen) > lim) warn.push(["warn", `${i + 1}번 화면 글자가 김 (${lim}자 이하 권장)`]);
      t += s;
    });
    const mid = beats.slice(1, -1);
    if (mid.length && !mid.some((b) => /[0-9]|[A-Z][a-z]+|₩/.test(b.say))) warn.push(["warn", "중간 비트에 숫자·이름·가격이 하나도 없음"]);
    const first = new Set((beats[0]?.say.match(/[가-힣A-Za-z0-9]{2,}/g) || []));
    const last = beats[beats.length - 1]?.say.match(/[가-힣A-Za-z0-9]{2,}/g) || [];
    // 한국어는 조사가 붙으므로 앞 두 글자로 비교 (정품일까요 ↔ 정품인지)
    const stem = (w) => w.slice(0, 2);
    const firstStems = new Set([...first].map(stem));
    if (beats.length > 1 && !last.some((w) => firstStems.has(stem(w)))) warn.push(["warn", "마지막 줄이 훅의 낱말을 다시 말하지 않음 — 훅 단어 하나를 넣으면 다시 보기가 늘어요"]);
    const target = Number(v("#p-len")) || 20;
    if (t > target + 3) warn.push(["warn", `총 ${t.toFixed(1)}초로 목표(${target}초)보다 깁니다`]);
    if (t < target - 8) warn.push(["ok", `총 ${t.toFixed(1)}초 — 목표보다 짧으면 짧게 찍는 게 보통 낫습니다`]);
    $("#p-timing").innerHTML = `<b>총 ${t.toFixed(1)}초</b> · 어절 ${beats.reduce((a, b) => a + words(b.say), 0)}개 · 분당 ${WPM}어절 기준 ${badge(warn.length ? warn : [["ok", "문제 없음"]])}`;
    caption(false);
  }

  // ── 캡션 (ig-caption 규칙) ───────────────────────────
  function draftCaption() {
    const kids = brandNow() === "kids";
    const brand = v("#p-brand"), product = v("#p-product"), price = v("#p-price");
    const kw = (v("#p-keyword") || "사이즈").replace(/['"]/g, "");
    const first = `${brand} ${product}${price ? ` ${price}` : ""} — 댓글에 '${kw}' 남기시면 정보 보내드려요.`;
    const pts = v("#p-points").split("\n").map((s) => s.trim()).filter(Boolean).map((s) => "· " + s).join("\n");
    const body = kids
      ? `아이 옷이라 소재와 사이즈를 먼저 확인했어요.\n${pts}`
      : `이탈리아 부티크에서 직접 들여온 정품입니다.\n${pts}`;
    const search = kids ? `${brand} 키즈 ${product}, 아이 명품 선물 찾으시는 분께` : `${brand} ${product} 병행수입 정품 찾으시는 분께`;
    const tags = [brand && "#" + brand.replace(/\s/g, ""), kids ? "#바이스트키즈" : "#바이스트", kids ? "#키즈명품" : "#병행수입"].filter(Boolean).join(" ");
    $("#p-caption").value = `${first}\n\n${body}\n\n${search}.\n\n${tags}`;
    caption(true);
  }
  function caption() {
    const c = $("#p-caption").value;
    const flat = c.replace(/\n/g, " ");
    $("#p-cap125").innerHTML = `<span>${esc(flat.slice(0, 125))}</span><span class="more">${flat.length > 125 ? "… 더 보기" : ""}</span>`;
    const w = [];
    const head = flat.slice(0, 125);
    if (!/댓글|DM|저장|프로필/.test(head)) w.push(["warn", "앞 125자 안에 요청(댓글·DM·저장)이 없음"]);
    const asks = (c.match(/댓글에|DM|디엠|저장해|프로필 링크|링크 클릭/g) || []).length; if (asks > 2) w.push(["warn", `요청이 ${asks}개 — 하나만 남기기`]);
    if (/https?:\/\/|www\./.test(c)) w.push(["bad", "캡션 속 링크는 눌리지 않습니다"]);
    const tags = (c.match(/#[^\s#]+/g) || []).length; if (tags > 5) w.push(["warn", `해시태그 ${tags}개 — 5개 이하`]);
    const sl = SLOP.filter((x) => c.includes(x)); if (sl.length) w.push(["bad", "과장어: " + sl.join(", ")]);
    const rk = RISKY.filter((x) => c.includes(x)); if (rk.length) w.push(["bad", "병행수입 주의 표현: " + rk.join(", ")]);
    if (/\[[^\]]+\]/.test(c)) w.push(["warn", "빈칸이 남아 있어요"]);
    $("#p-capcheck").innerHTML = `${c.length}자 ` + badge(w.length ? w : [["ok", "문제 없음"]]);
  }

  // ── Claude·미르·OpenMontage 에 붙여 넣을 프롬프트 ─────────
  function voiceRules() {
    const kids = brandNow() === "kids";
    return [
      `브랜드: ${kids ? "BUYEST Kids (디자이너 키즈 편집숍)" : "BUYEST (명품 병행수입 편집숍)"} — 대구, 18년째 이탈리아 부티크와 직거래, KREAM 입점.`,
      kids ? "톤: 따뜻하고 가볍게, 부모 시선(소재·사이즈·선물)." : "톤: 차분하고 신뢰감 있게, 과장 없이. 핵심은 정품 신뢰 + 합리적 가격.",
      `쓰지 말 것: ${SLOP.slice(0, 10).join(", ")} 같은 과장어 / ${RISKY.slice(0, 6).join(", ")} 같은 표현(공식 수입원으로 오해될 말, 근거 없는 최저가).`,
      "가격·수량 등 숫자는 내가 준 것만 쓰고, 없으면 [빈칸]으로 남길 것. 거래 부티크 이름·매입가는 쓰지 말 것.",
      styleLine(),
    ].filter(Boolean).join("\n");
  }
  function info() {
    return [
      `브랜드: ${v("#p-brand") || "[브랜드]"} / 상품: ${v("#p-product") || "[상품]"} / 가격: ${v("#p-price") || "[가격]"}${v("#p-dept") ? ` (백화점가 ${v("#p-dept")})` : ""}`,
      v("#p-points") ? `상품 포인트:\n${v("#p-points")}` : "",
      v("#p-story") ? `이번에 실제로 있었던 일: ${v("#p-story")}` : "",
    ].filter(Boolean).join("\n");
  }
  const scriptText = () => beats.map((b, i) => `${i + 1}. [${b.role}] 말: ${b.say} / 화면: ${b.screen}`).join("\n");

  const PROMPTS = {
    plan: () => `인스타 릴스 한 주 계획을 짜 줘.\n\n${voiceRules()}\n\n${info()}\n\n조건\n- 주 4~5개, 그중 릴스 3개 이상. 같은 형식을 연달아 두지 말 것\n- 칸마다: 요일 · 주제 · 이번 주 실제 있었던 일에서 뽑은 각도 · 형식(릴스/캐러셀/스토리) · 훅 공식\n- 훅 공식은 이 중에서 고를 것: ${HOOKS.map((h) => h.name).join(", ")}\n- 올리는 시간보다 첫 2초가 중요하다는 전제로 훅을 먼저 써 줄 것`,
    script: () => `아래 릴스 대본을 다듬어 줘.\n\n${voiceRules()}\n\n${info()}\n\n현재 대본 (목표 ${v("#p-len") || 20}초):\n${scriptText()}\n\n규칙\n- 0~2초 훅은 말과 화면 글자를 따로 쓰고, 3초 안에 끝낼 것\n- 한 비트에 생각 하나, 비트마다 화면이 바뀌게\n- 화면 글자는 카드당 16자 이하\n- 마지막 줄은 훅의 낱말 하나를 다시 말해 다시 보기로 이을 것\n- 요청은 하나만\n- 훅 후보를 3개 더 주고 각각 왜 먹히는지 한 줄씩`,
    caption: () => `이 릴스 캡션을 써 줘.\n\n${voiceRules()}\n\n${info()}\n\n대본:\n${scriptText()}\n\n규칙\n- 피드에 보이는 앞 125자 안에 핵심과 요청 하나('${v("#p-keyword") || "사이즈"}' 댓글)를 넣을 것\n- 캡션 속 링크 금지(눌리지 않음)\n- 검색어는 해시태그 대신 사람이 칠 법한 말로 문장 안에\n- 해시태그는 주제 이름표로 3~5개\n- 앞 125자를 따로 상자로 먼저 보여 줄 것`,
    mirr: () => `미르(Mirr)로 인스타 릴스를 만들어 줘. 업로드·예약은 하지 마.\n\n${voiceRules()}\n\n${info()}\n\n승인된 대본 (그대로 쓸 것, 미르 자동 대본으로 바꾸지 말 것):\n${scriptText()}\n\n순서\n1. shorts_generate_script: 9:16, 한국어, ${v("#p-len") || 20}초\n2. 미르 대본이 위와 다르면 shorts_update_script_field 로 위 대본으로 덮어쓰기\n3. shorts_generate_scenes: 장면별 화면 글자는 위의 '화면' 사용${$("#r-files") && $("#r-files").files.length ? " / 상품 사진을 넣을 수 있으면 첨부한 사진 사용" : ""}\n4. shorts_generate_music: ${brandNow() === "kids" ? "밝고 가볍게" : "차분하고 고급스럽게"}\n5. 렌더 전에 장면 수·길이·음악·예상 크레딧을 보여 주고 내가 '렌더해' 하면 shorts_render_video`,
    montage: () => `${info()}\n\n${voiceRules()}\n\n대본 (${v("#p-len") || 20}초, Instagram Reels 9:16):\n${scriptText()}\n\n화면 글자는 대본의 '화면'을 그대로 쓰고, BGM은 ${brandNow() === "kids" ? "밝고 가볍게" : "차분하고 고급스럽게"}.`,
  };

  async function copy(text, btn) {
    try { await navigator.clipboard.writeText(text); } catch (_) {
      const ta = document.createElement("textarea"); ta.value = text; document.body.append(ta); ta.select(); document.execCommand("copy"); ta.remove();
    }
    const old = btn.textContent; btn.textContent = "복사됨 ✓"; setTimeout(() => (btn.textContent = old), 1400);
  }

  // ── ① 상품 릴스로 넘기기 ───────────────────────────────
  function toReel() {
    if (!beats.length) buildBeats();
    $("#r-brandName").value = v("#p-brand");
    $("#r-productName").value = v("#p-product");
    $("#r-price").value = v("#p-price");
    $("#r-cta").value = beats[beats.length - 1]?.screen || $("#r-cta").value;
    $("#r-hook").value = beats[0]?.screen || "";
    $("#r-lines").value = beats.slice(1, -1).map((b) => b.screen).filter(Boolean).join("\n");
    if (styleNow().id && $("#r-cap")) $("#r-cap").value = styleNow().cap;
    window.STUDIO.openTab("reel");
    $("#r-hook").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // ── 임시 저장 (이 PC 브라우저에만, 최근 10개) ─────────────
  const KEY = "buyest-planner-drafts";
  const FIELDS = ["#p-brand", "#p-product", "#p-price", "#p-dept", "#p-count", "#p-size", "#p-points", "#p-story", "#p-cta", "#p-keyword", "#p-len", "#p-hook", "#p-caption", "#p-style"];
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (_) { return []; } };
  function save() {
    const now = new Date(); const pad = (n) => String(n).padStart(2, "0");
    const d = { at: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`, brand: brandNow(), beats, f: Object.fromEntries(FIELDS.map((k) => [k, $(k).value])) };
    const list = [d, ...load()].slice(0, 10);
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (_) { alert("이 브라우저에서는 임시 저장을 쓸 수 없어요"); }
    drafts();
  }
  function drafts() {
    const list = load();
    $("#p-drafts").innerHTML = `<option value="">불러오기 (최근 ${list.length}개)</option>` + list.map((d, i) => `<option value="${i}">${d.at.slice(5, 16).replace("T", " ")} · ${esc(d.f["#p-brand"])} ${esc(d.f["#p-product"])}</option>`).join("");
  }
  function restore(i) {
    const d = load()[i]; if (!d) return;
    if (d.brand && window.STUDIO) window.STUDIO.setBrand(d.brand);
    FIELDS.forEach((k) => ($(k).value = d.f[k] ?? ""));
    beats = d.beats || []; renderHooks(); onHookEdit(); renderBeats();
  }

  // ── 연결 ───────────────────────────────────────────
  window.addEventListener("DOMContentLoaded", () => {
    ["#p-brand", "#p-product", "#p-price", "#p-dept", "#p-count", "#p-size", "#p-points"].forEach((id) => $(id).addEventListener("input", renderHooks));
    $("#p-hook").oninput = onHookEdit;
    $("#p-len").oninput = timing;
    $("#p-build").onclick = () => { buildBeats(); draftCaption(); $("#p-step2").scrollIntoView({ behavior: "smooth" }); };
    $("#p-caption").oninput = () => caption();
    $("#p-capdraft").onclick = draftCaption;
    $("#p-capcopy").onclick = (e) => copy($("#p-caption").value, e.target);
    $("#p-captxt").onclick = () => {
      const blob = new Blob([`[대본]\n${scriptText()}\n\n[캡션]\n${$("#p-caption").value}\n`], { type: "text/plain;charset=utf-8" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = `${brandNow() === "kids" ? "BUYESTKids" : "BUYEST"}_${(v("#p-product") || "릴스").replace(/[\\/:*?"<>|\s]/g, "_")}_대본캡션.txt`; a.click();
    };
    document.querySelectorAll("[data-prompt]").forEach((b) => (b.onclick = () => { if (!beats.length) buildBeats(); copy(PROMPTS[b.dataset.prompt](), b); }));
    $("#p-tomontage").onclick = () => { if (!beats.length) buildBeats(); $("#m-brief").value = PROMPTS.montage(); window.STUDIO.openTab("montage"); };
    $("#p-toreel").onclick = toReel;
    $("#p-save").onclick = save;
    $("#p-drafts").onchange = (e) => e.target.value !== "" && restore(e.target.value);
    document.addEventListener("brandchange", () => { renderHooks(); if (beats.length) timing(); });
    const fillStyles = () => {
      const b = brandNow(); const cur = ($("#p-style") || {}).value || "";
      const opts = STYLES.filter((x) => x.fit === "both" || x.fit === b).map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("");
      ["#p-style", "#m-style"].forEach((id) => { const el = $(id); if (el) { el.innerHTML = opts; el.value = STYLES.some((x) => x.id === cur && (x.fit === "both" || x.fit === b)) ? cur : ""; } });
    };
    const syncStyle = (e) => { ["#p-style", "#m-style"].forEach((id) => { const el = $(id); if (el && el !== e.target) el.value = e.target.value; }); };
    ["#p-style", "#m-style"].forEach((id) => { if ($(id)) $(id).onchange = syncStyle; });
    document.addEventListener("brandchange", fillStyles);
    fillStyles();
    renderHooks(); onHookEdit(); drafts(); caption();
  });
})();
