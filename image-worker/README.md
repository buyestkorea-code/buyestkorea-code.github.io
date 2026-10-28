# BUYEST 스튜디오 V2 — 이미지 중계 Worker (Gemini / OpenAI)

`studio-v2/` 화면(인스타 룩북·런웨이·모델컷)이 쓰는 서버입니다. 상품 사진 + 프롬프트를 Gemini 또는 OpenAI 에 보내 이미지를 만듭니다.
키는 **Cloudflare 비밀값에만** 저장합니다 (화면 코드·저장소·채팅에 쓰지 마세요). 둘 중 하나만 등록해도 동작합니다.

| 경로 | 하는 일 |
|---|---|
| `GET /api/health` | 어떤 키가 들어 있는지 여부만 표시 |
| `POST /api/generate` | `{provider, prompt, images[], aspect, n}` → 이미지(dataURL) 배열 |

모든 호출(health 제외)은 툴키트 직원 아이디·비번을 `buyest.co.kr` 툴키트 로그인으로 확인합니다. (영상 Worker `buyest-reels` 와 같은 방식)

## 1. 키 만들기 (한 번만)
- **Gemini**: https://aistudio.google.com/apikey → 키 생성. 이미지 생성은 유료 결제(Billing) 연결이 필요할 수 있습니다.
- **OpenAI**: https://platform.openai.com/api-keys → 키 생성 후 잔액 충전. `gpt-image-1` 은 조직 인증(Verify Organization)을 요구할 수 있습니다.

## 2. 배포 (PowerShell 에서 한 줄씩)
```powershell
cd C:\Users\win10\Desktop\클로드\wt-studio\image-worker
```
```powershell
npm install
```
```powershell
npx wrangler login
```
```powershell
npx wrangler secret put GEMINI_API_KEY
```
```powershell
npx wrangler secret put OPENAI_API_KEY
```
묻는 칸에 키를 붙여넣고 Enter (화면에 안 보이는 게 정상). **키를 채팅에 붙여 넣지 마세요.** 쓰지 않을 쪽은 건너뛰어도 됩니다.
```powershell
npx wrangler deploy
```
확인: `https://buyest-lookbook.<계정이름>.workers.dev/api/health` 에 `"ready":true` 가 보이면 끝입니다.
배포 때 출력된 주소가 `https://buyest-lookbook.buyest.workers.dev` 와 다르면, 화면 코드(`studio-v2/index.html`)의 기본 주소를 그 주소로 바꿔야 합니다 (알려 주세요).

## 3. 조정하는 곳 (`wrangler.toml` 의 `[vars]`)
- `GEMINI_MODEL`, `OPENAI_MODEL` — 모델 이름이 바뀌면 여기만 수정 후 `npx wrangler deploy`
- `OPENAI_QUALITY` — `low` / `medium` / `high` (high 는 비쌈)
- `LIMIT_IMAGES_PER_DAY` — 직원 1명 하루 장수 (KV 연결 시: `npx wrangler kv namespace create STUDIO_KV` → id 를 `wrangler.toml` 에 넣기)

## 비용 감각 (화면 안내용 추정치, 실제는 각 콘솔에서 확인)
Gemini 약 $0.04/장, OpenAI(medium) 약 $0.06/장. 6장 세트가 대략 300~500원입니다.

## 시험 상태
2026-10-29 기준 실제 키 없이 **모의 서버**로 화면 전체 흐름(촬영·표시·글자/로고 편집·저장)만 확인했습니다. 실제 Gemini/OpenAI 호출(요청 형식·응답 해석)은 키 등록 후 첫 사용 때 처음 확인됩니다. 오류가 나면 화면에 나온 문구를 그대로 알려 주세요.
