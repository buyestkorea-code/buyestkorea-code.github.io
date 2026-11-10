/**
 * BUYEST 상품명 AI 자동생성 Worker
 *
 * 상품 사진 1~3장 + 힌트(브랜드·시즌·품번·성인/키즈) → 바이스트 상품명 후보 4개.
 * 학습자료(namebook.json) = 메인·키즈 사이트의 실제 상품명 2만 3천여 개에서 뽑은 어휘·브랜드별 작명 예시.
 * 키는 이 Worker 의 비밀값에만 둔다 (화면 코드·저장소·채팅에 쓰지 말 것):  npx wrangler secret put GROQ_API_KEY  /  GEMINI_API_KEY
 * AI 는 PROVIDERS(기본 "groq,gemini") 순서대로 시도하고, 붐비거나 막히면 다음 AI 로 자동으로 넘어간다.
 *
 *   GET  /api/health    설정 상태 (키가 있는지 여부만)
 *   POST /api/cs        { q, prod, shop, label, facts, draft, examples:[{q,a}] }  →  { answer, needs_staff, reason }   (고객 문의 답변 초안 — 문의 답변 도우미)
 *   POST /api/names     { images:[dataURL...], brand, season, code, kind:"auto|adult|kids", hint }  →  { candidates:[{name, note}], usage }
 *
 * 접근 통제: 헤더 X-Studio-User / X-Studio-Pass 를 buyest.co.kr 툴키트 로그인으로 확인한다 (health 제외).
 */
const ALLOWED_ORIGIN = "https://buyestkorea-code.github.io";
const LOGIN_API = "https://buyest.co.kr/toolkit_dashboard_api.php";
const VERSION = "1.3.1";

const cors = () => ({
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,X-Studio-User,X-Studio-Pass,X-Studio-Enc",
  "Access-Control-Max-Age": "600",
  Vary: "Origin",
});
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...cors() } });
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (s) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));

// ── 직원 로그인 확인 (10분 기억) ───────────────────────
const loginCache = new Map();
async function requireStaff(request) {
  let user = (request.headers.get("X-Studio-User") || "").trim();
  let pass = request.headers.get("X-Studio-Pass") || "";
  // 한글 ID/비밀번호는 헤더에 그대로 못 실으므로 클라이언트가 URL 인코딩해서 보냄 (X-Studio-Enc: 1)
  if (request.headers.get("X-Studio-Enc") === "1") {
    try { user = decodeURIComponent(user).trim(); pass = decodeURIComponent(pass); } catch (e) {}
  }
  if (!user || !pass) throw new HttpError(401, "로그인이 필요합니다. 툴키트에서 로그인한 뒤 새로고침해 주세요.");
  const key = user + ":" + (await sha256(pass));
  const hit = loginCache.get(key);
  if (hit && hit > Date.now()) return user;
  let res;
  try {
    const r = await fetch(LOGIN_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "login", user, pass }) });
    res = await r.json();
  } catch (_) { throw new HttpError(503, "직원 로그인 서버에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요."); }
  if (!res || !res.ok) throw new HttpError(401, "직원 로그인 확인에 실패했습니다. 툴키트에 다시 로그인해 주세요.");
  loginCache.set(key, Date.now() + 10 * 60 * 1000);
  if (loginCache.size > 200) loginCache.clear();
  return user;
}

async function spend(env, user) {
  if (!env.NAMEGEN_KV) return;
  const limit = Number(env.LIMIT_PER_DAY) || 150;
  const day = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const key = `name:${day}:${user}`;
  const used = Number(await env.NAMEGEN_KV.get(key)) || 0;
  if (used + 1 > limit) throw new HttpError(429, `오늘 사용 한도(${limit}회)를 넘었습니다. 내일 다시 사용해 주세요.`);
  await env.NAMEGEN_KV.put(key, String(used + 1), { expirationTtl: 2 * 86400 });
}

// ── 학습자료 (1시간 기억) ──────────────────────────────
let bookCache = { at: 0, data: null };
async function getBook(env) {
  if (bookCache.data && Date.now() - bookCache.at < 3600e3) return bookCache.data;
  let r;
  try { r = await fetch(env.NAMEBOOK_URL, { cf: { cacheTtl: 600 } }); } catch (_) { r = null; }
  if (!r || !r.ok) { if (bookCache.data) return bookCache.data; throw new HttpError(503, "상품명 학습자료를 불러오지 못했습니다."); }
  bookCache = { at: Date.now(), data: await r.json() };
  return bookCache.data;
}
const normBrand = (s) => String(s || "").replace(/\s+/g, "").toLowerCase();
function brandProfile(book, brand) {
  const k = normBrand(brand);
  if (!k) return null;
  for (const [name, v] of Object.entries(book.brands)) if (normBrand(name) === k) return { name, ...v };
  for (const [name, v] of Object.entries(book.brands)) if (normBrand(name).includes(k) || k.includes(normBrand(name))) return { name, ...v };
  return null;
}

