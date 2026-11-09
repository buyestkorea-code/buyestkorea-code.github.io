/**
 * BUYEST 스튜디오 V2 — 이미지 중계 Worker
 *
 * 상품 사진(참고) + 프롬프트 → Gemini 또는 OpenAI 가 룩북·런웨이·모델컷 이미지를 만든다.
 * 키는 이 Worker 의 비밀값에만 둔다 (화면 코드·저장소·채팅에 쓰지 말 것).
 *
 *   GET  /api/health     설정 상태 (어떤 키가 있는지 여부만)
 *   POST /api/generate   { provider, prompt, images:[dataURL...], aspect, n }  →  { images:[dataURL...] }
 *
 * 비밀값:  GEMINI_API_KEY (Google AI Studio)  ·  OPENAI_API_KEY (platform.openai.com)  — 둘 중 하나만 있어도 됨
 * 접근 통제: 헤더 X-Studio-User / X-Studio-Pass 를 buyest.co.kr 툴키트 로그인으로 확인한다 (health 제외).
 */
const ALLOWED_ORIGIN = "https://buyestkorea-code.github.io";
const LOGIN_API = "https://buyest.co.kr/toolkit_dashboard_api.php";
const VERSION = "1.2.0";
const ASPECTS = { "4:5": "1024x1280", "3:4": "960x1280", "9:16": "864x1536", "1:1": "1024x1024", "16:9": "1536x864" }; // 새 모델은 16의 배수 사이즈를 직접 받는다 → 잘림 없이 정확한 비율
// 대략적인 1장 비용(USD) — 화면 안내용. 실제 청구는 각 회사 콘솔에서 확인.
const COST = { gemini: 0.04, openai: 0.06 };

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

// 하루 생성 장수 제한 (KV 를 연결했을 때만)
async function spend(env, user, count) {
  if (!env.STUDIO_KV) return;
  const limit = Number(env.LIMIT_IMAGES_PER_DAY) || 120;
  const day = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const key = `img:${day}:${user}`;
  const used = Number(await env.STUDIO_KV.get(key)) || 0;
  if (used + count > limit) throw new HttpError(429, `오늘 이미지 생성 한도(${limit}장)를 넘었습니다. 내일 다시 사용해 주세요.`);
  await env.STUDIO_KV.put(key, String(used + count), { expirationTtl: 2 * 86400 });
}

// data:image/...;base64,.... → { mime, b64 }
function parseDataUrl(u) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(typeof u === "string" ? u : "");
  if (!m) throw new HttpError(400, "사진 형식이 올바르지 않습니다 (jpg · png · webp 만 가능)");
  if (m[2].length > 6000000) throw new HttpError(400, "사진 한 장이 너무 큽니다. 더 작은 사진으로 시도해 주세요.");
  return { mime: m[1], b64: m[2] };
}
const b64ToBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

