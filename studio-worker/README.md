# 운영 카드뉴스 배포

- 화면: https://buyestkorea-code.github.io/studio/
- 기존 릴스: https://buyestkorea-code.github.io/studio/reels.html
- API: https://buyest-cards.buyest.workers.dev
- `npx wrangler@4.45.0 deploy --config studio-worker/wrangler.toml`
- Gemini 키는 Worker secret `GEMINI_API_KEY`로만 저장. 로컬 .env와 결과물은 커밋하지 않습니다.
- 직원 로그인은 기존 BUYEST toolkit 로그인 API로 매 요청 확인합니다.
- 기획은 직원당 하루 20회 KV 제한(동시 요청 경합에서는 엄격한 과금 상한이 아님).
- PNG/ZIP 생성과 결과 보관은 사용자의 브라우저에서 처리합니다. 다른 PC와 보관함이 동기화되지 않습니다.
- OpenAI/Higgsfield 유료 생성은 카드뉴스 운영 화면에서 호출하지 않습니다.
- 로컬 전체 릴스 자동 제작 실험은 studio-next 및 studio-server에 별도로 유지됩니다.
- GitHub Pages 반영에는 main push 후 빌드 시간이 필요합니다.
