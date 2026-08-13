/**
 * BUYEST Kids — Studio API Worker
 * muapi.ai 를 대신 호출해서 API 키를 클라이언트에 노출하지 않는 프록시.
 *
 * 배포 전 준비:
 *   1) wrangler secret put MUAPI_API_KEY   ← muapi.ai/access-keys 에서 발급받은 키
 *   2) 아래 ALLOWED_ORIGIN 을 본인 GitHub Pages 도메인으로 변경
 *
 * 라우트:
 *   POST /api/upload      — 브라우저의 base64 이미지를 muapi에 업로드하고 실제 URL로 변환
 *   POST /api/retouch     — 이미지 보정 (업스케일/디테일 개선)
 *   POST /api/background  — 배경 합성/제거
 *   POST /api/reel        — 이미지 → 짧은 릴스 영상
 *   POST /api/cinema      — 카메라 값 지정 프리미엄 영상
 *   GET  /api/result?id=  — 비동기 작업 결과 폴링 (모든 작업이 request_id를 반환하므로 공용으로 사용)
 *
 * muapi.ai API 규격(공식 문서/CLI 기준): 모든 모델 호출은
 *   POST https://api.muapi.ai/api/v1/{model-endpoint} → { request_id, status }
 *   GET  https://api.muapi.ai/api/v1/predictions/{request_id}/result → { status, outputs: [url, ...] }
 * 인증 헤더는 x-api-key (Authorization: Bearer 아님).
 */

const ALLOWED_ORIGIN = "https://buyestkorea-code.github.io";
const MUAPI_BASE = "https://api.muapi.ai/api/v1";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

async function callMuapi(env, endpoint, body) {
  const res = await fetch(`${MUAPI_BASE}/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.MUAPI_API_KEY,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || data?.message || `muapi 요청 실패 (${res.status})`);
  }
  return data;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(request.url);

    try {
      // 결과 폴링 — 모든 작업이 request_id를 반환하므로 공용 경로
      if (url.pathname === "/api/result" && request.method === "GET") {
        const requestId = url.searchParams.get("id");
        if (!requestId) return json({ error: "id 파라미터가 필요합니다" }, 400);
        const res = await fetch(`${MUAPI_BASE}/predictions/${requestId}/result`, {
          headers: { "x-api-key": env.MUAPI_API_KEY },
        });
        const data = await res.json();
        return json(data);
      }

      if (request.method !== "POST") {
        return json({ error: "지원하지 않는 메서드입니다" }, 405);
      }

      // 업로드 — 브라우저에서 받은 base64 이미지를 muapi에 올려 실제 접근 가능한 URL로 변환
      // (muapi 모델 엔드포인트는 data: URI가 아닌 진짜 이미지 URL을 요구합니다)
      if (url.pathname === "/api/upload") {
        const { dataUrl } = await request.json();
        const match = /^data:([^;]+);base64,(.*)$/.exec(dataUrl || "");
        if (!match) return json({ error: "잘못된 이미지 데이터입니다" }, 400);
        const [, mime, base64] = match;
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const form = new FormData();
        form.append("file", new Blob([bytes], { type: mime }), "upload." + (mime.split("/")[1] || "jpg"));
        const res = await fetch(`${MUAPI_BASE}/upload_file`, {
          method: "POST",
          headers: { "x-api-key": env.MUAPI_API_KEY },
          body: form,
        });
        const data = await res.json();
        if (!res.ok) return json({ error: data?.error || `업로드 실패 (${res.status})` }, 500);
        const hostedUrl = data.url || data.file_url || (Array.isArray(data.output) ? data.output[0] : data.output);
        if (!hostedUrl) return json({ error: "업로드 응답에서 URL을 찾지 못했습니다" }, 500);
        return json({ url: hostedUrl });
      }

      const payload = await request.json();
      const { imageUrl, prompt } = payload;
      if (!imageUrl) return json({ error: "imageUrl이 필요합니다" }, 400);

      // 1) Ritocco — 이미지 보정 (업스케일)
      if (url.pathname === "/api/retouch") {
        const data = await callMuapi(env, "ai-image-upscale", { image_url: imageUrl });
        return json(data);
      }

      // 2) Sfondo — 배경 합성/제거
      if (url.pathname === "/api/background") {
        const { mode = "remove", backgroundPrompt } = payload;
        const data =
          mode === "remove"
            ? await callMuapi(env, "ai-background-remover", { image_url: imageUrl })
            : await callMuapi(env, "flux-kontext-pro-i2i", {
                prompt: backgroundPrompt || prompt || "studio background, soft light",
                aspect_ratio: "match_input_image",
                num_images: 1,
                images_list: [imageUrl],
              });
        return json(data);
      }

      // 3) Reel — 이미지 → 짧은 영상
      if (url.pathname === "/api/reel") {
        const data = await callMuapi(env, "kling-v2.1-standard-i2v", {
          image_url: imageUrl,
          prompt: prompt || "subtle natural movement, product highlight, soft camera drift",
          duration: 5,
          aspect_ratio: "16:9",
        });
        return json(data);
      }

      // 4) Cinema — 카메라 값 지정 프리미엄 영상
      if (url.pathname === "/api/cinema") {
        const { focalLength = "35mm", aperture = "f/1.4" } = payload;
        const cinematicPrompt = `${prompt || "elegant product presentation"}, shot on ${focalLength} lens, ${aperture} aperture, cinematic color grade, soft rim light`;
        const data = await callMuapi(env, "kling-v2.1-pro-i2v", {
          image_url: imageUrl,
          prompt: cinematicPrompt,
          duration: 5,
          aspect_ratio: "16:9",
        });
        return json(data);
      }

      return json({ error: "알 수 없는 경로입니다" }, 404);
    } catch (err) {
      return json({ error: err.message || "서버 오류" }, 500);
    }
  },
};
