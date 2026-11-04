/**
 * BUYEST 상품명 AI 자동생성 Worker
 *
 * 상품 사진 1~3장 + 힌트(브랜드·시즌·품번·성인/키즈) → 바이스트 상품명 후보 4개.
 * 학습자료(namebook.json) = 메인·키즈 사이트의 실제 상품명 2만 3천여 개에서 뽑은 어휘·브랜드별 작명 예시.
 * 키는 이 Worker 의 비밀값에만 둔다 (화면 코드·저장소·채팅에 쓰지 말 것):  npx wrangler secret put ANTHROPIC_API_KEY
 *
 *   GET  /api/health    설정 상태 (키가 있는지 여부만)
 *   POST /api/names     { images:[dataURL...], brand, season, code, kind:"auto|adult|kids", hint }  →  { candidates:[{name, note}], usage }
 *
 * 접근 통제: 헤더 X-Studio-User / X-Studio-Pass 를 buyest.co.kr 툴키트 로그인으로 확인한다 (health 제외).
 */
const ALLOWED_ORIGIN = "https://buyestkorea-code.github.io";
const LOGIN_API = "https://buyest.co.kr/toolkit_dashboard_api.php";
const VERSION = "1.0.0";

const cors = () => ({
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,X-Studio-User,X-Studio-Pass",
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
  const user = (request.headers.get("X-Studio-User") || "").trim();
  const pass = request.headers.get("X-Studio-Pass") || "";
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
function systemPrompt(book) {
  const colors = book.colors.map((c) => c[0]).join(", ");
  const items = book.items.map((c) => c[0]).join(", ");
  const mods = book.mods.map((c) => c[0]).join(", ");
  const ex = (s) => book.examples.filter((e) => e.s === s).map((e) => e.n).join("\n");
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
4. 같은 브랜드의 예시가 주어지면 그 브랜드의 작명 습관(디테일 단어, 모델명 표기법)을 따른다.

## 출력 형식 (이것만 출력, 설명 금지)
{"item":"판단한 아이템","color":"판단한 색상","candidates":[{"name":"시즌 … 색상","note":"한 줄 메모(없으면 빈 문자열)"},{...},{...},{...}]}`;
}

function parseDataUrl(u) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(typeof u === "string" ? u : "");
  if (!m) throw new HttpError(400, "사진 형식이 올바르지 않습니다 (jpg · png · webp 만 가능)");
  if (m[2].length > 2500000) throw new HttpError(400, "사진 한 장이 너무 큽니다. 더 작은 사진으로 시도해 주세요.");
  return { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } };
}
const clean = (s, n = 60) => String(s || "").replace(/[\r\n\t]+/g, " ").slice(0, n).trim();

async function handleNames(request, env) {
  if (!env.ANTHROPIC_API_KEY) throw new HttpError(503, "AI 키가 아직 등록되지 않았습니다. 관리자에게 알려 주세요.");
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

  const payload = {
    model: env.CLAUDE_MODEL || "claude-sonnet-5-5",
    max_tokens: 900,
    system: [{ type: "text", text: systemPrompt(book), cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: [...images, { type: "text", text: lines.join("\n") }] }],
  };
  let r;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": String(env.ANTHROPIC_API_KEY).trim(), "anthropic-version": "2023-06-01" },
      body: JSON.stringify(payload),
    });
  } catch (_) { throw new HttpError(502, "AI 서버에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요."); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = String((d && d.error && d.error.message) || "").slice(0, 160);
    if (r.status === 401 || r.status === 403) throw new HttpError(503, `AI 키가 올바르지 않거나 권한이 없습니다. (${msg})`);
    if (r.status === 429) throw new HttpError(429, "AI 사용량 한도에 걸렸습니다. 잠시 뒤 다시 시도해 주세요.");
    throw new HttpError(502, `AI 요청 실패 (${r.status}) ${msg}`);
  }
  const text = (d.content || []).map((c) => c.text || "").join("");
  const m = /\{[\s\S]*\}/.exec(text);
  let out;
  try { out = JSON.parse(m ? m[0] : text); } catch (_) { throw new HttpError(502, "AI 답변을 읽지 못했습니다. 다시 시도해 주세요."); }
  const cands = (Array.isArray(out.candidates) ? out.candidates : [])
    .map((c) => ({ name: clean(c && c.name, 120), note: clean(c && c.note, 120) }))
    .filter((c) => c.name)
    .slice(0, 4);
  if (!cands.length) throw new HttpError(502, "후보를 만들지 못했습니다. 다시 시도해 주세요.");
  return json({ ok: true, item: clean(out.item, 30), color: clean(out.color, 30), candidates: cands, brandMatched: prof ? prof.name : "", usage: d.usage || null, version: VERSION });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
    try {
      if (url.pathname === "/api/health") return json({ ok: true, ready: !!env.ANTHROPIC_API_KEY, model: env.CLAUDE_MODEL, version: VERSION });
      if (url.pathname === "/api/names" && request.method === "POST") return await handleNames(request, env);
      throw new HttpError(404, "없는 주소입니다.");
    } catch (e) {
      if (e instanceof HttpError) return json({ ok: false, error: e.message }, e.status);
      return json({ ok: false, error: "서버 오류: " + String((e && e.message) || e).slice(0, 120) }, 500);
    }
  },
};