// ── Gemini ────────────────────────────────────────────
async function geminiOne(env, prompt, refs, aspect) {
  const key = String(env.GEMINI_API_KEY).trim();
  const base = "https://generativelanguage.googleapis.com/v1beta";
  const post = async (path, body) => {
    let r;
    try { r = await fetch(`${base}/${path}`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body) }); }
    catch (_) { throw new HttpError(502, "Gemini 서버에 연결하지 못했습니다."); }
    return { r, d: await r.json().catch(() => ({})) };
  };
  // 응답 어디에 있든 base64 이미지를 찾는다 (generateContent / Interactions 두 형식 모두)
  const findImage = (o, depth = 0) => {
    if (!o || typeof o !== "object" || depth > 8) return null;
    const inl = o.inlineData || o.inline_data;
    if (inl && inl.data) return `data:${inl.mimeType || inl.mime_type || "image/png"};base64,${inl.data}`;
    if (o.type === "image" && typeof o.data === "string" && o.data.length > 200) return `data:${o.mime_type || "image/png"};base64,${o.data}`;
    for (const v of Array.isArray(o) ? o : Object.values(o)) { const f = findImage(v, depth + 1); if (f) return f; }
    return null;
  };
  const fail = (r, d) => {
    if (r.status === 401 || r.status === 403) throw new HttpError(503, `Gemini 키가 올바르지 않거나 권한이 없습니다. (${String(d?.error?.message || "").slice(0, 120)})`);
    if (r.status === 429) throw new HttpError(429, "Gemini 사용량 한도에 걸렸습니다. 잠시 뒤 다시 시도해 주세요.");
    throw new HttpError(502, `Gemini 요청 실패 (${r.status}) ${String(d?.error?.message || "").slice(0, 200)}`);
  };
  const blocked = (d) => { if (d?.promptFeedback?.blockReason) throw new HttpError(422, "Gemini 가 이 요청을 안전 기준으로 거절했습니다. 사진이나 문구를 바꿔 보세요."); };

  // 1) 새 방식: Interactions API (GEMINI_MODEL)
  const model = env.GEMINI_MODEL || "gemini-nano-banana-2.1";
  const input = [{ type: "text", text: prompt }, ...refs.map((x) => ({ type: "image", mime_type: x.mime, data: x.b64 }))];
  let { r, d } = await post("interactions", { model, input, response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: aspect } });
  if (r.ok) { blocked(d); const img = findImage(d); if (img) return img; throw new HttpError(422, "Gemini 가 이미지를 돌려주지 않았습니다. 문구를 바꿔 다시 시도해 주세요."); }
  if (r.status === 401 || r.status === 403 || r.status === 429) fail(r, d);

  // 2) 예전 방식: generateContent (GEMINI_MODEL_LEGACY)
  const legacy = env.GEMINI_MODEL_LEGACY || "gemini-2.5-flash-image";
  const parts = [{ text: prompt }, ...refs.map((x) => ({ inline_data: { mime_type: x.mime, data: x.b64 } }))];
  const call = (modalities) => post(`models/${legacy}:generateContent`, { contents: [{ parts }], generationConfig: { responseModalities: modalities, imageConfig: { aspectRatio: aspect } } });
  let r2 = await call(["IMAGE"]);
  if (r2.r.status === 400) r2 = await call(["TEXT", "IMAGE"]);
  if (r2.r.ok) { blocked(r2.d); const img = findImage(r2.d); if (img) return img; throw new HttpError(422, "Gemini 가 이미지를 돌려주지 않았습니다. 문구를 바꿔 다시 시도해 주세요."); }
  // 둘 다 실패 — 두 방식의 오류를 함께 보여 준다
  throw new HttpError(502, `Gemini 요청 실패 · 새 방식(${r.status}): ${String(d?.error?.message || "").slice(0, 110)} · 예전 방식(${r2.r.status}): ${String(r2.d?.error?.message || "").slice(0, 110)}`);
}

