/**
 * BUYEST 릴스 — Higgsfield 중계 Worker
 *
 * 사진 여러 장 + 프롬프트 → Higgsfield(Seedance) 가 릴스 영상을 만든다. 키는 이 Worker 의 비밀값에만 둔다.
 *
 *   GET  /api/health      설정 상태 (키가 있는지 여부만)
 *   POST /api/upload-url  사진 올릴 임시 주소 발급 → 브라우저가 사진을 직접 올림 (Worker 는 사진을 안 거침)
 *   POST /api/estimate    같은 설정의 정확한 예상 비용 (무료 조회)
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
const VERSION = "3.0.0";

// 쓸 수 있는 모델 (문서 확인: docs.higgsfield.ai · reference-to-video)
const MODELS = {
  seedance25: { label: "Seedance 2.5 (고품질, 최대 30초)", path: "bytedance/seedance-2.5/reference-to-video", minSec: 4, maxSec: 30, maxImages: 30 },
  seedance20: { label: "Seedance 2.0 (표준, 최대 15초)", path: "bytedance/seedance-2.0/reference-to-video", minSec: 4, maxSec: 15, maxImages: 9 },
};
const RESOLUTIONS = ["480p", "720p", "1080p"];
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const cors = () => ({
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,X-Studio-User,X-Studio-Pass,Idempotency-Key",
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

// 화면에서 온 설정 → 검증 → Higgsfield 요청 본문
function buildRequest(env, b) {
  const m = MODELS[b.model] || MODELS.seedance25;
  const maxImages = Math.min(m.maxImages, Number(env.MAX_IMAGES) || 8);
  const images = (Array.isArray(b.images) ? b.images : []).filter((u) => typeof u === "string" && /^https:\/\//.test(u)).slice(0, maxImages);
  if (!images.length) throw new HttpError(400, "사진이 필요합니다");
  const prompt = String(b.prompt || "").trim().slice(0, 2500);
  if (!prompt) throw new HttpError(400, "프롬프트(기획서)를 입력해 주세요");
  const duration = Math.min(m.maxSec, Math.max(m.minSec, Math.round(Number(b.duration) || 10)));
  const resolution = RESOLUTIONS.includes(b.resolution) ? b.resolution : "720p";
  return {
    path: m.path,
    body: { prompt, image_urls: images, duration, resolution, aspect_ratio: "9:16", generate_audio: b.audio !== false, bitrate_mode: "high" },
  };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: cors() });
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/health") {
        return json({ ok: true, version: VERSION, higgsfield: !!env.HF_API_KEY, limits: !!env.STUDIO_KV, maxUsd: Number(env.MAX_USD_PER_REQUEST) || 4, models: Object.entries(MODELS).map(([id, m]) => ({ id, label: m.label, minSec: m.minSec, maxSec: m.maxSec })) });
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
        const { path, body: req } = buildRequest(env, body);
        const d = await hf(env, "POST", `estimate/${path}`, req);
        return json({ usd: Number(d.usd), credits: Number(d.credits), duration: req.duration, resolution: req.resolution });
      }

      if (url.pathname === "/api/generate") {
        const { path, body: req } = buildRequest(env, body);
        // 요청 1건 최대 비용 — 예상 비용이 넘으면 거절
        const maxUsd = Number(env.MAX_USD_PER_REQUEST) || 4;
        let est = null;
        try { est = Number((await hf(env, "POST", `estimate/${path}`, req)).usd); } catch (e) { if (e.status === 402 || e.status === 503) throw e; }
        if (est != null && est > maxUsd) throw new HttpError(400, `이 설정은 예상 비용이 $${est.toFixed(2)} 로 1건 한도($${maxUsd})를 넘습니다. 길이나 해상도를 줄여 주세요.`);
        await spend(env, user, Number(env.LIMIT_GEN_PER_DAY) || 15);
        const idem = request.headers.get("Idempotency-Key");
        const d = await hf(env, "POST", path, req, idem ? { "Idempotency-Key": idem.slice(0, 80) } : undefined);
        if (!d.request_id) throw new HttpError(502, "Higgsfield 응답에 요청 번호가 없습니다");
        return json({ request_id: d.request_id, status: d.status || "queued", estimate_usd: est });
      }

      throw new HttpError(404, "알 수 없는 경로입니다");
    } catch (err) {
      return json({ error: err.message || "서버 오류" }, err instanceof HttpError ? err.status : 500);
    }
  },
};
