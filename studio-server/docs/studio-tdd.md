# Codex 자동 제작 스튜디오 검증

날짜: 2026-10-24. 사용자 요청에서 도출한 여정: 사진만 입력해 기획, 릴스와 카드뉴스를 만들고 결과를 다시 확인한다.

## RED → GREEN

- `npm test`: 최초 core.test.mjs 15개가 not implemented로 실패. RED 체크포인트 dce584b.
- 기획 검증·타이밍 자막·예산 검증·재시도 보존 구현 후 같은 15개 통과. GREEN 체크포인트 76a9e49.
- 추가 서버·프로바이더 계약·미디어 테스트 포함 `npm run test:coverage`: 35개 통과, 0개 실패.
- 측정된 core/media/providers: line 83.04%, branch 81.25%, function 82.76%. core line 100%. 자식 프로세스의 server.mjs와 브라우저 프런트는 이 수치에 포함되지 않는다.

| 보장 | 검증 | 결과 |
|---|---|---|
| 잘못된 사진/사진 참조와 빈 내레이션 거절 | core.test.mjs | PASS |
| 균등 분할이 아닌 음성 정렬값으로 자막 작성 | core.test.mjs, providers.test.mjs | PASS |
| 한도 초과·비용 누락 시 유료 영상 제출 차단 | core.test.mjs, providers.test.mjs | PASS |
| 재시도 시 완료한 음성과 장면 재사용 | core.test.mjs, providers.test.mjs | PASS |
| 키 미설정 시 실제 AI 제작 차단·샘플 구분 | server.test.mjs | PASS |
| 다른 사이트 쓰기, Host 변조, 비밀 파일 요청 차단 | server.test.mjs | PASS |
| 서버 재시작 후 작업과 기획 복구 | server.test.mjs | PASS |
| 실제 FFmpeg 자막 포함 MP4 출력 | media.test.mjs | PASS |
| 한글 카드 PNG·ZIP 생성 | media.test.mjs | PASS |

## 브라우저 수동 E2E

Chrome에서 로컬 화면 열기 → 샘플로 테스트 → 제작 완료 표시 확인.
샘플 프로젝트 8c2c1dc4-a0d2-4012-a923-6f0f3ed1101b: MP4 1개, PNG 5장, ZIP 링크 표시.
샘플은 AI 생성 아님·음성 없음 표시. 실제 AI 결과로 제시하지 않았다.

## 미검증

- API 키가 설정되지 않아 Gemini/Higgsfield/ElevenLabs/Creatomate의 실제 호출, 계정별 가용성·청구·품질은 확인하지 못했다.
- 클라우드 렌더와 라이선스 음악 합성은 코드 경로가 있으며 별도 실환경 검증이 필요하다.
- 공개 배포와 직원별 인증·프로젝트 접근권한은 로컬 테스트 범위에 포함하지 않는다.

## 실제 몽클레르 테스트 — 후속 검증

- 프로젝트: 2221993f-ede8-4227-9017-25c3988cee80. 사용자 지정 몽클레르 브랜드 페이지에서 상품 사진 6장 수집.
- Gemini 3.8 요청은 제한 시간 초과. Gemini 2.5는 신규 사용자 사용 불가 404. 계정에서 실제 응답한 Gemini 3.5 Flash-Lite + Interactions API로 기획 성공.
- AI 기획: 대표 패딩 3장면, 전체 6개 상품을 담은 카드뉴스 7장. 브랜드 오기(바이에스트)와 확인되지 않은 충전재 표현을 검수해 교정.
- ElevenLabs 실제 한국어 음성 생성 성공. normalized_alignment가 로마자를 반환하는 문제를 재현하고 원문 alignment 우선으로 수정. 회귀 테스트의 'tes' != '테스트' RED 확인 후 GREEN.
- Higgsfield 견적은 숫자가 아닌 요율 설명으로 반환됨. 설명형 응답 파싱과 10% 여유분을 포함한 추산 지원. 480p 요청 3장면 견적 추산 $3.61856, 영상 한도 $5.
- 실제 영상 생성 제출은 HTTP 403, detail=not_enough_credits로 거절됨. 완료된 유료 AI 영상은 없음. 사용자가 충전하지 않아 AI 장면 생성은 차단 상태.
- 완료 결과: 1080×1350 PNG 7개 + ZIP, 실제 TTS와 원문 타이밍 자막을 포함한 12초 720×1280 사진 모션 확인 영상. 확인 영상에는 AI 장면 생성 전임을 표시.
- 카드뉴스를 먼저 생성하고 영상 실패 시에도 결과를 제공하도록 수정. 신규 회귀 테스트 포함 38개 통과.
- 최신 측정 core/media/providers line 84.23%, branch 79.52%, functions 84.13%. 프런트·자식 프로세스 서버는 이 수치에서 제외.
- 실제 AI 장면 품질, Creatomate 유료 합성은 아직 미검증. 클라우드 충전은 실행하지 않았다.