// ── 지시문 (모든 요청에 같은 내용 → 캐시) ───────────────
// compact: 한 번에 보낼 수 있는 글자 수가 작은 무료 AI(Groq)용으로 어휘·예시를 줄인 지시문
function systemPrompt(book, compact) {
  const colors = book.colors.slice(0, compact ? 30 : 999).map((c) => c[0]).join(", ");
  const items = book.items.slice(0, compact ? 50 : 999).map((c) => c[0]).join(", ");
  const mods = book.mods.slice(0, compact ? 40 : 999).map((c) => c[0]).join(", ");
  const ex = (s) => book.examples.filter((e) => e.s === s).slice(0, compact ? 14 : 999).map((e) => e.n).join("\n");
  return `당신은 해외 명품·디자이너 브랜드 병행수입 쇼핑몰 "바이스트(BUYEST)"와 키즈 사이트의 상품명 작성자입니다.
상품 사진을 보고, 이 쇼핑몰의 기존 상품명(총 ${book.total.toLocaleString()}개, 메인 ${book.main.toLocaleString()} · 키즈 ${book.kids.toLocaleString()})과 똑같은 문법으로 상품명 후보 4개를 만듭니다.

## 상품명 문법 (실제 상품명에서 확인된 규칙)
형식: [시즌] [키즈|여성 등 대상] [모델명·디테일 설명 …] [아이템] [색상] [품번]
- 시즌은 "26SS", "25FW" 처럼 연도 두 자리 + SS/FW. 사용자가 알려주면 그대로 맨 앞에. 모르면 쓰지 않는다.
- 브랜드명은 상품명에 넣지 않는다 (별도 칸). 후보에는 브랜드를 쓰지 마세요.
- 아이템과 색상은 반드시 한글. 색상은 항상 아이템 바로 뒤, 품번 바로 앞.
- 디테일은 짧은 한글 단어 1~4개를 앞에 나열 (예: "로고 패치", "와펜 심리스", "자수", "나일론", "기모"). 브랜드 고유 모델명이 사진·힌트로 확실할 때만 "란스 LANS"처럼 한글+영문 병기.
- 키즈 상품은 시즌 뒤에 "키즈"를 넣는 것이 관행. 성인 여성 라인은 "여성"을 넣는 경우가 있음. 대상 구분이 없으면 생략.
- 품번은 name 에 포함하지 않는다 (프로그램이 맨 끝에 붙임) — name 은 "시즌 … 색상"까지만.
- 한 상품명은 보통 한글 단어 3~8개. 과장 수식어(최고급, 인기 등)·이모지·특수문자·괄호 금지.

## 자주 쓰는 아이템 단어 (빈도순)
${items}

## 자주 쓰는 색상 단어 (빈도순)
${colors}

## 자주 쓰는 디테일 단어 (빈도순)
${mods}

## 실제 상품명 예시 — 성인/메인
${ex("m")}

## 실제 상품명 예시 — 키즈
${ex("k")}

## 작업 방식
1. 사진에서 아이템 종류, 색상, 눈에 보이는 디테일(로고 위치·패치·자수·소재감·실루엣)을 판단한다. 위 어휘 목록에 있는 단어를 우선 쓴다.
2. 후보 4개는 서로 달라야 한다: ① 간결형(디테일 1~2개) ② 표준형(디테일 2~3개, 가장 흔한 쇼핑몰 문법) ③ 디테일 강조형 ④ 대안 표현형(같은 아이템의 다른 표기: 예 "자켓/재킷", "후드티/후드 티셔츠" 중 이 쇼핑몰에서 더 흔한 쪽을 우선).
3. 사진으로 확신할 수 없는 정보(소재, 모델명, 정확한 색상명)는 단정하지 말고, note 에 "확인 필요: …"로 짧게 적는다.
4. "다른 판매처의 상품명"이 참고로 주어지면 베끼지 말고 공통 정보(모델명·소재·디테일·품번)만 활용한다. 참고가 없으면 사진만 보고 만든다.
5. 같은 브랜드의 예시가 주어지면 그 브랜드의 작명 습관(디테일 단어, 모델명 표기법)을 따른다.

## 출력 형식 (이것만 출력, 설명 금지)
{"item":"판단한 아이템","color":"판단한 색상","codeGuess":"참고 이름에서 찾은 품번 또는 빈 문자열","candidates":[{"name":"시즌 … 색상","note":"한 줄 메모(없으면 빈 문자열)"},{...},{...},{...}]}`;
}

function parseDataUrl(u) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(typeof u === "string" ? u : "");
  if (!m) throw new HttpError(400, "사진 형식이 올바르지 않습니다 (jpg · png · webp 만 가능)");
  if (m[2].length > 2500000) throw new HttpError(400, "사진 한 장이 너무 큽니다. 더 작은 사진으로 시도해 주세요.");
  return { mime: m[1], b64: m[2], url: u };
}
const clean = (s, n = 60) => String(s || "").replace(/[\r\n\t]+/g, " ").slice(0, n).trim();
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

// ── AI 서비스 호출 (각각 { text } 를 돌려주고, 실패하면 ProviderError) ─────
class ProviderError extends Error { constructor(provider, status, message) { super(message); this.provider = provider; this.status = status; } }

