/**
 * BUYEST 영상 스튜디오 — AI 중계 Worker (v2)
 *
 * 하는 일
 *   POST /api/plan     사진 + 기획서를 보고 Claude 가 릴스 콘티(훅·컷·자막·움직임 프롬프트·캡션)를 짠다
 *   POST /api/upload   사진 1장을 muapi 에 올려 영상 생성에 쓸 수 있는 주소로 바꾼다
 *   POST /api/motion   사진 1장 → 움직이는 영상 클립 (muapi · Kling image-to-video, 9:16)  ← 유료
 *   GET  /api/result   영상 생성 결과 확인 (끝나면 브라우저가 받을 수 있는 중계 주소를 같이 준다)
 *   GET  /api/media    muapi 가 만든 영상 파일 중계 (이 Worker 가 서명한 주소만)
 *   GET  /api/health   설정 상태(키가 들어 있는지 여부만, 값은 절대 안 보냄)
 *   (예전 Studio 용) /api/retouch /api/background /api/reel /api/cinema — 그대로 유지, 이제 로그인 필요
 *
 * 비밀값 (Cloudflare 에만 저장, 코드·저장소·채팅에 쓰지 말 것)
 *   MUAPI_API_KEY        기존 그대로 (이미 저장돼 있음)
 *   ANTHROPIC_API_KEY    기획(Claude) 용 — npx wrangler secret put ANTHROPIC_API_KEY
 *
 * 접근 통제: 모든 호출은 툴키트 직원 아이디·비번(헤더 X-Studio-User / X-Studio-Pass)을
 *   buyest.co.kr 의 툴키트 로그인으로 확인한다. 주소를 아는 외부인이 유료 호출을 못 하게 하는 장치.
 *   (CORS 는 브라우저만 막는 것이라 이것만으로는 부족해서 로그인 확인을 넣었다.)
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const ALLOWED_ORIGIN = "https://buyestkorea-code.github.io";
const MUAPI_BASE = "https://api.muapi.ai/api/v1";
const LOGIN_API = "https://buyest.co.kr/toolkit_dashboard_api.php";
const VERSION = "2.0.0";

// ── 공통 ─────────────────────────────────────────────
const cors = () => ({
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,X-Studio-User,X-Studio-Pass",
  "Access-Control-Max-Age": "600",
  Vary: "Origin",
});
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...cors() } });
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function hmac(key, msg) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

// ── 직원 로그인 확인 (10분 기억) ───────────────────────
const loginCache = new Map();
async function requireStaff(request) {
  const user = (request.headers.get("X-Studio-User") || "").trim();
  const pass = request.headers.get("X-Studio-Pass") || "";
  if (!user || !pass) throw new HttpError(401, "로그인이 필요합니다. 툴키트에서 로그인한 뒤 새로고침해 주세요.");
  let key;
  try { key = user + ":" + (await sha256(pass)); } catch (_) { key = user + ":" + pass.length; }
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

// ── 하루 사용량 제한 (KV 를 연결했을 때만) ─────────────
async function spend(env, user, kind, count, limit) {
  if (!env.STUDIO_KV) return;
  const day = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); // 한국 날짜
  const key = `use:${day}:${user}:${kind}`;
  const used = Number(await env.STUDIO_KV.get(key)) || 0;
  if (used + count > limit) throw new HttpError(429, `오늘 ${kind === "motion" ? "영상 생성" : "AI 기획"} 한도(${limit}회)를 넘었습니다. 내일 다시 사용해 주세요.`);
  await env.STUDIO_KV.put(key, String(used + count), { expirationTtl: 2 * 86400 });
}

// ── muapi ────────────────────────────────────────────
async function callMuapi(env, endpoint, body) {
  if (!env.MUAPI_API_KEY) throw new HttpError(500, "muapi 키가 Worker 에 설정돼 있지 않습니다.");
  const res = await fetch(`${MUAPI_BASE}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": env.MUAPI_API_KEY },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(502, data?.detail?.error?.message || data?.error || data?.message || `muapi 요청 실패 (${res.status})`);
  return data;
}
const outputUrls = (d) => {
  const o = d?.outputs ?? d?.output ?? d?.url ?? [];
  return (Array.isArray(o) ? o : [o]).filter((x) => typeof x === "string" && /^https:\/\//.test(x));
};

// ── 기획 (Claude) ─────────────────────────────────────
const SLOP = ["역대급", "미쳤다", "미친", "대박", "꿀템", "무조건", "강추", "인생템", "핫한", "완벽한", "압도적", "혁신적", "놓치지 마세요", "지금 바로", "서두르세요", "갓성비"];
const RISKY = ["최저가", "공식 수입", "공식수입", "정식 수입", "정식수입", "공식 매장", "공식매장", "공식 판매", "100% 정품 보장", "본사"];

const Shot = z.object({
  photo: z.number().describe("이 컷에 쓸 사진 번호 (1부터)"),
  seconds: z.number().describe("컷 길이(초), 2~5"),
  caption: z.string().describe("이 컷의 화면 글자. 16자 이하, 없으면 빈 문자열"),
  motion: z.string().describe("사진을 움직이는 영상으로 만들 때 쓸 영어 프롬프트. 카메라 움직임과 아주 작은 자연스러운 움직임만"),
  why: z.string().describe("이 컷을 왜 이렇게 넣었는지 한국어 한 줄"),
});
const Plan = z.object({
  title: z.string().describe("작업용 제목"),
  hook: z.string().describe("첫 2초에 뜨는 훅 문장. 24자 이하, 숫자 포함 권장"),
  shots: z.array(Shot),
  price_line: z.string().describe("마지막 화면 가격 표기. 사용자가 준 값만, 없으면 빈 문자열"),
  cta: z.string().describe("마지막 요청 하나"),
  caption: z.string().describe("인스타 캡션 (앞 125자 안에 핵심과 요청 하나)"),
  hashtags: z.array(z.string()).describe("해시태그 3~5개"),
  notes: z.string().describe("직원에게 전할 한국어 메모 (부족한 정보, 확인할 점)"),
});

function systemPrompt(brand) {
  const kids = brand === "kids";
  return [
    "당신은 BUYEST 의 인스타그램 릴스 감독입니다. 직원이 준 상품 사진과 기획서를 보고 9:16 릴스 콘티를 짭니다.",
    `브랜드: ${kids ? "BUYEST Kids (디자이너 키즈 편집숍)" : "BUYEST (명품 병행수입 편집숍)"} — 대구, 18년째 이탈리아 부티크와 직거래, KREAM 입점.`,
    kids ? "톤: 따뜻하고 가볍게, 부모 시선(소재·사이즈·선물)." : "톤: 차분하고 신뢰감 있게, 과장 없이. 핵심은 정품 신뢰 + 합리적 가격.",
    "",
    "릴스 규칙",
    "- 훅은 첫 2초. 인사·주목 요청으로 시작하지 말고 숫자나 구체적 사실로 시작. 24자 이하.",
    "- 한 컷에 생각 하나. 컷마다 화면 글자는 16자 이하. 말투는 짧고 담백하게.",
    "- 마지막 컷의 글자는 훅의 낱말 하나를 다시 쓰면 다시 보기가 늘어난다.",
    "- 요청(CTA)은 하나만.",
    "- 가격·수량·사이즈 같은 숫자는 직원이 준 것만 쓴다. 없으면 만들지 말고 notes 에 '가격 필요'라고 적는다.",
    "- 사진에 실제로 보이는 것(색·소재·로고·디테일)만 말한다. 보이지 않는 사실을 지어내지 않는다. 브랜드 로고·제품 형태를 바꾸는 연출 금지.",
    `- 쓰지 말 것: ${SLOP.join(", ")} 같은 과장어 / ${RISKY.join(", ")} 같은 표현(공식 수입원으로 오해될 말, 근거 없는 최저가). 거래 부티크 이름·매입가도 쓰지 말 것.`,
    "",
    "컷 구성",
    "- 사진을 다 쓸 필요는 없다. 가장 좋은 순서로 고르고, 같은 사진을 다른 컷에 다시 써도 된다.",
    "- 컷 길이는 2~5초. 전체 길이는 요청한 목표 길이에 맞춘다(마지막 가격·요청 화면 2.5초는 따로 붙으니 제외).",
    "- motion 은 영어로, 사진을 5초 영상으로 움직일 때의 지시. 예: 'slow gentle push-in, soft natural light shifts, fabric subtly moves'. 상품이 변하거나 사람 얼굴이 바뀌거나 글자가 생기는 지시는 금지. 사진에 사람이 없으면 사람을 만들지 말 것.",
  ].join("\n");
}

async function makePlan(env, body) {
  if (!env.ANTHROPIC_API_KEY) throw new HttpError(503, "AI 기획용 Claude 키(ANTHROPIC_API_KEY)가 Worker 에 아직 설정되지 않았습니다. 아래 '직접 붙여넣기' 방식을 쓰거나 담당자에게 키 등록을 요청하세요.");
  const photos = (Array.isArray(body.photos) ? body.photos : []).slice(0, 8);
  if (!photos.length) throw new HttpError(400, "사진이 필요합니다");
  const brand = body.brand === "kids" ? "kids" : "buyest";
  const seconds = Math.min(45, Math.max(10, Number(body.seconds) || 20));
  const maxShots = Math.min(8, Math.max(2, Number(body.maxShots) || 6));
  const content = [];
  photos.forEach((p, i) => {
    const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(String(p.dataUrl || ""));
    if (!m) throw new HttpError(400, `사진 ${i + 1} 형식이 잘못됐습니다`);
    if (m[2].length > 1_400_000) throw new HttpError(413, `사진 ${i + 1} 이 너무 큽니다 (화면에서 줄여 보내야 합니다)`);
    content.push({ type: "text", text: `사진 ${i + 1}` });
    content.push({ type: "image", source: { type: "base64", media_type: m[1], data: m[2] } });
  });
  const info = [
    body.brandName && `브랜드명: ${body.brandName}`, body.productName && `상품명: ${body.productName}`,
    body.price && `바이스트 가격: ${body.price}`, body.deptPrice && `백화점가: ${body.deptPrice}`, body.size && `사이즈: ${body.size}`,
  ].filter(Boolean).join("\n");
  content.push({
    type: "text",
    text: [
      "아래 기획서대로 릴스 콘티를 짜 주세요.",
      `목표 길이: 약 ${seconds}초 (컷 합계 ${Math.max(6, seconds - 3)}초 안팎), 컷은 최대 ${maxShots}개`,
      body.style ? `영상 스타일: ${body.style}` : "",
      info ? `\n[상품 정보]\n${info}` : "",
      `\n[기획서]\n${String(body.brief || "").slice(0, 4000) || "(기획서 없음 — 사진을 보고 가장 좋은 방향으로)"}`,
    ].filter(Boolean).join("\n"),
  });

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  let res;
  try {
    res = await client.messages.parse({
      model: env.PLAN_MODEL || "claude-opus-5-5",
      max_tokens: 16000,
      system: systemPrompt(brand),
      messages: [{ role: "user", content }],
      output_config: { format: zodOutputFormat(Plan) },
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, "AI 기획 요청이 몰렸습니다. 잠시 뒤 다시 시도해 주세요.");
    if (e instanceof Anthropic.AuthenticationError) throw new HttpError(503, "Claude 키가 올바르지 않습니다. 담당자에게 알려 주세요.");
    if (e instanceof Anthropic.APIError) throw new HttpError(502, `Claude 호출 실패 (${e.status}): ${e.message}`);
    throw e;
  }
  if (res.stop_reason === "refusal") throw new HttpError(422, "AI 가 이 요청을 처리하지 않았습니다. 사진이나 기획서 내용을 바꿔서 다시 시도해 주세요.");
  const plan = res.parsed_output;
  if (!plan) throw new HttpError(502, "AI 기획 결과를 읽지 못했습니다. 다시 시도해 주세요.");
  return { plan: sanitizePlan(plan, photos.length, maxShots), usage: res.usage };
}

// 모델 출력이 어떻게 나와도 화면이 깨지지 않게 범위를 정리하고, 위험 표현을 찾아 경고로 돌려준다
function sanitizePlan(plan, nPhotos, maxShots) {
  const clean = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);
  const shots = (plan.shots || []).slice(0, maxShots).map((s) => ({
    photo: Math.min(nPhotos, Math.max(1, Math.round(Number(s.photo) || 1))),
    seconds: Math.min(5, Math.max(2, Math.round((Number(s.seconds) || 3) * 2) / 2)),
    caption: clean(s.caption, 30), motion: clean(s.motion, 400), why: clean(s.why, 120),
  }));
  if (!shots.length) shots.push({ photo: 1, seconds: 3, caption: "", motion: "slow gentle push-in, soft natural light", why: "" });
  const out = {
    title: clean(plan.title, 60), hook: clean(plan.hook, 40), shots, price_line: clean(plan.price_line, 30), cta: clean(plan.cta, 40),
    caption: String(plan.caption || "").trim().slice(0, 1500), hashtags: (plan.hashtags || []).slice(0, 5).map((h) => clean(h, 30)), notes: clean(plan.notes, 400),
  };
  const all = [out.hook, out.cta, out.caption, ...shots.map((s) => s.caption)].join("\n");
  out.warnings = [
    ...SLOP.filter((w) => all.includes(w)).map((w) => `과장어: ${w}`),
    ...RISKY.filter((w) => all.includes(w)).map((w) => `병행수입 주의 표현: ${w}`),
  ];
  return out;
}

// ── 라우터 ────────────────────────────────────────────
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: cors() });
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/health") {
        return json({ ok: true, version: VERSION, claude: !!env.ANTHROPIC_API_KEY, muapi: !!env.MUAPI_API_KEY, limits: !!env.STUDIO_KV, planModel: env.PLAN_MODEL || "claude-opus-5-5" });
      }

      // 영상 파일 중계 (서명된 주소만 — 로그인 헤더 없이도 <video> 가 받을 수 있게)
      if (url.pathname === "/api/media" && request.method === "GET") {
        const target = url.searchParams.get("u") || "", sig = url.searchParams.get("s") || "";
        if (!/^https:\/\//.test(target) || sig !== (await hmac(env.MUAPI_API_KEY || "none", target))) throw new HttpError(403, "허용되지 않은 주소입니다");
        const up = await fetch(target);
        if (!up.ok) throw new HttpError(502, `영상 파일을 가져오지 못했습니다 (${up.status})`);
        return new Response(up.body, { status: 200, headers: { "Content-Type": up.headers.get("Content-Type") || "video/mp4", "Cache-Control": "private, max-age=3600", ...cors() } });
      }

      const user = await requireStaff(request);

      if (url.pathname === "/api/result" && request.method === "GET") {
        const id = url.searchParams.get("id");
        if (!id) throw new HttpError(400, "id 파라미터가 필요합니다");
        const r = await fetch(`${MUAPI_BASE}/predictions/${encodeURIComponent(id)}/result`, { headers: { "x-api-key": env.MUAPI_API_KEY } });
        const data = await r.json().catch(() => ({}));
        const urls = outputUrls(data);
        const media = [];
        for (const u of urls) media.push(`${url.origin}/api/media?u=${encodeURIComponent(u)}&s=${await hmac(env.MUAPI_API_KEY || "none", u)}`);
        return json({ ...data, media }, r.ok ? 200 : r.status);
      }

      if (request.method !== "POST") throw new HttpError(405, "지원하지 않는 메서드입니다");

      if (url.pathname === "/api/plan") {
        await spend(env, user, "plan", 1, Number(env.LIMIT_PLAN_PER_DAY) || 60);
        const body = await request.json();
        return json(await makePlan(env, body));
      }

      if (url.pathname === "/api/upload") {
        const { dataUrl } = await request.json();
        const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl || "");
        if (!m) throw new HttpError(400, "잘못된 이미지 데이터입니다");
        const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
        if (bytes.length > 6_000_000) throw new HttpError(413, "이미지가 너무 큽니다");
        const form = new FormData();
        form.append("file", new Blob([bytes], { type: m[1] }), "upload." + (m[1].split("/")[1] || "jpg"));
        const res = await fetch(`${MUAPI_BASE}/upload_file`, { method: "POST", headers: { "x-api-key": env.MUAPI_API_KEY }, body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new HttpError(502, data?.error || `업로드 실패 (${res.status})`);
        const hosted = data.url || data.file_url || (Array.isArray(data.output) ? data.output[0] : data.output);
        if (!hosted) throw new HttpError(502, "업로드 응답에서 URL을 찾지 못했습니다");
        return json({ url: hosted });
      }

      // 사진 → 움직이는 영상 클립 (유료)
      if (url.pathname === "/api/motion") {
        const { imageUrl, prompt, seconds, quality } = await request.json();
        if (!/^https:\/\//.test(imageUrl || "")) throw new HttpError(400, "imageUrl 이 필요합니다");
        await spend(env, user, "motion", 1, Number(env.LIMIT_MOTION_PER_DAY) || 40);
        const data = await callMuapi(env, quality === "pro" ? "kling-v2.1-pro-i2v" : "kling-v2.1-standard-i2v", {
          image_url: imageUrl,
          prompt: String(prompt || "slow gentle push-in, soft natural light, subtle natural movement").slice(0, 500),
          duration: Number(seconds) >= 10 ? 10 : 5,
          aspect_ratio: "9:16",
        });
        return json(data);
      }

      // 예전 Studio 용 경로 (이제 로그인 필요)
      const payload = await request.json();
      const { imageUrl, prompt } = payload;
      if (!imageUrl) throw new HttpError(400, "imageUrl이 필요합니다");
      if (url.pathname === "/api/retouch") return json(await callMuapi(env, "ai-image-upscale", { image_url: imageUrl }));
      if (url.pathname === "/api/background") {
        const { mode = "remove", backgroundPrompt } = payload;
        return json(mode === "remove"
          ? await callMuapi(env, "ai-background-remover", { image_url: imageUrl })
          : await callMuapi(env, "flux-kontext-pro-i2i", { prompt: backgroundPrompt || prompt || "studio background, soft light", aspect_ratio: "match_input_image", num_images: 1, images_list: [imageUrl] }));
      }
      if (url.pathname === "/api/reel") return json(await callMuapi(env, "kling-v2.1-standard-i2v", { image_url: imageUrl, prompt: prompt || "subtle natural movement, product highlight, soft camera drift", duration: 5, aspect_ratio: "16:9" }));
      if (url.pathname === "/api/cinema") {
        const { focalLength = "35mm", aperture = "f/1.4" } = payload;
        return json(await callMuapi(env, "kling-v2.1-pro-i2v", { image_url: imageUrl, prompt: `${prompt || "elegant product presentation"}, shot on ${focalLength} lens, ${aperture} aperture, cinematic color grade, soft rim light`, duration: 5, aspect_ratio: "16:9" }));
      }
      throw new HttpError(404, "알 수 없는 경로입니다");
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      return json({ error: err.message || "서버 오류" }, status);
    }
  },
};
