/**
 * BUYEST 릴스 — Higgsfield 중계 Worker
 *
 * 사진 여러 장 + 프롬프트 → Higgsfield(Seedance) 가 릴스 영상을 만든다. 키는 이 Worker 의 비밀값에만 둔다.
 *
 *   GET  /api/health      설정 상태 (키가 있는지 여부만)
 *   POST /api/upload-url  사진 올릴 임시 주소 발급 → 브라우저가 사진을 직접 올림 (Worker 는 사진을 안 거침)
 *   POST /api/estimate    같은 설정의 예상 비용 (가격표 기준, 무료)
 *   POST /api/generate    영상 생성 요청 (유료, 성공한 건만 과금)
 *   GET  /api/status      생성 상태 확인 → 끝나면 영상 주소
 *   GET  /api/media       만들어진 영상 중계 (이 Worker 가 서명한 주소만)
 *
 * 비밀값:  HF_API_KEY  — Higgsfield 콘솔에서 발급한 키를 복사한 그대로 (npx wrangler secret put HF_API_KEY)
 *
 * 접근 통제: 헤더 X-Studio-User / X-Studio-Pass 를 buyest.co.kr 툴키트 로그인으로 확인한다 (health, media 제외).
 * 안전장치: 요청 1건 최대 비용(MAX_USD_PER_REQUEST), 직원 1명 하루 생성 횟수(KV 연결 시), 같은 요청 중복 방지(Idempotency-Key).
 */
const ALLOWED_ORIGIN = "https://buyestkorea-code.github.io";
const HF = "https://api.higgsfield.ai";
const LOGIN_API = "https://buyest.co.kr/toolkit_dashboard_api.php";
const VERSION = "5.0.0";

// 쓸 수 있는 모델 — 사진 1장 → 3~15초 클립. 릴스 스튜디오는 Kling 3.0 만 쓴다 (사장님 결정 2026-11-10, Seedance 제외).
// usdPerSec: 실제 청구와 공식 가격표(open.higgsfield.ai/pricing)로 잡은 초당 예상 금액 (견적 API 가 이 키로 안 열려 가격표로 상한을 건다)
const MODELS = {
  kling3: { label: "Kling 3.0 표준 (1초 약 $0.065)", path: "kling-video/v3.0/std/image-to-video", minSec: 3, maxSec: 15, usdPerSec: 0.065, sound: true },
};
const DEFAULT_MODEL = "kling3";
const RESOLUTIONS = ["480p", "720p", "1080p"];
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const cors = () => ({
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,X-Studio-User,X-Studio-Pass,X-Studio-Enc,Idempotency-Key",
  "Access-Control-Max-Age": "600",
  Vary: "Origin",
});
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...cors() } });
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (s) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
async function hmac(key, msg) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg))).slice(0, 32);
}

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

// 하루 생성 횟수 제한 (KV 를 연결했을 때만)
async function spend(env, user, limit) {
  if (!env.STUDIO_KV) return;
  const day = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const key = `gen:${day}:${user}`;
  const used = Number(await env.STUDIO_KV.get(key)) || 0;
  if (used + 1 > limit) throw new HttpError(429, `오늘 영상 생성 한도(${limit}회)를 넘었습니다. 내일 다시 사용해 주세요.`);
  await env.STUDIO_KV.put(key, String(used + 1), { expirationTtl: 2 * 86400 });
}