async function callGemini(env, system, userText, images, opts = {}) {
  const model = opts.model || env.GEMINI_MODEL || "gemini-3.8-flash";
  const payload = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [...images.map((i) => ({ inline_data: { mime_type: i.mime, data: i.b64 } })), { text: userText }] }],
    generationConfig: { temperature: opts.temperature != null ? opts.temperature : 0.7, maxOutputTokens: opts.maxTokens || 4096, responseMimeType: "application/json" },
  };
  if (opts.fast) payload.generationConfig.thinkingConfig = { thinkingBudget: 0 }; // 짧은 선별 작업은 '생각' 없이 바로 답하게 (훨씬 빠름)
  let r, d;
  for (let attempt = 0; attempt < 3; attempt++) { // 일시 과부하는 한 번만 더 시도하고 다른 AI 로 넘어간다
    if (attempt) await sleep(1200);
    if (attempt === 2) delete payload.generationConfig.thinkingConfig; // 이 모델이 thinkingConfig 를 거부하면 빼고 재시도
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": String(env.GEMINI_API_KEY).trim() }, body: JSON.stringify(payload),
        signal: opts.fast ? AbortSignal.timeout(25000) : undefined, // 짧은 작업이 25초 넘게 걸리면 끊고 다시
      });
    } catch (_) { if (attempt < 2) continue; throw new ProviderError("Gemini", 502, "연결 실패(시간 초과)"); }
    d = await r.json().catch(() => ({}));
    if (![500, 503, 504, 524].includes(r.status) && !(r.status === 400 && opts.fast && attempt < 2)) break;
  }
  if (!r.ok) throw new ProviderError("Gemini", r.status, String((d && d.error && d.error.message) || "").slice(0, 140));
  return { text: ((((d.candidates || [])[0] || {}).content || {}).parts || []).map((c) => c.text || "").join("") };
}

// Groq: OpenAI 호환 주소. 사진을 읽는 모델(기본 Llama 4 Scout)을 쓴다.
async function callGroq(env, system, userText, images, opts = {}) {
  const model = env.GROQ_MODEL || "qwen/qwen3.8-27b";
  const payload = {
    model, temperature: 0.7, max_tokens: opts.maxTokens || 6000, response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: [...images.slice(0, 1).map((i) => ({ type: "image_url", image_url: { url: i.url } })), { type: "text", text: userText }] },
    ],
  };
  let r, d;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await sleep(1200);
    try {
      r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + String(env.GROQ_API_KEY).trim() }, body: JSON.stringify(payload),
      });
    } catch (_) { if (attempt < 1) continue; throw new ProviderError("Groq", 502, "연결 실패"); }
    d = await r.json().catch(() => ({}));
    if (r.status !== 500 && r.status !== 503) break;
  }
  if (!r.ok) throw new ProviderError("Groq", r.status, String((d && d.error && d.error.message) || "").slice(0, 320));
  return { text: String(((((d.choices || [])[0] || {}).message) || {}).content || "") };
}

const PROVIDERS = {
  groq: { name: "Groq", key: "GROQ_API_KEY", call: callGroq, compact: true },
  gemini: { name: "Gemini", key: "GEMINI_API_KEY", call: callGemini, compact: false },
};
const providerOrder = (env) => String(env.PROVIDERS || "groq,gemini").split(",").map((s) => s.trim()).filter((k) => PROVIDERS[k] && env[PROVIDERS[k].key]);

// ── 구글 이미지 검색 (Serper Lens) ──────────────────────
// 구글 이미지 검색은 사진의 "인터넷 주소"가 필요하다 → 올린 사진을 KV 에 10분만 맡겨 두고 /i/<id> 주소로 열어 준다 (id 는 추측 불가능한 24자리).
const hasHangul = (s) => /[가-힣]/.test(s);
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (_) { return ""; } };

async function serveTempImage(env, id) {
  if (!env.NAMEGEN_KV || !/^[0-9a-f]{24}$/.test(id)) return new Response("not found", { status: 404 });
  const hit = await env.NAMEGEN_KV.getWithMetadata("img:" + id, "arrayBuffer");
  if (!hit || !hit.value) return new Response("not found", { status: 404 });
  return new Response(hit.value, { headers: { "Content-Type": (hit.metadata && hit.metadata.type) || "image/jpeg", "Cache-Control": "private, max-age=600" } });
}