// ── Gemini 음성(TTS): 릴스 나레이션 ───────────────────
const TTS_VOICES = [
  { id: "Kore", label: "Kore · 단단하고 또렷한" },
  { id: "Sulafat", label: "Sulafat · 따뜻한" },
  { id: "Achird", label: "Achird · 친근한" },
  { id: "Puck", label: "Puck · 경쾌한" },
  { id: "Charon", label: "Charon · 차분한 설명" },
  { id: "Zephyr", label: "Zephyr · 밝은" },
];
const TTS_STYLE = "warm, confident and clear Korean shopping-promo narration at a natural, slightly brisk pace";
async function ttsOne(env, text, voice, style) {
  const key = String(env.GEMINI_API_KEY).trim();
  const model = env.TTS_MODEL || "gemini-3.8-flash-tts";
  const body = {
    model,
    input: [{ type: "user_input", content: [{ type: "text", text, annotations: [{ type: "speech_metadata", style: style || TTS_STYLE }] }] }],
    response_format: { type: "audio", mime_type: "audio/wav" },
    generation_config: { speech_config: [{ voice }] },
  };
  let r;
  try { r = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body) }); }
  catch (_) { throw new HttpError(502, "Gemini 서버에 연결하지 못했습니다."); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = String(d?.error?.message || "").slice(0, 200);
    if (r.status === 401 || r.status === 403) throw new HttpError(503, `Gemini 키가 올바르지 않거나 권한이 없습니다. (${msg})`);
    if (r.status === 429) throw new HttpError(429, "Gemini 사용량 한도에 걸렸습니다. 잠시 뒤 다시 시도해 주세요.");
    throw new HttpError(502, `Gemini 음성 요청 실패 (${r.status}) ${msg}`);
  }
  const find = (o, depth = 0) => {
    if (!o || typeof o !== "object" || depth > 8) return null;
    if (o.type === "audio" && typeof o.data === "string" && o.data.length > 200) return o.data;
    const inl = o.inlineData || o.inline_data;
    if (inl && typeof inl.data === "string" && /audio/i.test(inl.mimeType || inl.mime_type || "")) return inl.data;
    for (const v of Array.isArray(o) ? o : Object.values(o)) { const f = find(v, depth + 1); if (f) return f; }
    return null;
  };
  const b64 = find(d);
  if (!b64) throw new HttpError(422, "Gemini 가 음성을 돌려주지 않았습니다. 문장을 바꿔 다시 시도해 주세요.");
  const bytes = Math.floor((b64.length * 3) / 4);
  return { audio: `data:audio/wav;base64,${b64}`, seconds: Math.max(0, (bytes - 44) / (24000 * 2)) };
}

// OpenAI 음성 (Gemini 가 지역 제한 등으로 막힐 때 자동으로 쓰는 예비)
const OPENAI_VOICE = { Kore: "alloy", Sulafat: "coral", Achird: "nova", Puck: "shimmer", Charon: "onyx", Zephyr: "sage" };
async function ttsOpenAI(env, text, voice) {
  let r;
  try {
    r = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${String(env.OPENAI_API_KEY).trim()}` },
      body: JSON.stringify({ model: env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts", voice: OPENAI_VOICE[voice] || "coral", input: text, instructions: "Warm, confident, clear Korean shopping-promo narration at a natural, slightly brisk pace.", response_format: "wav" }),
    });
  } catch (_) { throw new HttpError(502, "OpenAI 서버에 연결하지 못했습니다."); }
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new HttpError(r.status === 429 ? 429 : 502, `OpenAI 음성 요청 실패 (${r.status}) ${String(d?.error?.message || "").slice(0, 160)}`);
  }
  const buf = new Uint8Array(await r.arrayBuffer());
  let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  const dv = new DataView(buf.buffer);
  const byteRate = buf.length > 44 ? dv.getUint32(28, true) : 48000;
  return { audio: `data:audio/wav;base64,${btoa(bin)}`, seconds: Math.max(0, (buf.length - 44) / (byteRate || 48000)) };
}

// ── OpenAI ────────────────────────────────────────────
async function openaiMany(env, prompt, refs, aspect, n) {
  const fd = new FormData();
  fd.append("model", env.OPENAI_MODEL || "gpt-image-2.5-sunburst");
  fd.append("prompt", prompt);
  fd.append("size", ASPECTS[aspect] || "1024x1536");
  fd.append("n", String(n));
  fd.append("quality", env.OPENAI_QUALITY || "medium");
  fd.append("output_format", "jpeg");
  fd.append("output_compression", "92");
  refs.forEach((r, i) => fd.append("image[]", new Blob([b64ToBytes(r.b64)], { type: r.mime }), `ref${i}.${r.mime.split("/")[1]}`));
  let r;
  try { r = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${String(env.OPENAI_API_KEY).trim()}` }, body: fd }); }
  catch (_) { throw new HttpError(502, "OpenAI 서버에 연결하지 못했습니다."); }
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) throw new HttpError(503, "OpenAI 키가 올바르지 않습니다. 담당자에게 알려 주세요.");
  if (r.status === 429) throw new HttpError(429, "OpenAI 사용량 한도 또는 잔액 문제입니다. 잠시 뒤 다시 시도하거나 콘솔에서 잔액을 확인해 주세요.");
  if (!r.ok) {
    const msg = String(d?.error?.message || "");
    if (d?.error?.code === "moderation_blocked" || /safety|moderation/i.test(msg)) throw new HttpError(422, "OpenAI 가 이 요청을 안전 기준으로 거절했습니다. 사진이나 문구를 바꿔 보세요.");
    throw new HttpError(502, `OpenAI 요청 실패 (${r.status}) ${msg.slice(0, 160)}`);
  }
  const out = (d.data || []).filter((x) => x.b64_json).map((x) => `data:image/jpeg;base64,${x.b64_json}`);
  if (!out.length) throw new HttpError(502, "OpenAI 가 이미지를 돌려주지 않았습니다. 다시 시도해 주세요.");
  return out;
}

