# BUYEST 릴스 — Higgsfield 중계 Worker

`studio/` 페이지(릴스 만들기)가 쓰는 서버입니다. 사진 여러 장 + 프롬프트를 Higgsfield(Seedance)에 보내 릴스 영상을 만듭니다.
키는 **Cloudflare 비밀값에만** 저장합니다 (화면 코드·저장소·채팅에 쓰지 마세요).

| 경로 | 하는 일 |
|---|---|
| `GET /api/health` | 키가 들어 있는지 여부만 표시 |
| `POST /api/upload-url` | 사진 올릴 임시 주소 발급 (브라우저가 사진을 직접 올림) |
| `POST /api/estimate` | 같은 설정의 **정확한 예상 비용** (무료 조회) |
| `POST /api/generate` | 영상 생성 요청 (유료, 성공한 건만 과금) |
| `GET /api/status` · `GET /api/media` | 진행 상태 확인 · 완성 영상 중계 |

모든 호출(health·media 제외)은 툴키트 직원 아이디·비번을 `buyest.co.kr` 툴키트 로그인으로 확인합니다.
안전장치: 영상 1건 예상 비용이 `MAX_USD_PER_REQUEST`($4)를 넘으면 서버가 거절 · 같은 요청 중복 방지(Idempotency-Key) · (선택) 직원 1명 하루 `LIMIT_GEN_PER_DAY`(15)회.

## 1. Higgsfield API 키 만들기 (한 번만)
1. https://open.higgsfield.ai 에서 로그인 → **API Keys** → 키 생성
2. 나온 키를 **복사한 그대로** 보관 (한 번만 보일 수 있음)
3. 같은 사이트의 결제/잔액 메뉴에서 잔액 충전 (쓴 만큼만 결제, 구독 없음)
4. 실패한 영상·내용 검수에서 거절된 영상은 과금되지 않습니다. 잔액은 https://console.higgsfield.ai 에서 확인 (공식 API에는 잔액 조회가 없어 화면에는 "이 브라우저에서 쓴 예상 금액"만 표시됩니다)

## 2. 배포 (PowerShell 에서 한 줄씩)
```powershell
cd C:\Users\win10\Desktop\클로드\wt-studio\reels-worker
```
```powershell
npm install
```
```powershell
npx wrangler login
```
브라우저가 열리면 Cloudflare 에서 **허용**.
```powershell
npx wrangler secret put HF_API_KEY
```
묻는 칸에 Higgsfield 키를 붙여넣고 Enter (화면에 안 보이는 게 정상). **키를 채팅에 붙여 넣지 마세요.**
```powershell
npx wrangler deploy
```
확인: `https://buyest-reels.buyest.workers.dev/api/health` 에 `"higgsfield":true` 가 보이면 끝입니다. (주소의 `buyest` 부분은 Cloudflare 계정 이름이라 배포 때 출력된 주소를 그대로 쓰세요. 다르면 알려 주세요.)

## 3. (선택) 직원 1명당 하루 한도
```powershell
npx wrangler kv namespace create STUDIO_KV
```
나온 `id` 를 `wrangler.toml` 의 `[[kv_namespaces]]` 주석을 풀고 넣은 뒤 다시 `npx wrangler deploy`.

## 비용 감각 (모델 페이지 표시 가격, 2026-10-21 확인)
Seedance 2.5 는 초당 약 $0.14~0.21, Seedance 2.0 은 초당 약 $0.10~0.14 부터 (해상도·할인에 따라 다름). 10초 720p 한 편이 대략 1~2달러대입니다.
화면의 **예상 비용 보기** 는 Higgsfield 가 계산해 주는 정확한 금액이고, 만들기 전에 한 번 더 확인창이 뜹니다. 줄이는 법: 해상도 480p, 길이 짧게, 모델 Seedance 2.0.

## 시험 상태
2026-10-21 기준 실제 키 없이 **모의 서버**로만 시험했습니다 (로그인 확인, 비용 상한, 업로드 주소, 상태·영상 중계, 위조 주소 차단, 화면 전체 흐름·소리 포함 합성). 실제 Higgsfield 호출과 `estimate` 경로, 브라우저의 사진 직접 업로드(CORS)는 배포 후 첫 사용 때 처음 확인됩니다.