// 결과: { used, refs:[{title,source,link}], error? } — 실패해도 예외를 던지지 않고 사유만 돌려준다 (그러면 사진만으로 만든다)
async function runLens(env, request, dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return { used: false, error: "사진 형식" };
  const id = hex(crypto.getRandomValues(new Uint8Array(12)));
  const key = "img:" + id;
  try {
    const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
    await env.NAMEGEN_KV.put(key, bytes, { expirationTtl: 600, metadata: { type: m[1] } });
    const imgUrl = new URL(request.url).origin + "/i/" + id;
    const r = await fetch("https://google.serper.dev/lens", {
      method: "POST",
      headers: { "X-API-KEY": String(env.SERPER_KEY).trim(), "Content-Type": "application/json" },
      body: JSON.stringify({ url: imgUrl, gl: "kr", hl: "ko" }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { used: false, error: `검색 서비스 ${r.status} ${String((d && (d.message || d.error)) || "").slice(0, 100)}` };
    // 응답 안의 목록(organic·visual_matches·products …)에서 title 이 있는 항목을 모두 모은다
    const seen = new Set(), all = [];
    for (const v of Object.values(d || {})) {
      if (!Array.isArray(v)) continue;
      for (const it of v) {
        if (!it || typeof it.title !== "string") continue;
        const title = it.title.replace(/\s+/g, " ").trim();
        if (title.length < 4 || seen.has(title)) continue;
        seen.add(title);
        const link = typeof it.link === "string" ? it.link : (typeof it.url === "string" ? it.url : "");
        all.push({ title: title.slice(0, 120), source: String(it.source || hostOf(link)).slice(0, 40), link: link.slice(0, 300) });
      }
    }
    const ko = all.filter((x) => hasHangul(x.title)), other = all.filter((x) => !hasHangul(x.title));
    const refs = [...ko.slice(0, 10), ...other.slice(0, 4)];
    return { used: refs.length > 0, refs, total: all.length, korean: ko.length, error: refs.length ? undefined : "비슷한 상품을 찾지 못함" };
  } catch (e) {
    return { used: false, error: "이미지 검색 실패: " + String((e && e.message) || e).slice(0, 80) };
  } finally {
    try { await env.NAMEGEN_KV.delete(key); } catch (_) { /* 10분 뒤 자동 삭제 */ }
  }
}

async function handleNames(request, env) {
  const order = providerOrder(env);
  if (!order.length) throw new HttpError(503, "AI 키가 아직 등록되지 않았습니다. 관리자에게 알려 주세요.");
  const user = await requireStaff(request);
  let body;
  try { body = await request.json(); } catch (_) { throw new HttpError(400, "요청 형식이 올바르지 않습니다."); }
  const imgs = Array.isArray(body.images) ? body.images.slice(0, 3) : [];
  if (!imgs.length) throw new HttpError(400, "사진을 먼저 올려 주세요.");
  const images = imgs.map(parseDataUrl);
  await spend(env, user);

  const book = await getBook(env);
  const brand = clean(body.brand, 40), season = clean(body.season, 12), code = clean(body.code, 60), hint = clean(body.hint, 200);
  const kind = ["adult", "kids"].includes(body.kind) ? body.kind : "auto";
  const prof = brandProfile(book, brand);
  const lines = [];
  lines.push(`대상 사이트: ${kind === "kids" ? "키즈 (시즌 뒤에 '키즈' 표기)" : kind === "adult" ? "메인/성인" : "사진으로 판단 (아이 옷·아이 사이즈로 보이면 키즈)"}`);
  lines.push(`브랜드: ${brand || "(미입력 — 사진에서 로고가 보여도 name 에는 쓰지 않음)"}`);
  lines.push(`시즌: ${season || "(미입력 — 쓰지 않음)"}`);
  lines.push(`품번: ${code || "(미입력)"} ← name 에는 넣지 않음`);
  if (hint) lines.push(`직원 메모: ${hint}`);
  if (prof) {
    lines.push(`\n[${prof.name}] 브랜드의 실제 상품명 예시 (이 브랜드 상품 ${prof.n}개 중 최근·대표):\n` + prof.ex.join("\n"));
    if (prof.items && prof.items.length) lines.push(`이 브랜드에서 많이 파는 아이템: ${prof.items.join(", ")}`);
  }
  lines.push(`\n위 사진(${images.length}장은 같은 상품)을 보고 JSON 으로만 답하세요.`);
  // 구글 이미지 검색 (켜져 있고 검색 키·임시 저장소가 있을 때만). 실패해도 사진만으로 계속한다.
  let lens = { used: false };
  if (body.lens !== false) {
    if (!env.SERPER_KEY) lens = { used: false, error: "검색 키 미등록" };
    else if (!env.NAMEGEN_KV) lens = { used: false, error: "임시 저장소 미연결" };
    else lens = await runLens(env, request, imgs[0]);
  }
  if (lens.used) {
    lines.push("\n[구글 이미지 검색으로 찾은 다른 판매처의 상품명 — 참고용]\n" + lens.refs.slice(0, 12).map((x) => "- " + x.title + (x.source ? " (" + x.source + ")" : "")).join("\n"));
    lines.push("위 이름을 그대로 베끼지 말고, 여러 곳에 공통으로 나오는 모델명·소재·디테일·품번만 뽑아 바이스트 문법으로 새로 쓰세요. 사진과 다르면 사진을 믿으세요. 같은 품번처럼 보이는 문자열이 여러 곳에서 반복되면 codeGuess 에 적고, 확실치 않으면 빈 문자열로 두세요.");
  }
  const userText = lines.join("\n");

  // 순서대로 시도: 한 곳이 붐비거나 막히면 바로 다음 AI 로 넘어간다
  const errs = [];
  let out = null, used = "";
  for (const k of order) {
    const p = PROVIDERS[k];
    try {
      const res = await p.call(env, systemPrompt(book, p.compact), userText, images);
      const txt = res.text.replace(/<think>[\s\S]*?<\/think>/g, ""); // 생각 과정 글 제거
      const m = /\{[\s\S]*\}/.exec(txt);
      const parsed = JSON.parse(m ? m[0] : txt);
      if (!Array.isArray(parsed.candidates) || !parsed.candidates.some((c) => c && c.name)) throw new ProviderError(p.name, 502, "후보 없음");
      out = parsed; used = p.name; break;
    } catch (e) {
      errs.push(e instanceof ProviderError ? `${e.provider} ${e.status} ${e.message}` : `${p.name} 답변 해석 실패`);
    }
  }
  if (!out) {
    const busy = errs.some((s) => / (429|500|502|503) /.test(s));
    throw new HttpError(busy ? 503 : 502, (busy ? "AI 가 지금 붐빕니다. 잠시 뒤 다시 눌러 주세요. " : "AI 요청에 실패했습니다. ") + "(" + errs.join(" / ").slice(0, 300) + ")");
  }
  const cands = out.candidates
    .map((c) => ({ name: clean(c && c.name, 120), note: clean(c && c.note, 120) }))
    .filter((c) => c.name)
    .slice(0, 4);
  return json({ ok: true, item: clean(out.item, 30), color: clean(out.color, 30), candidates: cands, brandMatched: prof ? prof.name : "", by: used, fellBack: errs.length ? errs : undefined, codeGuess: lens.used ? clean(out.codeGuess, 60) : "", lens: lens.used ? { used: true, total: lens.total, korean: lens.korean, refs: lens.refs.slice(0, 8) } : { used: false, why: lens.error || "" }, version: VERSION });
}

// ── 기획전 상품 뽑기 (텍스트 전용, 사진 없음) ───────────────
// mode "parse":  MD 요청 문장 + 파일 속 브랜드 목록 → { brands:[목록에 있는 이름만], words:[상품명 단어], note }
// mode "select": MD 요청 문장 + 상품 {i,n} 목록(최대 150개) → { keep:[i...] }  (요청 취지에 맞는 상품 번호)
const PROMO_SYSTEM = `당신은 해외 명품 병행수입 쇼핑몰의 MD 보조입니다. 플랫폼 MD가 보낸 기획전 요청 문장을 읽고 상품을 고르는 일을 돕습니다.
규칙:
- 반드시 JSON 만 출력합니다. 설명 문장 금지.
- 브랜드는 사용자가 준 [브랜드 목록]에 있는 이름을 글자 그대로만 고릅니다. 목록에 없는 브랜드는 만들지 않습니다. 줄임말(예: 몽클 → 몽클레어)은 목록에서 가장 가까운 이름으로 연결합니다. 키즈 브랜드는 요청에 키즈/아동 얘기가 없으면 고르지 않습니다.
- 상품 종류는 한국 쇼핑몰 상품명에 실제로 쓰이는 한글 단어로 바꿉니다. 예) 패딩 → 패딩, 다운, 푸퍼, 퀄팅 / 코트 → 코트 / 가방 → 백, 토트, 숄더, 크로스.
- 시즌, 세일, 11월 같은 말은 상품 종류가 아니므로 words 에 넣지 않습니다.`;

const PROMO_MODELS = ["gemini-3.8-flash", "gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-2.5-flash-lite"];

async function runJson(env, system, userText, opts = {}) {
  // 기획전은 답이 짧다: 출력 한도를 작게(Groq 무료 분당 출력 1000토큰 한도 회피) + 한도 넉넉한 Gemini 를 먼저 쓴다
  const base = providerOrder(env);
  const order = (opts.model || opts.geminiOnly) ? base.filter((k) => k === "gemini") : opts.first ? [...base.filter((k) => k === opts.first), ...base.filter((k) => k !== opts.first)] : base;
  if (!order.length) throw new HttpError(503, "AI 키가 아직 등록되지 않았습니다. 관리자에게 알려 주세요.");
  const errs = [];
  for (const k of order) {
    const p = PROVIDERS[k];
    if (p.compact && system.length + userText.length > 4500) { errs.push(`${p.name} 건너뜀(글이 길어 무료 한도 초과)`); continue; } // Groq 무료: 분당 입력 7000토큰
    try {
      const res = await p.call(env, system, userText, [], { fast: true, model: opts.model, temperature: opts.temperature, maxTokens: p.compact ? 700 : (opts.maxTokens || 2048) });
      const txt = res.text.replace(/<think>[\s\S]*?<\/think>/g, "");
      const m = /\{[\s\S]*\}/.exec(txt);
      return { data: JSON.parse(m ? m[0] : txt), by: p.name, fellBack: errs.length ? errs : undefined };
    } catch (e) {
      errs.push(e instanceof ProviderError ? `${e.provider} ${e.status} ${e.message}` : `${p.name} 답변 해석 실패`);
    }
  }
  const busy = errs.some((s) => / (429|500|502|503) /.test(s));
  throw new HttpError(busy ? 503 : 502, (busy ? "AI 가 지금 붐빕니다. 잠시 뒤 다시 눌러 주세요. " : "AI 요청에 실패했습니다. ") + "(" + errs.join(" / ").slice(0, 300) + ")");
}

async function handlePromo(request, env) {
  const user = await requireStaff(request);
  let body;
  try { body = await request.json(); } catch (_) { throw new HttpError(400, "요청 형식이 올바르지 않습니다."); }
  const req = clean(body.request, 600);
  if (!req) throw new HttpError(400, "요청 문장이 비어 있습니다.");
  await spend(env, user);

  if (body.mode === "parse") {
    const brands = (Array.isArray(body.brands) ? body.brands : []).map((b) => clean(b, 40)).filter(Boolean).slice(0, 500);
    const userText = `[MD 요청]\n${req}\n\n[브랜드 목록]\n${brands.join("\n")}\n\n출력: {"brands":["목록에 있는 이름 그대로"],"words":["상품명에 들어갈 한글 단어"],"note":"한 줄 해석"}`;
    const { data, by, fellBack } = await runJson(env, PROMO_SYSTEM, userText, { first: "gemini" });
    const allow = new Set(brands);
    const outB = (Array.isArray(data.brands) ? data.brands : []).map((b) => clean(b, 40)).filter((b) => allow.has(b));
    const outW = (Array.isArray(data.words) ? data.words : []).map((w) => clean(w, 20)).filter(Boolean).slice(0, 20);
    return json({ ok: true, brands: [...new Set(outB)], words: [...new Set(outW)], note: clean(data.note, 120), by, fellBack, version: VERSION });
  }

  if (body.mode === "select") {
    const items = (Array.isArray(body.items) ? body.items : []).slice(0, 150)
      .map((x) => ({ i: Number(x && x.i), n: clean(x && x.n, 90) })).filter((x) => Number.isInteger(x.i) && x.n);
    if (!items.length) return json({ ok: true, keep: [], version: VERSION });
    const userText = `[MD 요청]\n${req}\n\n아래 상품 중 요청 취지에 맞는 상품의 번호만 고르세요. 애매하면 제외합니다.\n[상품]\n${items.map((x) => x.i + ": " + x.n).join("\n")}\n\n출력: {"keep":[번호,...]}`;
    const t0 = Date.now();
    const model = PROMO_MODELS.includes(body.model) ? body.model : undefined; // 시험용: 허용된 모델만 직접 지정 가능
    const { data, by, fellBack } = await runJson(env, PROMO_SYSTEM, userText, { first: "gemini", model });
    const ms = Date.now() - t0;
    const allow = new Set(items.map((x) => x.i));
    const keep = (Array.isArray(data.keep) ? data.keep : []).map(Number).filter((n) => allow.has(n));
    return json({ ok: true, keep: [...new Set(keep)], by, model: model || "", ms, fellBack, version: VERSION });
  }
  throw new HttpError(400, "mode 가 올바르지 않습니다.");
}

// ── 기획전 상품 태그 붙이기 (상품명 텍스트만) ───────────────
// 상품 {i,n} 목록 → 상품마다 종류(k)와 특징 태그(t). 결과는 화면이 서버 공유 저장소에 저장해 두고 계속 쓴다.
// 이 작업은 한꺼번에 많이 돌려야 해서 하루 한도를 따로 센다 (TAG_LIMIT_PER_DAY, 기본 800회 / 일반 한도 LIMIT_PER_DAY 와 별개).
const TAG_KINDS = ["패딩", "코트", "자켓", "니트", "가디건", "티셔츠", "셔츠", "맨투맨", "후드", "팬츠", "스커트", "원피스", "가방", "지갑", "스니커즈", "부츠", "로퍼", "샌들", "슈즈", "모자", "머플러", "벨트", "주얼리", "기타"];
const TAG_SYSTEM = `당신은 해외 명품 병행수입 쇼핑몰의 상품 분류 보조입니다. 상품명을 보고 상품 종류와 특징 태그를 붙입니다.
규칙:
- 반드시 JSON 만 출력합니다. 설명 문장 금지.
- k(종류)는 반드시 다음 중 하나만: ${TAG_KINDS.join(", ")}. 상품명으로 종류를 확실히 알 수 없으면 "기타".
- t(특징 태그)는 상품명에 근거가 있는 한글 단어만 최대 5개. 예) 길이: 롱/숏/미디/크롭, 무게: 경량/헤비, 소재: 울/캐시미어/구스다운/덕다운/가죽/데님/실크/퍼/트위드/니트, 디테일: 후드/벨티드/더블/퀼팅/오버사이즈/체크/로고. 상품명에 없는 것을 지어내지 않습니다.
- 시즌 표기(26FW), 영문 모델명, 색상, 품번은 태그가 아닙니다.`;

async function spendTag(env, user) {
  if (!env.NAMEGEN_KV) return;
  const limit = Number(env.TAG_LIMIT_PER_DAY) || 800;
  const day = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const key = `tag:${day}:${user}`;
  const used = Number(await env.NAMEGEN_KV.get(key)) || 0;
  if (used + 1 > limit) throw new HttpError(429, `오늘 태그 붙이기 한도(${limit}회)를 넘었습니다. 내일 이어서 해 주세요.`);
  await env.NAMEGEN_KV.put(key, String(used + 1), { expirationTtl: 2 * 86400 });
}

async function handlePromoTag(request, env) {
  const user = await requireStaff(request);
  let body;
  try { body = await request.json(); } catch (_) { throw new HttpError(400, "요청 형식이 올바르지 않습니다."); }
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, 100)
    .map((x) => ({ i: Number(x && x.i), n: clean(x && x.n, 90) })).filter((x) => Number.isInteger(x.i) && x.n);
  if (!items.length) return json({ ok: true, tags: [], version: VERSION });
  await spendTag(env, user);
  const userText = `[상품]\n${items.map((x) => x.i + ": " + x.n).join("\n")}\n\n출력: {"tags":[{"i":번호,"k":"종류","t":["태그",...]}, ...]}  (모든 상품 번호에 대해 한 줄씩)`;
  // 기본 모델이 한도 초과(429→503)면 다음 모델로 넘어간다 (모델마다 한도가 따로라서, 11-10 에 3.8-flash 만 막혀 태그가 전부 실패했었음)
  let data, by, fellBack, lastErr;
  for (const model of [env.GEMINI_MODEL, "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"].filter(Boolean)) {
    try { ({ data, by, fellBack } = await runJson(env, TAG_SYSTEM, userText, { geminiOnly: true, maxTokens: 6000, model })); by = by + " " + model; lastErr = null; break; }
    catch (e) { lastErr = e; if (!(e instanceof HttpError) || e.status !== 503) break; }
  }
  if (lastErr) throw lastErr;
  const allow = new Set(items.map((x) => x.i)), seen = new Set(), tags = [];
  for (const t of (Array.isArray(data.tags) ? data.tags : [])) {
    const i = Number(t && t.i);
    if (!allow.has(i) || seen.has(i)) continue;
    seen.add(i);
    const k = TAG_KINDS.includes(t.k) ? t.k : "기타";
    const tt = (Array.isArray(t.t) ? t.t : []).map((w) => clean(w, 12)).filter(Boolean).slice(0, 5);
    tags.push({ i, k, t: tt });
  }
  return json({ ok: true, tags, by, fellBack, version: VERSION });
}

// ── 고객 문의 답변 초안 (문의 답변 도우미) ───────────────────
// 화면이 이름·전화·주문번호를 가린 문의 + 이미 확인된 사실(재고·실측)을 보내면, 바이스트 말투의 답변 초안 한 개를 돌려준다.
// 사실을 모르면 지어내지 않고 needs_staff 로 돌려보낸다. 사방넷에는 직원이 직접 붙여넣으므로 자동 발송은 없다.
const CS_SYSTEM = `당신은 해외 명품 병행수입 쇼핑몰 "바이스트"의 고객 문의 답변 담당입니다. 고객 문의에 대한 답변 초안을 한국어 존댓말로 씁니다.
[절대 규칙]
1. [확인된 사실]에 적힌 것과 아래 [판매 정책]에 있는 것만 말합니다. 재고·실측 치수·소재·색상·배송 상태·가격은 [확인된 사실]에 없으면 절대 지어내지 않습니다. 모르면 needs_staff 를 true 로 하고 answer 는 빈 문자열로 둡니다.
2. "회수접수했습니다", "환불 처리했습니다", "출고했습니다", "취소했습니다"처럼 이미 처리했다는 말, 보상·할인·무상 수선 약속은 쓰지 않습니다. 직원이 실제로 처리해야 하는 문의는 needs_staff 를 true 로 합니다.
3. 한 문의에 질문이 여러 개면 모두 답합니다. 답하지 못하는 질문이 하나라도 있으면 needs_staff 를 true 로 하고, 답할 수 있는 부분만 answer 에 씁니다.
4. 형식: "안녕하세요 고객님 ! " 로 시작해서 " 감사합니다." 로 끝납니다. 2~4문장, 이모지 금지, 과장 금지.
[판매 정책]
- 모든 제품은 정식통관을 거쳐 수입된 100% 정품, 새상품입니다(병행수입). 자체택(검은색띠)과 자체보증서가 제공됩니다. 브랜드 정품보증서·영수증·브랜드 쇼핑백·선물포장은 제공되지 않습니다.
- 매장·백화점 A/S는 불가합니다. 판매처로 연락 주시면 수선 가능한 범위 내에서 유상으로 도와드립니다.
- 재입고·입고 예정은 정확하지 않아 안내가 어렵습니다. 신상품이 수시로 들어오니 판매자 홈을 봐 달라고 안내합니다.
- 재고가 1~2개면 "소량 보유중으로 빠른 결제 추천, 선결제건이 있으면 품절 안내를 받을 수 있다"고 안내합니다. 평일 오후 4시 이전 결제 시 당일 발송입니다.
- 사이즈 추천은 하되 "고객님마다 체형이 달라 정확한 추천은 어렵고, 상세페이지의 사이즈별 실측 치수를 참고해 달라"고 덧붙입니다. 사이즈가 안 맞으면 교환·환불 가능하나 택배비는 고객 부담입니다.
- 교환·반품 조건: 상품택·자체택 제거 안 함, 외부 착용 안 함, 받은 상태 그대로, 수령일 7일 이내. 반품 배송비 10,000원.
- 카드 할인·포인트·쿠폰·결제·환불 입금 문의는 구매하신 사이트 고객센터로 안내합니다.
- 수작업으로 제작되어 마감·박음질이 정교하지 못한 것은 제품 하자가 아닙니다.
- 키즈 12A~14A는 성인 여성 마른 44 사이즈까지 착용 가능하나 체형에 따라 다릅니다.
[답변 예시]
(아래 "참고 답변"이 따로 주어지면 그 문체·표현을 우선 따릅니다. 단, 참고 답변 속의 재고·사이즈·상품 사실은 가져다 쓰지 않습니다.)
문의: 38사이즈 재고 있나요? / 사실: 38 재고 1개 → 안녕하세요 고객님 ! 문의 주신 제품 38사이즈 재고 1개 확인되었습니다. 소량 보유중으로 빠른 결제 추천드리며, 선결제건 있을 경우 품절안내 받으실 수 있는 점 참고 부탁드립니다. 감사합니다.
문의: M사이즈 재입고 안될까요? → 안녕하세요 고객님 ! 죄송하게도 현재 입고 예정은 정확하지 않아 답변드리기 어려운 점 양해부탁드립니다. 상품 재입고시 빠른 업데이트 할 수 있도록 하겠으며 판매자 홈 보시면 신상 제품들도 준비되어 있으니 많은 관심 부탁드립니다. 감사합니다.
문의: 백화점에서 AS되나요? → 안녕하세요 고객님 ! 병행수입 제품 구매 시 매장 및 백화점 수선 불가능하며, 판매처 쪽으로 연락 주시면 수선 가능한 범위내에서 유상으로 처리 도와드리고 있습니다. 감사합니다.
문의: 원단이 비침 있나요? / 사실: 없음 → {"answer":"","needs_staff":true,"reason":"소재·비침 정보가 없어 상품 상세를 확인해야 해요"}
문의: 언제 배송되나요? / 사실: 없음 → {"answer":"","needs_staff":true,"reason":"주문의 출고·송장 상태를 확인해야 해요"}
출력은 JSON 한 개만: {"answer":"답변 초안","needs_staff":true|false,"reason":"직원이 확인할 것(없으면 빈 문자열)"}`;

async function spendCs(env, user) {
  if (!env.NAMEGEN_KV) return;
  const limit = Number(env.CS_LIMIT_PER_DAY) || 400;
  const day = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const key = `cs:${day}:${user}`;
  const used = Number(await env.NAMEGEN_KV.get(key)) || 0;
  if (used + 1 > limit) throw new HttpError(429, `오늘 문의 AI 초안 한도(${limit}회)를 넘었습니다. 내일 이어서 해 주세요.`);
  await env.NAMEGEN_KV.put(key, String(used + 1), { expirationTtl: 2 * 86400 });
}

// 화면에서 이미 가리지만, 혹시 남은 개인정보를 한 번 더 지운다 (AI 서비스로 나가기 전 마지막 관문)
function maskPii(s) {
  return String(s || "")
    .replace(/01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}/g, "{전화}")
    .replace(/(?:ORD)?\d{12,}/gi, "{번호}")
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "{이메일}")
    .replace(/(회원명|성함|이름|고객명)\s*[:：]?\s*[가-힣A-Za-z]{2,6}/g, "$1: {이름}");
}
// 직원이 확인하지 않으면 안 되는 "이미 처리했다/약속" 표현
const CS_PROMISE = /(회수|수거|반품)\s*(접수|처리)\s*(했|하였|완료|되었)|환불\s*(처리|완료|진행)\s*(했|하였|되었|완료)|출고\s*(했|하였|완료)|취소\s*(처리|완료)\s*(했|하였)|200\s*%|보상|무상\s*(수선|교환|반품|A\/?S)|전액\s*환불/;