// ── Higgsfield 호출 ───────────────────────────────────
async function hf(env, method, path, body, extraHeaders) {
  if (!env.HF_API_KEY) throw new HttpError(503, "Higgsfield 키(HF_API_KEY)가 Worker 에 아직 설정되지 않았습니다.");
  let r;
  try {
    r = await fetch(`${HF}/${path}`, {
      method,
      headers: { Authorization: `Key ${env.HF_API_KEY}`, "Content-Type": "application/json", ...(extraHeaders || {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (_) { throw new HttpError(502, "Higgsfield 서버에 연결하지 못했습니다."); }
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 || r.status === 403) throw new HttpError(503, "Higgsfield 키가 올바르지 않거나 권한이 없습니다. 담당자에게 알려 주세요.");
  if (!r.ok) {
    const msg = typeof data?.detail === "string" ? data.detail : data?.detail?.message || data?.error?.message || data?.error || data?.message || "";
    throw new HttpError(r.status === 402 ? 402 : 502, r.status === 402 ? "Higgsfield 잔액이 부족합니다. 콘솔에서 충전해 주세요." : `Higgsfield 요청 실패 (${r.status}) ${String(msg).slice(0, 200)}`);
  }
  return data;
}

// 화면에서 온 설정 → 검증 → Higgsfield 요청 본문 (사진 1장 = 클립 1개)
function buildRequest(env, b) {
  const m = MODELS[b.model] || MODELS[DEFAULT_MODEL];
  const first = typeof b.image === "string" ? b.image : (Array.isArray(b.images) ? b.images[0] : "");
  if (typeof first !== "string" || !/^https:\/\//.test(first)) throw new HttpError(400, "사진 주소가 필요합니다");
  const prompt = String(b.prompt || "").trim().slice(0, 2400);
  if (!prompt) throw new HttpError(400, "움직임 설명(프롬프트)이 필요합니다");
  let duration = Math.round(Number(b.duration) || 5);
  duration = m.durations ? (m.durations.includes(duration) ? duration : m.durations[0]) : Math.min(m.maxSec, Math.max(m.minSec, duration));
  const body = { prompt, image_url: first, duration };
  if (m.negative) body.negative_prompt = "text, captions, subtitles, watermark, logo distortion, deformed product, extra objects";
  if (m.sound) body.sound = "off";
  const usd = Math.round(duration * m.usdPerSec * 1000) / 1000;
  return { path: m.path, body, usd };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: cors() });
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/health") {
        return json({ ok: true, version: VERSION, higgsfield: !!env.HF_API_KEY, limits: !!env.STUDIO_KV, maxUsd: Number(env.MAX_USD_PER_REQUEST) || 5, defaultModel: DEFAULT_MODEL, models: Object.entries(MODELS).map(([id, m]) => ({ id, label: m.label, minSec: m.minSec, maxSec: m.maxSec, durations: m.durations || null, usdPerSec: m.usdPerSec })) });
      }

      // 영상 중계: 서명된 주소만 (로그인 헤더 없이 <video> 가 받을 수 있게)
      if (url.pathname === "/api/media" && request.method === "GET") {
        const target = url.searchParams.get("u") || "", sig = url.searchParams.get("s") || "";
        if (!/^https:\/\//.test(target) || sig !== (await hmac(env.HF_API_KEY || "none", target))) throw new HttpError(403, "허용되지 않은 주소입니다");
        const up = await fetch(target);
        if (!up.ok) throw new HttpError(502, `영상 파일을 가져오지 못했습니다 (${up.status})`);
        return new Response(up.body, { status: 200, headers: { "Content-Type": up.headers.get("Content-Type") || "video/mp4", "Cache-Control": "private, max-age=3600", ...cors() } });
      }

      const user = await requireStaff(request);

      if (url.pathname === "/api/status" && request.method === "GET") {
        const id = url.searchParams.get("id") || "";
        if (!/^[0-9a-zA-Z-]{16,64}$/.test(id)) throw new HttpError(400, "잘못된 요청 번호입니다");
        const d = await hf(env, "GET", `requests/${id}/status`);
        const out = { status: d.status || "unknown", error: d.error ? String(typeof d.error === "string" ? d.error : d.error.message || "") : "" };
        const v = d.video?.url;
        if (typeof v === "string" && /^https:\/\//.test(v)) out.video_url = `${url.origin}/api/media?u=${encodeURIComponent(v)}&s=${await hmac(env.HF_API_KEY || "none", v)}`;
        return json(out);
      }

      if (request.method !== "POST") throw new HttpError(405, "지원하지 않는 메서드입니다");
      const body = await request.json().catch(() => ({}));

      if (url.pathname === "/api/upload-url") {
        const ct = IMAGE_TYPES.includes(body.content_type) ? body.content_type : "image/jpeg";
        const d = await hf(env, "POST", "files/generate-upload-url", { content_type: ct });
        return json({ upload_url: d.upload_url, upload_headers: d.upload_headers || { "Content-Type": ct }, public_url: d.public_url, content_type: ct });
      }

      if (url.pathname === "/api/estimate") {
        const { body: req, usd } = buildRequest(env, body);
        return json({ usd, duration: req.duration, approx: true });
      }

      if (url.pathname === "/api/generate") {
        const { path, body: req, usd } = buildRequest(env, body);
        // 클립 1개 최대 비용 — 가격표 기준 예상이 넘으면 거절
        const maxUsd = Number(env.MAX_USD_PER_REQUEST) || 5;
        if (usd > maxUsd) throw new HttpError(400, `이 설정은 예상 비용이 $${usd.toFixed(2)} 로 클립 1개 한도($${maxUsd})를 넘습니다. 길이를 줄여 주세요.`);
        await spend(env, user, Number(env.LIMIT_GEN_PER_DAY) || 200);
        const idem = request.headers.get("Idempotency-Key");
        const d = await hf(env, "POST", path, req, idem ? { "Idempotency-Key": idem.slice(0, 80) } : undefined);
        if (!d.request_id) throw new HttpError(502, "Higgsfield 응답에 요청 번호가 없습니다");
        return json({ request_id: d.request_id, status: d.status || "queued", estimate_usd: usd });
      }

      throw new HttpError(404, "알 수 없는 경로입니다");
    } catch (err) {
      return json({ error: err.message || "서버 오류" }, err instanceof HttpError ? err.status : 500);
    }
  },
};
