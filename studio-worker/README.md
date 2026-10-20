# BUYEST 영상 스튜디오 — AI 중계 Worker

`★ AI 자동 릴스` 탭이 쓰는 서버입니다. 키(Claude, muapi)는 **Cloudflare 비밀값에만** 저장하고 화면 코드·저장소·채팅에는 절대 쓰지 않습니다.

| 경로 | 하는 일 |
|---|---|
| `POST /api/plan` | 사진+기획서를 Claude 가 보고 릴스 콘티(훅·컷·자막·움직임 프롬프트·캡션) 작성 |
| `POST /api/upload` · `POST /api/motion` · `GET /api/result` · `GET /api/media` | 컷 사진 → 움직이는 영상 클립 (muapi Kling image-to-video, 9:16) — **유료** |
| `GET /api/health` | 키가 들어 있는지 여부만 표시 (값은 안 보냄) |
| `/api/retouch` `/api/background` `/api/reel` `/api/cinema` | 예전 Studio 용(그대로, 이제 로그인 필요) |

모든 호출(health 제외)은 툴키트 직원 아이디·비번(헤더)을 `buyest.co.kr` 툴키트 로그인으로 확인합니다. 예전 Worker 는 주소만 알면 누구나 유료 호출을 할 수 있었는데, 이번에 막았습니다.

## 배포 (한 번만, PowerShell 에서 한 줄씩)

```powershell
cd C:\Users\win10\Desktop\클로드\wt-studio\studio-worker
npm install
npx wrangler login
```
브라우저가 열리면 Cloudflare 에서 **허용**을 누르세요.

```powershell
npx wrangler secret put ANTHROPIC_API_KEY
```
묻는 칸에 Claude API 키를 붙여 넣고 Enter (화면에 안 보이는 게 정상). 키는 console.anthropic.com 에서 발급합니다. **이 명령 결과나 키를 채팅에 붙여 넣지 마세요.**
`MUAPI_API_KEY` 는 이미 같은 이름의 Worker(`buyest-studio`)에 저장돼 있어 다시 넣지 않아도 됩니다. (배포 후 `/api/health` 에서 `muapi: false` 로 나오면 `npx wrangler secret put MUAPI_API_KEY` 로 넣으세요.)

```powershell
npx wrangler deploy
```

확인: 브라우저에서 `https://buyest-studio.buyest.workers.dev/api/health` 를 열어 `"claude":true,"muapi":true` 가 보이면 끝입니다.

## (선택) 직원 1명당 하루 사용 한도
영상 생성은 건당 요금이 나가니 한도를 걸어 두는 것을 권합니다.
```powershell
npx wrangler kv namespace create STUDIO_KV
```
나온 `id` 를 `wrangler.toml` 의 `[[kv_namespaces]]` 주석을 풀고 넣은 뒤 다시 `npx wrangler deploy`. 기본 한도: 기획 60회, 영상 40건 / 직원·일 (`wrangler.toml` 의 `[vars]` 에서 변경).

## 모델·비용 메모
- 기획 모델: `claude-opus-5-5` (`wrangler.toml` 의 `PLAN_MODEL`). 1회에 사진 몇 장+기획서를 읽고 콘티를 쓰므로 대략 몇 센트 수준 (실측 전).
- 영상 생성: muapi 요금표 기준. 컷 1개 = 클립 1건. 실제 건당 가격은 muapi 잔액 변화로 첫 시험 때 확인하세요.
- 안전 설정: 콘티의 사진 번호·컷 길이는 서버에서 범위를 정리하고, 과장어·병행수입 주의 표현은 경고로 표시합니다.

## 시험 상태
2026-10-20 기준, 실제 키 없이 **모의 응답**으로만 시험했습니다 (로그인 확인, 콘티 정리, 서명된 영상 중계, 위조 주소 차단, 번들 빌드). 실제 Claude·muapi 호출은 배포 후 첫 사용 때 처음 확인됩니다.