async function handleCs(request, env) {
  const user = await requireStaff(request);
  let body;
  try { body = await request.json(); } catch (_) { throw new HttpError(400, "요청 형식이 올바르지 않습니다."); }
  const q = maskPii(clean(body.q, 900));
  if (!q) throw new HttpError(400, "고객 문의가 비어 있습니다.");
  const prod = maskPii(clean(body.prod, 120)), shop = clean(body.shop, 30), label = clean(body.label, 30);
  const facts = maskPii(clean(body.facts, 700)), draft = maskPii(clean(body.draft, 700));
  // 직원이 실제로 확정해서 보낸 비슷한 문의의 답변 (화면이 서버 저장소에서 찾아 보냄). 문체·표현을 배우는 용도.
  const examples = (Array.isArray(body.examples) ? body.examples : []).slice(0, 4)
    .map((e) => ({ q: maskPii(clean(e && e.q, 200)), a: maskPii(clean(e && e.a, 450)) })).filter((e) => e.q && e.a);
  const exText = examples.length ? "\n[참고 답변 — 우리 직원이 실제로 보낸 비슷한 문의]\n" + examples.map((e, i) => `${i + 1}) 문의: ${e.q}\n   답변: ${e.a}`).join("\n") + "\n" : "";
  await spendCs(env, user);
  const userText = `[쇼핑몰] ${shop || "-"}\n[상품] ${prod || "-"}\n[문의 분류(자동)] ${label || "-"}\n[확인된 사실]\n${facts || "없음"}\n[규칙으로 만든 초안(참고, 틀릴 수 있음)]\n${draft || "없음"}\n${exText}\n[고객 문의]\n${q}\n\n출력: {"answer":"...","needs_staff":false,"reason":""}`;
  const { data, by, fellBack } = await runJson(env, CS_SYSTEM, userText, { first: "gemini", maxTokens: 900, temperature: 0.2 });
  let answer = clean(data && data.answer, 900), needs = !!(data && data.needs_staff), reason = clean(data && data.reason, 160);
  if (answer && CS_PROMISE.test(answer)) { needs = true; reason = (reason ? reason + " / " : "") + "이미 처리했다는 표현이 있어요. 실제 처리 여부를 확인하세요"; }
  if (answer && !/^안녕하세요/.test(answer)) answer = "안녕하세요 고객님 ! " + answer;
  if (answer && !/감사합니다[.!^ ]*$/.test(answer)) answer = answer.replace(/\s*$/, "") + " 감사합니다.";
  if (!answer) needs = true;
  return json({ ok: true, answer, needs_staff: needs, reason, by, fellBack, version: VERSION });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
    try {
      if (url.pathname === "/api/health") return json({ ok: true, ready: providerOrder(env).length > 0, providers: providerOrder(env), version: VERSION });
      if (request.method === "GET" && url.pathname.startsWith("/i/")) return await serveTempImage(env, url.pathname.slice(3));
      if (url.pathname === "/api/names" && request.method === "POST") return await handleNames(request, env);
      if (url.pathname === "/api/cs" && request.method === "POST") return await handleCs(request, env);
      if (url.pathname === "/api/promo" && request.method === "POST") return await handlePromo(request, env);
      if (url.pathname === "/api/promo-tag" && request.method === "POST") return await handlePromoTag(request, env);
      throw new HttpError(404, "없는 주소입니다.");
    } catch (e) {
      if (e instanceof HttpError) return json({ ok: false, error: e.message }, e.status);
      return json({ ok: false, error: "서버 오류: " + String((e && e.message) || e).slice(0, 120) }, 500);
    }
  },
};