// ── 릴스 스토리보드: 프롬프트 + 사진 → 컷 리스트(JSON) ───────────────
// 글 모델은 Gemini 먼저, 막히면 OpenAI. 모델 이름은 STORY_MODEL / OPENAI_TEXT_MODEL 로 바꿀 수 있다.
const STORY_SYSTEM = `너는 인스타그램 릴스 전문 편집 기획자다. 패션 쇼핑몰(BUYEST: 병행수입 명품·부티크 / BUYEST Kids: 키즈 명품) 상품 영상의 컷 구성표를 만든다.
반드시 아래 JSON 하나만 출력한다 (설명·마크다운 금지).
{"hook":"첫 화면 한 줄(공백 포함 18자 이내)","mood":"bright|calm|emotional|hype 중 하나","cuts":[{"role":"hook|intro|detail|style|proof|cta 중 하나","sec":3~15 정수,"photo":사진 번호(0부터),"mode":"ai|photo","motion":"영어로 쓴 카메라·피사체 움직임 한 문장(영상 안에 글자·로고 새로 만들지 말 것)","narration":"한국어 나레이션 1~2문장","caption":"화면 자막 한 줄(공백 포함 16자 이내)"}]}
규칙:
- 전체 길이(sec 합)는 요청한 목표 길이의 ±15% 안. 컷 수는 목표 길이÷6 정도(최소 4, 최대 14). 첫 컷은 5초 이하 훅, 마지막 컷은 행동 유도(cta).
- 나레이션 글자 수는 컷 sec × 4 이하 (한국어 읽는 속도). 나레이션 없이 분위기만 둘 컷은 narration 을 빈 문자열로.
- mode "ai": 모델이 움직이거나 소재가 흔들리는 장면처럼 움직임이 가치 있는 컷. mode "photo": 지퍼·로고·택·소재 클로즈업처럼 AI가 모양을 바꾸면 안 되는 디테일 컷.
- 사진은 가능한 한 모두 한 번 이상 쓰고, 같은 사진을 연달아 쓰지 않는다. photo 는 주어진 사진 수 범위 안.
- 나레이션·자막은 ① 사용자가 준 상품 정보 ② 사진에서 눈으로 확인되는 것(색, 모양, 후드, 고글 같은 디자인) ③ 사이즈 문의 유도 같은 일반 안내, 이 셋으로만 쓴다. 소재·보온성·기능·착용감·안전·품질·정품 보증·할인·재고처럼 입력에 없는 설명은 절대 쓰지 않는다 (예: "부드러운 소재", "튼튼한 지퍼", "안전 보장"은 금지).
- 다른 브랜드 이름을 끌어와 비교하지 않는다. 과장·허위 표현 금지. 쓸 근거가 부족하면 나레이션을 짧게 하거나 빈 문자열로 둔다.
- sec 합은 목표 길이의 90~105% 로 맞춘다 (목표보다 짧게 끝내지 않는다). sec 는 2~15 정수.
- "참고 릴스 구조"가 주어지면 위의 "컷 수는 목표 길이÷6" 규칙 대신 이 규칙이 우선한다: 참고 릴스의 평균 컷 길이의 약 2배(최소 2초, 최대 6초)로 컷을 잘게 나눈다 (컷 수 최대 20). 처음 컷은 상대적으로 길게, 뒤로 갈수록 짧게 가속하고, 마무리 컷은 상품명·행동 유도로 닫는다. 같은 사진을 연달아 쓰지는 않되 다른 사진을 돌려 쓴다. 컷이 짧으면(3초 이하) 나레이션은 비우거나 아주 짧게 쓴다.
- "참고 릴스 구조"가 주어지면 그 릴스의 리듬(컷 길이가 변하는 방식, 훅을 여는 방식, 마무리 방식)만 목표 길이에 맞게 늘려서 따른다. 참고 릴스의 장면·문구·소재를 그대로 베끼지 않는다. 참고 릴스에 나레이션이 없어도 사장님 요청에 나레이션이 필요하면 쓴다.
- 말투: 사장님이 직접 말하듯 담백하고 구체적으로. 광고 문구 투의 상투어("지금 바로!", "놓치지 마세요")는 마지막 컷 외에는 쓰지 않는다.`;
function extractJson(txt) {
  const s = String(txt || ""); const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b <= a) throw new HttpError(502, "스토리보드 응답을 읽지 못했습니다");
  try { return JSON.parse(s.slice(a, b + 1)); } catch (_) { throw new HttpError(502, "스토리보드 응답 형식이 올바르지 않습니다"); }
}
async function storyGemini(env, text, refs) {
  const key = String(env.GEMINI_API_KEY).trim();
  const models = [env.STORY_MODEL, "gemini-3.8"].filter(Boolean); // 2.5 는 신규 사용자에게 닫힘 (404 안내: gemini-3.8 로 바꾸라고 함)
  let lastErr = "";
  for (const model of models) {
    let r;
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: STORY_SYSTEM }] },
          contents: [{ role: "user", parts: [{ text }, ...refs.map((x) => ({ inline_data: { mime_type: x.mime, data: x.b64 } }))] }],
          generationConfig: { temperature: 0.8, responseMimeType: "application/json" },
        }),
      });
    } catch (_) { lastErr = "Gemini 서버에 연결하지 못했습니다."; continue; }
    const d = await r.json().catch(() => ({}));
    if (r.ok) { const t = d?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || ""; if (t) return extractJson(t); lastErr = "Gemini 가 빈 응답을 돌려줬습니다."; continue; }
    lastErr = `Gemini(${model}) ${r.status} ${String(d?.error?.message || "").slice(0, 120)}`;
  }
  throw new HttpError(502, lastErr || "Gemini 스토리보드 실패");
}
async function storyOpenAI(env, text, refs) {
  let r;
  const content = refs && refs.length ? [{ type: "text", text }, ...refs.map((x) => ({ type: "image_url", image_url: { url: `data:${x.mime};base64,${x.b64}`, detail: "low" } }))] : text;
  try {
    r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${String(env.OPENAI_API_KEY).trim()}` },
      body: JSON.stringify({ model: env.OPENAI_TEXT_MODEL || "gpt-4.1-mini", temperature: 0.7, response_format: { type: "json_object" }, messages: [{ role: "system", content: STORY_SYSTEM }, { role: "user", content }] }),
    });
  } catch (_) { throw new HttpError(502, "OpenAI 서버에 연결하지 못했습니다."); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(r.status === 429 ? 429 : 502, `OpenAI 스토리보드 실패 (${r.status}) ${String(d?.error?.message || "").slice(0, 140)}`);
  return extractJson(d?.choices?.[0]?.message?.content);
}
const MOODS = ["bright", "calm", "emotional", "hype"], ROLES = ["hook", "intro", "detail", "style", "proof", "cta"];
// 입력에 없는 단정·보증 표현은 코드에서 한 번 더 걸러낸다 (AI가 프롬프트를 어겨도 막히게)
const RISKY = ["정품", "보장", "보증", "안전", "튼튼", "부드러", "보온", "따뜻", "최고", "100%", "완벽", "최저가", "할인", "고급", "프리미엄"];
function scrub(board, sourceText) {
  let removed = 0; const src = String(sourceText || "");
  const bad = RISKY.filter((w) => !src.includes(w));
  const hit = (s) => bad.some((w) => s.includes(w));
  board.cuts.forEach((c) => {
    const parts = c.narration.split(/(?<=[.!?。])\s*/).filter(Boolean), keep = parts.filter((s) => !hit(s));
    if (keep.length !== parts.length) { removed += parts.length - keep.length; c.narration = keep.join(" ").trim(); }
    if (hit(c.caption)) { c.caption = ""; removed++; }
  });
  if (hit(board.hook)) { board.hook = ""; removed++; }
  board.removed = removed; return board;
}
function normalizeBoard(raw, targetSec, nPhotos) {
  const cuts = (Array.isArray(raw?.cuts) ? raw.cuts : []).slice(0, 20).map((c, i) => ({
    role: ROLES.includes(c?.role) ? c.role : i === 0 ? "hook" : "detail",
    sec: Math.min(15, Math.max(2, Math.round(Number(c?.sec) || 6))),
    photo: Math.min(nPhotos - 1, Math.max(0, Math.round(Number(c?.photo) || 0))),
    mode: c?.mode === "photo" ? "photo" : "ai",
    motion: String(c?.motion || "Slow cinematic push-in with gentle natural motion.").slice(0, 400),
    narration: String(c?.narration || "").slice(0, 200),
    caption: String(c?.caption || "").slice(0, 40),
  }));
  if (cuts.length < 2) throw new HttpError(502, "스토리보드에 컷이 부족합니다. 다시 시도해 주세요.");
  // 총 길이가 목표의 90~105% 밖이면 컷 길이를 비례해서 맞춘다 (컷당 3~15초 안에서)
  const sum = cuts.reduce((s, c) => s + c.sec, 0);
  if (sum < targetSec * 0.9 || sum > targetSec * 1.05) { const k = targetSec / sum; cuts.forEach((c) => { c.sec = Math.min(15, Math.max(2, Math.round(c.sec * k))); }); }
  return { hook: String(raw?.hook || "").slice(0, 40), mood: MOODS.includes(raw?.mood) ? raw.mood : "bright", cuts, targetSec };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: cors() });
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/health") {
        return json({
          ok: true, version: VERSION, tts: !!(env.GEMINI_API_KEY || env.OPENAI_API_KEY), voices: TTS_VOICES, limits: !!env.STUDIO_KV, maxN: Number(env.MAX_N) || 2, maxRefs: Number(env.MAX_REFS) || 6,
          providers: [
            { id: "gemini", label: "Gemini (구글)", ready: !!env.GEMINI_API_KEY, model: env.GEMINI_MODEL || "gemini-nano-banana-2.1", usd: COST.gemini },
            { id: "openai", label: "OpenAI (GPT 이미지)", ready: !!env.OPENAI_API_KEY, model: env.OPENAI_MODEL || "gpt-image-2.5-sunburst", usd: COST.openai },
          ],
        });
      }
      const user = await requireStaff(request);
      if (url.pathname === "/api/tts" && request.method === "POST") {
        if (!env.GEMINI_API_KEY && !env.OPENAI_API_KEY) throw new HttpError(503, "음성 키(GEMINI_API_KEY 또는 OPENAI_API_KEY)가 아직 등록되지 않았습니다.");
        const b = await request.json().catch(() => ({}));
        const text = String(b.text || "").trim().slice(0, 900);
        if (!text) throw new HttpError(400, "읽을 문장이 비어 있습니다");
        const voice = TTS_VOICES.some((v) => v.id === b.voice) ? b.voice : "Kore";
        const style = typeof b.style === "string" && b.style.trim() ? b.style.trim().slice(0, 200) : "";
        let out = null, provider = "gemini", note = "";
        if (env.GEMINI_API_KEY && b.provider !== "openai") {
          try { out = await ttsOne(env, text, voice, style); }
          catch (e) { if (!env.OPENAI_API_KEY) throw e; note = String(e.message || "").slice(0, 120); }
        }
        if (!out) {
          if (!env.OPENAI_API_KEY) throw new HttpError(503, "OpenAI 키가 없어 예비 음성을 쓸 수 없습니다.");
          out = await ttsOpenAI(env, text, voice); provider = "openai";
        }
        return json({ ...out, voice, provider, fallbackReason: provider === "openai" ? note : "" });
      }
      if (url.pathname === "/api/story-models" && request.method === "GET") { // 진단: 이 키로 글 생성이 되는 Gemini 모델 목록
        if (!env.GEMINI_API_KEY) throw new HttpError(503, "Gemini 키가 없습니다");
        const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": String(env.GEMINI_API_KEY).trim() } });
        const d = await r.json().catch(() => ({}));
        return json({ status: r.status, models: (d.models || []).filter((m) => (m.supportedGenerationMethods || []).includes("generateContent")).map((m) => m.name.replace("models/", "")).slice(0, 80), error: d?.error?.message || "" });
      }
      if (url.pathname === "/api/storyboard" && request.method === "POST") {
        if (!env.GEMINI_API_KEY && !env.OPENAI_API_KEY) throw new HttpError(503, "글 모델 키(GEMINI_API_KEY 또는 OPENAI_API_KEY)가 아직 등록되지 않았습니다.");
        const b = await request.json().catch(() => ({}));
        const prompt = String(b.prompt || "").trim().slice(0, 2000);
        if (!prompt) throw new HttpError(400, "릴스 프롬프트가 비어 있습니다");
        const nPhotos = Math.min(10, Math.max(1, Math.round(Number(b.photoCount) || 1)));
        const targetSec = Math.min(120, Math.max(15, Math.round(Number(b.targetSec) || 45)));
        const p = b.product || {};
        // 레퍼런스가 있으면 컷 수와 컷별 길이(점점 짧아지는 가속)를 서버가 정해서 모델에게 지시한다 (모델이 규칙을 무시하는 일을 막음)
        let paceLine = "";
        if (b.reference && typeof b.reference === "object") {
          const avg = Math.min(4, Math.max(1, Number(b.reference.avgCutSec) || 2)), N = Math.min(20, Math.max(6, Math.round(targetSec / (avg * 2))));
          const w = Array.from({ length: N }, (_, i) => 1.6 - (1.0 * i) / Math.max(1, N - 1)), ws = w.reduce((s, x) => s + x, 0);
          const secs = w.map((x) => Math.min(8, Math.max(2, Math.round((x * targetSec) / ws))));
          secs[N - 1] = Math.max(2, secs[N - 1] + (targetSec - secs.reduce((s, x) => s + x, 0)));
          paceLine = `컷 구성 지시(반드시 지킬 것): 컷은 정확히 ${N}개, 각 컷의 sec 는 순서대로 [${secs.join(",")}] 로 한다. 이 지시가 위의 컷 수 규칙보다 우선한다.`;
        }
        const text = [
          `브랜드: ${b.brand === "kids" ? "BUYEST Kids" : "BUYEST"}${b.brandName ? ` · 상품 브랜드 ${String(b.brandName).slice(0, 60)}` : ""}`,
          `목표 길이: ${targetSec}초`, `사진 수: ${nPhotos}장 (0~${nPhotos - 1}번, 첨부된 순서)`,
          p.name ? `상품명: ${String(p.name).slice(0, 120)}` : "", p.price ? `가격: ${String(p.price).slice(0, 40)}` : "",
          p.features ? `특징:\n${String(p.features).slice(0, 600)}` : "", p.cta ? `마지막 요청: ${String(p.cta).slice(0, 80)}` : "",
          b.reference && typeof b.reference === "object" ? `참고 릴스 구조 (리듬만 참고, 장면·문구 복제 금지):\n- 원본 길이 ${Number(b.reference.durationSec) || "?"}초, 컷 ${Number(b.reference.cuts) || "?"}개 (평균 ${Number(b.reference.avgCutSec) || "?"}초)\n- 구성: ${String(b.reference.structure || "").slice(0, 400)}\n- 리듬: ${String(b.reference.pacing || "").slice(0, 200)}\n- 훅: ${String(b.reference.hook || "").slice(0, 200)}\n- 글자: ${String(b.reference.text || "").slice(0, 100)} / 소리: ${String(b.reference.audio || "").slice(0, 100)}` : "",
          paceLine,
          `사장님 요청(릴스 프롬프트):\n${prompt}`,
        ].filter(Boolean).join("\n");
        const refs = (Array.isArray(b.images) ? b.images.slice(0, 8) : []).map((u) => { try { return parseDataUrl(u); } catch (_) { return null; } }).filter(Boolean);
        // Gemini 는 Cloudflare 서버 위치 제한("User location is not supported")에 걸려 쓸 수 없는 경우가 많아 OpenAI 를 먼저 쓴다
        let raw = null, note = "", provider = "";
        if (env.OPENAI_API_KEY) { try { raw = await storyOpenAI(env, text, refs); provider = "openai"; } catch (e) { if (!env.GEMINI_API_KEY) throw e; note = String(e.message || "").slice(0, 160); } }
        if (!raw && env.GEMINI_API_KEY) { raw = await storyGemini(env, text, refs); provider = "gemini"; }
        if (!raw) throw new HttpError(502, "스토리보드를 만들지 못했습니다");
        return json({ board: scrub(normalizeBoard(raw, targetSec, nPhotos), text), provider, fallbackReason: note });
      }
      if (url.pathname === "/api/generate" && request.method === "POST") {
        const b = await request.json().catch(() => ({}));
        const provider = b.provider === "openai" ? "openai" : "gemini";
        if (provider === "gemini" && !env.GEMINI_API_KEY) throw new HttpError(503, "Gemini 키(GEMINI_API_KEY)가 아직 등록되지 않았습니다.");
        if (provider === "openai" && !env.OPENAI_API_KEY) throw new HttpError(503, "OpenAI 키(OPENAI_API_KEY)가 아직 등록되지 않았습니다.");
        const prompt = String(b.prompt || "").trim().slice(0, 4000);
        if (!prompt) throw new HttpError(400, "프롬프트가 비어 있습니다");
        const aspect = ASPECTS[b.aspect] ? b.aspect : "4:5";
        const n = Math.min(Number(env.MAX_N) || 2, Math.max(1, Math.round(Number(b.n) || 1)));
        const list = Array.isArray(b.images) ? b.images.slice(0, Number(env.MAX_REFS) || 6) : [];
        if (!list.length) throw new HttpError(400, "상품 사진이 필요합니다");
        const refs = list.map(parseDataUrl);
        await spend(env, user, n);
        let images;
        if (provider === "gemini") images = await Promise.all(Array.from({ length: n }, () => geminiOne(env, prompt, refs, aspect)));
        else images = await openaiMany(env, prompt, refs, aspect, n);
        return json({ images, provider });
      }
      throw new HttpError(404, "알 수 없는 경로입니다");
    } catch (err) {
      return json({ error: err.message || "서버 오류" }, err instanceof HttpError ? err.status : 500);
    }
  },
};
