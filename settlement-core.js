/* BUYEST 정산 검증 — 핵심 로직 (브라우저 + Node 공용)
 * 1) 통장 엑셀 5종 파서: parseBank(aoa) → {bank, rows[]}
 * 2) 쇼핑몰 정의(SHOPS): 정산체크 방법(매뉴얼) · 입금 은행 · 입금자 매칭 규칙 · 기본 입력 항목
 * 3) 대조 계산: matchTx / compute
 * 기준: "입금월" — 통장에 돈이 들어온 달 (8월 판매분이 9월에 들어오면 9월 칸에서 확인)
 */
(function (root) {
  'use strict';

  /* ---------- 공통 유틸 ---------- */
  function num(v) {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var n = parseFloat(String(v).replace(/[,원\s]/g, ''));
    return isFinite(n) ? n : 0;
  }
  function str(v) { return v === null || v === undefined ? '' : String(v).trim(); }
  // '2026.09.30 18:07:09' / '2026/09/30  20:23:52' / '2026-09-30'+'20:03:52' → '2026-09-30 18:07:09'
  function normDT(d, t) {
    var s = (str(d) + ' ' + str(t)).trim();
    var m = s.match(/(\d{4})[.\-\/](\d{2})[.\-\/](\d{2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return '';
    var p = function (x) { return ('0' + (x || '0')).slice(-2); };
    return m[1] + '-' + m[2] + '-' + m[3] + ' ' + p(m[4]) + ':' + p(m[5]) + ':' + p(m[6]);
  }

  /* ---------- 통장 파서 ---------- */
  function findHeader(aoa, must) {
    for (var i = 0; i < Math.min(aoa.length, 40); i++) {
      var cells = (aoa[i] || []).map(str);
      var ok = must.every(function (k) { return cells.indexOf(k) >= 0; });
      if (ok) return { row: i, idx: function (k) { return cells.indexOf(k); } };
    }
    return null;
  }

  var BANKS = {
    '신한':   { label: '신한' },
    '국민':   { label: '국민' },
    '우리':   { label: '우리' },
    '농협':   { label: '농협' },
    '신한SLS': { label: '신한 SLS' }
  };

  function parseBank(aoa) {
    var h, bank, rows = [], i, r;
    if ((h = findHeader(aoa, ['거래일자', '거래시간', '적요', '출금(원)', '입금(원)', '내용']))) {
      bank = '신한';
      for (i = h.row + 1; i < aoa.length; i++) {
        r = aoa[i]; if (!r || !str(r[h.idx('거래일자')])) continue;
        rows.push({ at: normDT(r[h.idx('거래일자')], r[h.idx('거래시간')]), party: str(r[h.idx('내용')]), memo: str(r[h.idx('적요')]),
          amt_in: num(r[h.idx('입금(원)')]), amt_out: num(r[h.idx('출금(원)')]), balance: num(r[h.idx('잔액(원)')]) });
      }
    } else if ((h = findHeader(aoa, ['No', '거래일시', '보낸분/받는분', '출금액(원)', '입금액(원)']))) {
      bank = '국민';
      for (i = h.row + 1; i < aoa.length; i++) {
        r = aoa[i]; if (!r || !str(r[h.idx('거래일시')])) continue;
        rows.push({ at: normDT(r[h.idx('거래일시')]), party: str(r[h.idx('보낸분/받는분')]), memo: str(r[h.idx('적요')]),
          amt_in: num(r[h.idx('입금액(원)')]), amt_out: num(r[h.idx('출금액(원)')]), balance: num(r[h.idx('잔액(원)')]) });
      }
    } else if ((h = findHeader(aoa, ['No.', '거래일시', '적요', '기재내용', '찾으신금액', '맡기신금액']))) {
      bank = '우리';
      for (i = h.row + 1; i < aoa.length; i++) {
        r = aoa[i]; if (!r || !str(r[h.idx('거래일시')])) continue;
        rows.push({ at: normDT(r[h.idx('거래일시')]), party: str(r[h.idx('기재내용')]), memo: str(r[h.idx('적요')]),
          amt_in: num(r[h.idx('맡기신금액')]), amt_out: num(r[h.idx('찾으신금액')]), balance: num(r[h.idx('거래후 잔액')]) });
      }
    } else if ((h = findHeader(aoa, ['순번', '거래일시', '출금금액', '입금금액', '거래후잔액', '거래내용', '거래기록사항']))) {
      bank = '농협';
      for (i = h.row + 1; i < aoa.length; i++) {
        r = aoa[i]; if (!r || !str(r[h.idx('거래일시')])) continue;
        var a = str(r[h.idx('거래내용')]), b = str(r[h.idx('거래기록사항')]);
        rows.push({ at: normDT(r[h.idx('거래일시')]), party: b ? a + '/' + b : a, memo: a,
          amt_in: num(r[h.idx('입금금액')]), amt_out: num(r[h.idx('출금금액')]), balance: num(r[h.idx('거래후잔액')]) });
      }
    } else if ((h = findHeader(aoa, ['No', '거래일시', '적요', '입금액', '출금액', '내용', '잔액']))) {
      bank = '신한SLS';
      for (i = h.row + 1; i < aoa.length; i++) {
        r = aoa[i]; if (!r || !str(r[h.idx('거래일시')])) continue;
        rows.push({ at: normDT(r[h.idx('거래일시')]), party: str(r[h.idx('내용')]), memo: str(r[h.idx('적요')]),
          amt_in: num(r[h.idx('입금액')]), amt_out: num(r[h.idx('출금액')]), balance: num(r[h.idx('잔액')]) });
      }
    } else {
      return { bank: null, rows: [], error: '지원하는 통장 양식(신한·국민·우리·농협·신한SLS)이 아니에요' };
    }
    rows = rows.filter(function (x) { return x.at; });
    // 같은 초에 동일 금액이 여러 번 있을 수 있어, 같은 파일 안에서의 순번을 붙여 중복 제거 키를 안정적으로 만든다
    var seen = {};
    rows.forEach(function (x) {
      var k = [bank, x.at, x.party, x.amt_in, x.amt_out, x.balance].join('|');
      seen[k] = (seen[k] || 0) + 1; x.dup_no = seen[k]; x.key = k + '|' + x.dup_no;
      x.bank = bank;
    });
    return { bank: bank, rows: rows };
  }

  /* ---------- 쇼핑몰 정의 ----------
   * pay   : 입금자 매칭. [{b:'은행(생략=전체)', re:/정규식/}] — 위에서부터 먼저 맞는 쇼핑몰이 가져감
   * how   : 정산체크 방법 (매뉴얼 원문)
   * bank  : 입금 은행(매뉴얼)
   * lines : 기본 입력 항목 (이름 뒤 '-'는 차감 항목, 입력은 양수로 해도 음수로 처리)
   * nobank: true면 통장 대조 없음
   */
  var G = ['정산금', '반품·교환비', '공제(광고비 등)'];
  var SHOPS = [
    { key: '트렌비', name: '트렌비', bank: '신한 / 트렌비', pay: [{ re: /트렌비/ }],
      how: '어드민 정산완료 탭 해당월(1일~말일) 매출 검색 → 정산대상금액, 반품교환비 확인 후 기재. 반품비는 주문 상세에서 확인. 첫째주 입금금액은 서버비 66,000원을 빼고 계산.',
      lines: ['구매확정기준', '반품교환비', '서버유지비-', '광고비-'] },
    { key: '발란', name: '발란', bank: '신한', pay: [{ re: /발란/ }],
      how: '기업회생 신청으로 정산금 지급 지연 중.', lines: ['반품비제외 정산금', '반품비', '광고비 후불제-'] },
    { key: '신세계', name: '신세계 (SSG)', bank: '신한 / SSG상품대', pay: [{ re: /SSG상품대/ }],
      how: '어드민 정산관리 > 지급현황에서 지급내역 확인 후 회차별 검색해 기재 [구매확정-지불금액].',
      lines: ['구매확정', '반품', '반품교환비 입금', '공제금액(광고비+서버비+적립금)-'] },
    { key: '신세계사이먼', name: '신세계 사이먼·아울렛', bank: '신한 / ㈜신세계사이먼', pay: [{ re: /신세계사이먼/ }],
      how: '테넌트 매출프로그램 정산관리 > 월정산서조회에서 해당월 검색 (예: 1월 매출 → 2월 입금). 사이먼(온라인) / 아울렛(모바일)로 구분.',
      lines: ['모바일 매출액 (SSG 아울렛)', '온라인 매출액 (사이먼)', '모바일 임대료-', '온라인 임대료-', '교환반품 배송비', '세액-'] },
    { key: '롯데홈쇼핑', name: '롯데홈쇼핑', bank: '신한 / 우리홈쇼핑', pay: [{ re: /우리홈쇼핑/ }],
      how: '[인터넷] 월정산내역(당월정산)에서 해당월 조회 후 엑셀 서식에 맞게 기재 (지급확정액).', lines: ['전월 3차 정산', '당월 1차 정산', '당월 2차 정산'] },
    { key: '바이스트', name: '바이스트 / 바이스트키즈', bank: '신한, 무통장 농협', pay: [{ re: /tosspay|토스페이/i }, { b: '농협', re: /비앤앤컴퍼니/ }],
      how: '정산금 입금월 기준 토스페이먼츠 해당월 입금 금액 기재 (결제 후 취소 상품은 다음 결제건에서 매출액 차감). 통계관리 > 기간검색.',
      lines: ['토스페이먼츠 정산', '무통장 입금액'] },
    { key: '필웨이', name: '필웨이', bank: '농협 / 주식회사필웨이', pay: [{ b: '농협', re: /필웨이/ }],
      how: '정산환불 지급내역 확인 후 최종 지급금액 기재.', lines: ['구매확정기준', '반품-', '반품교환비 입금'] },
    { key: '필웨이스텔라', name: '필웨이 (스텔라)', bank: '신한 SLS', pay: [{ b: '신한SLS', re: /필웨이/ }],
      how: '필웨이 스텔라 정산은 신한 SLS 통장으로 입금되는지 확인.', lines: ['구매확정기준', '반품-', '반품교환비 입금'] },
    { key: '네이버페이', name: '네이버페이', bank: '신한 일부 / 나머지는 네이버페이 충전금', pay: [{ b: '신한', re: /Npay정산|네이버페이/i }],
      how: '바이스트 네이버 아이디로 로그인 필요 (대표님 로그인 컨펌 필요). 정산금액은 은행 지급이 아닌 네이버페이 충전으로 진행되며 충전금 기준으로 확인.',
      lines: ['은행 입금분 (정산기준금-수수료)', '충전금 (통장 입금 아님·참고)*'] },
    { key: '위즈위드', name: '위즈위드', bank: '국민 / ㈜엑시온그룹', pay: [{ re: /엑시온/ }],
      how: '정산내역 해당월 확인 후 기재.', lines: ['구매확정기준', '반품-', '반품교환비 입금'] },
    { key: '롯데온', name: '롯데온', bank: '신한 / 롯데온', pay: [{ re: /^롯데온$|^롯데온\b/ }],
      how: '정산관리(중개거래정산관리)에서 정산일 체크. 출금신청 내역 조회 - (조회일자)(지급일자) 해당기간 확인 후 수동정산/월 자동정산 체크 및 기재(출금 예정일). 정산차감내역 영역에서 광고비 확인 - 정산차감 상세 - 내부광고비 후정산 확인 후 기재.',
      lines: ['최종정산지급액 합계', '정산차감액(내부광고비 후정산)-', '서버이용료-'] },
    { key: 'SK스토아', name: 'SK 스토아', bank: '국민 / 에스케이스토아주식회', pay: [{ re: /에스케이스토아/ }],
      how: '대금지급내역 차수별 지급/보류/공제 금액 기재. 계산이 안 맞으면 정산종합내역서에서 A-B-E합계(당월예상) / 전 차수 유보금액(전월이월) / 당 차수 유보금액(당월예상). 위수탁수수료 "-"면 양식엔 "+"로 기재.',
      lines: ['전월보류 지급건(전월이월)', '당월 지급건(당월예상)', '당월 보류건-', '공제-'] },
    { key: 'SI빌리지', name: '신세계V (SI빌리지)', bank: '신한 / 신세계인터내셔널', pay: [{ re: /신세계인터내셔/ }],
      how: '해당월 정산내역 엑셀 다운로드 후 (주문구분, 입금대상금액 비교 확인). 정산내역 요약 - 배송비 지급 - 교환 및 반품비용 기재.',
      lines: ['구매확정기준', '반품-', '취소-', '교환 및 반품비용'] },
    { key: 'SSF', name: 'SSF (삼성물산)', bank: '국민 / 삼성물산(주)패션부문', pay: [{ re: /삼성물산/ }],
      how: '해당월 정산내역 확인 후 구매, 반품, 교환반품 택배비 기재.', lines: ['구매확정기준', '반품-', '교환 및 반품비용'] },
    { key: 'GS', name: 'GS SHOP', bank: '국민 / ㈜지에스리테일', pay: [{ re: /지에스리테일/ }],
      how: '정산금 지급내역 확인 후 입금날짜 확인, 해당월 기준 기재 (대금지급내역조회-지급예정액). 전월 반품유보금 포함.',
      lines: ['전월 3차 지급', '당월 1차(01-10) 지급', '당월 2차(11-20) 지급', '전월 반품유보금 지급'] },
    { key: '머스트잇', name: '머스트잇 (바이스트·스텔라·아울렛)', bank: '우리 / 머스트잇', pay: [{ b: '우리', re: /머스트잇/ }],
      how: '3개 아이디 모두 같은 은행으로 입금되어 구분 불가 → 쇼핑몰별 정산금 확인 후 지급날짜별로 입금금액 구분해 기재. 실적관리 > 월별정산내역 확인 후 AD포인트 충전 차감, 반품비 정산관리 기재.',
      lines: ['바이스트 구매확정기준', '아울렛 구매확정기준', '스텔라 구매확정기준', 'AD포인트 충전 차감(당월)-', 'AD포인트 충전 차감(전월)-', '반품비 정산'] },
    { key: 'W컨셉', name: 'W컨셉', bank: '신한 / (주)더블유컨셉코리', pay: [{ re: /더블유컨셉/ }],
      how: '정산내역에서 엑셀 다운로드 후 (주문유형, 업체지급액 비교 확인 및 기재). 주문유형 공란 → 반품교환비용.',
      lines: ['구매확정기준', '반품-', '반품교환비용', '전월 미수금 상계-'] },
    { key: '11번가', name: '11번가', bank: '농협 / 11ST, 11ST빠른정산, 11번가', pay: [{ re: /11ST|11번가/ }],
      how: '판매/정산현황 송금완료일 체크 (정산확정, 빠른정산 상이함). 엑셀 다운로드 후 양식 내용대로 기재.',
      lines: ['판매금액', '공제금액-', '취소건 과정산 상계-', '교환반품비 입금'] },
    { key: 'CJ', name: 'CJ ENM', bank: '신한 / (주)씨제이이엔엠', pay: [{ re: /씨제이이엔엠/ }],
      how: '정산관리 - 대금정산 - 대금지급내역. 매출년월 전전달~익월까지 선지급금 확인 후 기재.',
      lines: ['정기지급', '인터넷 선지급 전월차수', '인터넷 선지급 당월 1차', '인터넷 선지급 당월 2차', '보류분 지급'] },
    { key: 'LF', name: 'LF', bank: '국민 / (주)LF', pay: [{ b: '국민', re: /LF/ }],
      how: '어드민 정산내역 일별로 총 정산대금 확인 (1~10일 / 11~20일 / 21일~말일). 광고비 체크(VAT 별도) — 전달 매출로 산출된 광고비를 20일 입금에서 제함(공급가액·부가세 확인). 1차: 1~10일분 → 당월 20일 입금 / 2차: 11~20일분 → 당월 말일 입금 / 3차: 21~말일분 → 익월 10일 입금.',
      lines: ['1~10일 정산대금', '11~20일 정산대금', '21~말일 정산대금', '전월 광고비-'] },
    { key: '리본즈', name: '리본즈', bank: '신한 / 주식회사리본즈', pay: [{ b: '신한', re: /리본즈/ }],
      how: '정산관리 - 정산일정 - 캘린더에서 수기로 합계 확인.', lines: ['구매확정기준', '반품-', '반품비 입금'] },
    { key: '웰스토리', name: '웰스토리몰', bank: '국민 / 삼성웰스토리(주)', pay: [{ re: /웰스토리/ }],
      how: '어드민 자동정산마감현황 해당월 검색. 구매확정 지급금액 / 반품금액 / 교환 반품비용 기재.', lines: ['구매확정기준', '반품-', '반품비 입금'] },
    { key: '에이블리', name: '에이블리', bank: '신한 / 에이블리(셀러스)', pay: [{ re: /에이블리/ }],
      how: '은행 입금 기준으로 어드민 정산금 지급 일자를 비교.', lines: ['1차 구매확정기준', '2차 구매확정기준', '반품교환비'] },
    { key: '현대홈쇼핑', name: '현대홈쇼핑', bank: '국민 / (주)현대홈쇼핑', pay: [{ re: /현대홈쇼핑/ }],
      how: '대금지불내역에서 기간설정 - 외상대지불내역 - 세부항목보기, 풀어서보기 (영시니어트렌드 / 패션잡화 구분하여 정산지급금 기재). 월별 주기별 지급내역 확인 후 양식 내용대로 기재.',
      lines: ['패션잡화 주기 1 최종지급액', '패션잡화 주기 2 최종지급액', '패션잡화 주기 3 최종지급액', '영시니어트렌드 최종지급액'] },
    { key: '지그재그', name: '포스티 / 지그재그', bank: '신한 / (주)카카오스타', pay: [{ re: /카카오스타/ }],
      how: '정산기준내역에서 엑셀 다운 후 정산예정일 기준으로 확인 (정산금액, 상품명 기준 정렬).', lines: ['구매확정기준', '반품-', '반품교환비'] },
    { key: '하프클럽', name: '하프클럽', bank: '국민 / (주)트라이씨클', pay: [{ re: /트라이씨클/ }],
      how: '(매뉴얼에 방법 기재 없음)', lines: ['구매확정기준', '유보금 지급'] },
    { key: '리켓', name: '리켓', bank: '신한 / 정산리켓', pay: [{ re: /리켓|지씨앤컴퍼/ }],
      how: '퇴점이지만 리켓 실수로 판매건이 있을 경우 입금 확인.', lines: ['리켓정산서 기준 금액'] },
    { key: '스마트스토어', name: '스마트스토어', bank: '신한 / 스마트스토어정산', pay: [{ re: /스마트스토어정/ }],
      how: '어드민 월별 정산내역 확인 후 엑셀 다운로드 및 정산 양식 내용대로 기재 (정산기준금액, 수수료합계, 혜택정산, 일별공제환급(교환반품비용)).',
      lines: ['정산기준금액', '수수료합계-', '혜택정산-', '교환반품비용(공제 환급)'] },
    { key: '패피스', name: '패피스', bank: '(매뉴얼에 은행 기재 없음)', pay: [{ re: /패피스/ }],
      how: '패피스 로그인 후 월별 검색 → 정산내역 금액 기재.', lines: ['정산금'] },
    { key: '이터널저니', name: '이터널저니', bank: '신한 / 아난티', pay: [{ re: /^\(주\)아난티$|^㈜아난티$/ }],
      how: '어드민 정산 확정내역.', lines: ['구매확정기준', '반품-', '반품교환비'] },
    { key: '크림C2C', name: '크림 C2C', bank: '신한 SLS / KREAM', pay: [{ b: '신한SLS', re: /KREAM/i }],
      how: '어드민 해당월 기간별 정산내역 확인 후 양식 내용대로 기재.', lines: ['매출액', '수수료-', '반품교환비'] },
    { key: '크림B2C', name: '크림 B2C', bank: '신한 / KREAM', pay: [{ b: '신한', re: /KREAM|크림/i }],
      how: '(매뉴얼에 방법 기재 없음) — C2C와 달리 신한 일반 통장으로 입금.', lines: ['매출액', '수수료+쿠폰 할인-', '반품교환비'] },
    { key: '페칭', name: '페칭', bank: '신한 / 페칭정산', pay: [{ re: /페칭/ }],
      how: '어드민 정산관리 - 정산내역 비교 확인.', lines: ['매출액', '수수료-', '반품교환비'] },
    { key: '삼성카드', name: '삼성카드', bank: '신한 SLS / 삼성카드', pay: [{ b: '신한SLS', re: /삼성1999|삼성카드/ }],
      how: '해당월 쇼핑+복지 확정지급금액 − 1.15% (전전월 26일~전월 25일 매출 → 익월 10일 전 입금. 예: 3~4월 매출 → 5월 입금).',
      lines: ['매출액(지급금액)', '가맹점수수료-', '반품교환비'] },
    { key: '쿠팡', name: '쿠팡', bank: '신한 / 쿠팡페이주식회사', pay: [{ re: /쿠팡/ }],
      how: '정산현황 확인.', lines: ['매출액', '수수료-', '반품교환비'] },
    { key: '퀸잇', name: '퀸잇', bank: '신한 / 퀸잇', pay: [{ re: /퀸잇/ }],
      how: '정산내역 - 최종 지급액 확인.', lines: ['매출액', '수수료-', '반품교환비'] },
    { key: '카카오쇼핑', name: '카카오쇼핑', bank: '신한 / ㈜카카오©', pay: [{ re: /(\(주\)|㈜)카카오(?!스타)/ }],
      how: '정산관리 - 송금완료 - 해당월 - 조회 - 최종정산금액 합산.', lines: ['매출액', '수수료-', '반품교환비'] }
  ];
  var IGNORE = '__ignore';   // 정산과 무관한 입금(대표 이체, 개인 입금 등)

  function linePlain(label) { return label.replace(/[-*]$/, ''); }
  function lineIsMinus(label) { return /-$/.test(label); }
  function lineIsRef(label) { return /\*$/.test(label); }   // 참고용 — 통장 대조 합계에서 제외

  /* ---------- 대조 ---------- */
  // 입금 1건이 어느 쇼핑몰 건인지: 수동 지정(shop_override) > 자동 규칙
  function autoShop(tx) {
    for (var i = 0; i < SHOPS.length; i++) {
      var s = SHOPS[i];
      for (var j = 0; j < s.pay.length; j++) {
        var p = s.pay[j];
        if (p.b && p.b !== tx.bank) continue;
        if (p.re.test(tx.party)) return s.key;
      }
    }
    return null;
  }
  function shopOf(tx) { return tx.shop_override ? tx.shop_override : autoShop(tx); }

  function sumLines(lines) {
    var t = 0;
    (lines || []).forEach(function (l) { if (!lineIsRef(l.label || '')) t += num(l.amount); });
    return Math.round(t * 100) / 100;
  }

  // deposits: 입금(amt_in>0) 거래 배열, entries: {shopKey: {lines, note}}
  function compute(deposits, entries) {
    var byShop = {}, unmatched = [], ignored = [];
    deposits.forEach(function (tx) {
      var k = shopOf(tx);
      if (k === IGNORE) { ignored.push(tx); return; }
      if (!k) { unmatched.push(tx); return; }
      (byShop[k] = byShop[k] || []).push(tx);
    });
    var rows = SHOPS.map(function (s) {
      var e = entries[s.key] || null;
      var txs = byShop[s.key] || [];
      var paid = 0; txs.forEach(function (t) { paid += t.amt_in; });
      var entered = !!(e && e.lines && e.lines.some(function (l) { return num(l.amount) !== 0; }));
      var total = entered ? sumLines(e.lines) : 0;
      var diff = Math.round((paid - total) * 100) / 100;
      var status;
      if (s.nobank) status = entered ? 'nobank' : 'empty';
      else if (!entered && !txs.length) status = 'empty';
      else if (!entered) status = 'noentry';      // 입금은 있는데 정산금 미입력
      else if (!txs.length) status = 'nopay';     // 정산금은 입력했는데 입금 없음
      else if (Math.abs(diff) < 1) status = 'ok';
      else status = 'diff';
      return { shop: s, entry: e, txs: txs, paid: paid, total: total, diff: diff, entered: entered, status: status };
    });
    return { rows: rows, unmatched: unmatched, ignored: ignored };
  }

  var api = { num: num, parseBank: parseBank, BANKS: BANKS, SHOPS: SHOPS, IGNORE: IGNORE, GENERIC_LINES: G,
    autoShop: autoShop, shopOf: shopOf, sumLines: sumLines, compute: compute, linePlain: linePlain, lineIsMinus: lineIsMinus, lineIsRef: lineIsRef };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.STL = api;
})(typeof window !== 'undefined' ? window : globalThis);
