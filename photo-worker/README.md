# 사진 자동 찾기 Worker (Cloudflare)
- 주소: https://buyest-photo-finder.buyest.workers.dev  (화면: ../photo-finder.html)
- 배포: `cd photo-worker && npx wrangler login && npx wrangler deploy`
- 비밀값(저장소에 넣지 말 것): `npx wrangler secret put SERPER_KEY`
- 엔드포인트: `/find?code=품번&color=컬러`, `/img?u=사진URL`
