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
const VERSION = "1.0.0";
const ASPECTS = { "4:5": "1024x1280", "3:4": "960x1280", "9:16": "864x1536", "1:1": "1024x1024", "16:9": "1536x864" }; // 새 모델은 16의 배수 사이즈를 직접 받는다 → 잘림 없이 정확한 비율
// 대략적인 1장 비용(USD) — 화면 안내용. 실제 청구는 각 회사 콘솔에서 확인.
const COST = { gemini: 0.04, openai: 0.06 };

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

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: cors() });
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/health") {
        return json({
          ok: true, version: VERSION, limits: !!env.STUDIO_KV, maxN: Number(env.MAX_N) || 2, maxRefs: Number(env.MAX_REFS) || 6,
          providers: [
            { id: "gemini", label: "Gemini (구글)", ready: !!env.GEMINI_API_KEY, model: env.GEMINI_MODEL || "gemini-nano-banana-2.1", usd: COST.gemini },
            { id: "openai", label: "OpenAI (GPT 이미지)", ready: !!env.OPENAI_API_KEY, model: env.OPENAI_MODEL || "gpt-image-2.5-sunburst", usd: COST.openai },
          ],
        });
      }
      const user = await requireStaff(request);
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
