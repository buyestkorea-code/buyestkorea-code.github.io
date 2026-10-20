# 사진 자동 찾기 Worker (Cloudflare) — v2
- 주소: https://buyest-photo-finder.buyest.workers.dev  (화면: ../photo-finder.html)
- 배포: `cd photo-worker` → `npx wrangler login` → `npx wrangler deploy`
- 비밀값(구글 검색 키)은 Cloudflare에만 저장한다. 코드·저장소·채팅에 적지 말 것: `npx wrangler secret put SERPER_KEY`
- 엔드포인트: `GET /find?code=품번[&color=컬러][&stage=1|2]`, `GET /img?u=사진URL`, `GET /health`
- 접근 제한: 툴킷 사이트(buyestkorea-code.github.io)와 로컬 테스트(localhost)에서 온 요청만 허용한다. 다른 곳은 403.
- 동작: 1차 파트너 사이트(Cettire·Vitkac·TheDoubleF·Biffi·Fashion Square) 직접 조회 → 못 찾거나 사진이 작으면 2차 구글 검색(한국 사이트·BUYMA·브랜드 공식몰 제외). 품번이 정확히 같은 상품만 인정한다.
- 무료 플랜 한도: 요청 1건당 외부 호출 50회(코드는 44회로 제한)·CPU 10ms. 큰 HTML은 정규식으로만 훑는다.