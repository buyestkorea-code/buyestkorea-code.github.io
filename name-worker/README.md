# 상품명 AI 자동생성 Worker (Cloudflare)
- 화면: `../photo-auto.html` → ② 파일 → 상품 사진 목록 바로 아래 "AI 이름 자동생성" (코드: `../assets/photo-auto/namegen.js`)
- 주소: https://buyest-namegen.buyest.workers.dev  (다르면 `namegen.js` 맨 위 `WK` 값만 바꾸면 됨)
- 동작: 사진 1~3장(화면에서 1024px로 줄여 전송) + 브랜드·시즌·품번·사이트 구분 → Gemini 비전(무료 키)이 후보 4개 작성. 브랜드·시즌·품번은 AI가 짓지 않고 입력칸 값을 그대로 붙인다.
- 학습자료: `../assets/photo-auto/namebook.json` (메인+키즈 상품명 약 2만 3천 개에서 뽑은 아이템·색상·디테일 어휘, 브랜드별 대표 예시 10개, 전체 대표 예시 347개). Worker 가 1시간마다 이 파일을 읽어 지시문에 넣는다 → 갱신해서 push 만 하면 반영.

## 배포 (PowerShell 에서 한 줄씩)
```powershell
cd <저장소>\name-worker
npx wrangler login
npx wrangler secret put GEMINI_API_KEY
npx wrangler deploy
```
키는 묻는 칸에만 붙여넣는다 (화면에 안 보이는 게 정상). **채팅·코드·저장소에 쓰지 말 것.**
확인: `https://buyest-namegen.<계정>.workers.dev/api/health` 에 `"ready":true`.
접근 제한: 툴킷 사이트에서 온 요청 + 툴킷 직원 로그인(아이디·비번을 buyest.co.kr 로 확인)만 허용. 직원별 하루 한도는 KV 를 연결하면 적용(`wrangler.toml` 주석 참고).

## 학습자료 갱신 (상품이 많이 늘었을 때, 읽기 전용)
```bash
for d in buyest buyest_kids; do ssh -i ~/.ssh/buyest_server root@175.126.82.226 "mysql $d --default-character-set=utf8mb4 -N -e \"select p.pid, ifnull(b.brand_name_kr,''), p.product_display, replace(p.product_name,'\t',' ') from max_product p left join max_brand b on b.bid=p.product_brand\"" > $d.tsv; done
node tools/build-namebook.js buyest.tsv buyest_kids.tsv
```
namebook.json 에는 사이트에 이미 공개된 상품명과 집계만 들어간다 (가격·재고·고객정보 없음).
