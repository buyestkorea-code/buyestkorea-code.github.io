/* 기획전 상품 뽑기 - 셀렉 로직 (브라우저/노드 공용, 서버 호출 없음) */
(function (root) {
  'use strict';

  // 상품 종류 말 → 상품명에서 찾을 단어들
  var KIND_MAP = {
    '패딩': ['패딩', '다운', '푸퍼', '퍼퍼', '구스다운', '덕다운'], '다운': ['패딩', '다운', '푸퍼', '퍼퍼', '구스다운', '덕다운'], '푸퍼': ['패딩', '다운', '푸퍼', '퍼퍼', '구스다운', '덕다운'],
    '롱패딩': ['패딩', '다운', '푸퍼', '퍼퍼', '구스다운', '덕다운'], '경량패딩': ['패딩', '다운', '푸퍼', '퍼퍼', '구스다운', '덕다운'], '구스': ['구스다운', '다운', '패딩'], '덕다운': ['덕다운', '다운', '패딩'],
    '코트': ['코트', '트렌치', '체스터'], '트렌치': ['트렌치'], '자켓': ['자켓', '재킷', '블루종', '블레이저', '봄버'], '재킷': ['자켓', '재킷', '블루종', '블레이저', '봄버'], '점퍼': ['점퍼', '자켓', '블루종', '봄버'],
    '블레이저': ['블레이저'], '무스탕': ['무스탕', '시어링'], '파카': ['파카'], '가디건': ['가디건', '카디건'],
    '니트': ['니트', '스웨터', '풀오버'], '스웨터': ['니트', '스웨터', '풀오버'], '후드': ['후드'], '맨투맨': ['맨투맨', '스웨트'],
    '셔츠': ['셔츠'], '티셔츠': ['티셔츠'], '팬츠': ['팬츠', '바지'], '청바지': ['데님', '진'],
    '스커트': ['스커트'], '원피스': ['원피스', '드레스'], '가방': ['백', '가방', '토트', '숄더', '크로스'],
    '지갑': ['지갑', '월렛'], '스니커즈': ['스니커즈', '운동화'], '부츠': ['부츠'], '신발': ['스니커즈', '부츠', '로퍼', '샌들', '슈즈'],
    '머플러': ['머플러', '스카프'], '목도리': ['머플러', '스카프']
  };

  // ───────── 사방넷 카테고리 기준 세분화 종류 ─────────
  // k 종류 이름 · g 묶음 · w 상품명에서 찾을 단어(하나라도 있으면) · x 이 단어가 있으면 이 종류가 아님 · s 잘 나가는 계절(없으면 사계절)
  var KIND_SPEC = [
    { k: '패딩', g: '아우터', w: ['패딩', '다운', '푸퍼', '퍼퍼', '구스다운', '덕다운', '점퍼', '파카', '베스트'], x: [], s: ['겨울'] },
    { k: '코트', g: '아우터', w: ['코트', '트렌치', '체스터', '케이프'], x: [], s: ['가을', '겨울', '봄'] },
    { k: '자켓', g: '아우터', w: ['자켓', '재킷', '블루종', '블레이저', '봄버', '바람막이', '후드집업', '후드 집업', '조끼'], x: [], s: [] },
    { k: '가디건', g: '아우터', w: ['가디건', '카디건'], x: [], s: ['봄', '가을', '겨울'] },
    { k: '긴팔티', g: '상의', w: ['롱슬리브', '긴팔', '롱 슬리브', '반집업'], x: ['반팔', '숏슬리브', '후드', '맨투맨', '니트', '가디건', '민소매', '셔츠'], s: ['봄', '가을', '겨울'] },
    { k: '반팔티', g: '상의', w: ['반팔', '숏슬리브', '티셔츠', '폴로', '나시', '민소매', '탱크탑', '크롭'], x: ['롱슬리브', '긴팔', '롱 슬리브', '후드', '맨투맨', '니트', '가디건'], s: ['봄', '여름'] },
    { k: '니트', g: '상의', w: ['니트', '스웨터', '풀오버'], x: ['가디건', '카디건'], s: ['가을', '겨울', '봄'] },
    { k: '후드티', g: '상의', w: ['후드티', '후드 스웨트', '후드스웨트', '후드 스웻', '후드 니트', '아노락'], x: [], s: ['봄', '가을', '겨울'] },
    { k: '맨투맨', g: '상의', w: ['맨투맨', '스웨트', '스웻셔츠'], x: ['후드'], s: ['봄', '가을', '겨울'] },
    { k: '셔츠', g: '상의', w: ['셔츠', '블라우스'], x: ['티셔츠', '스웨트셔츠', '스웻셔츠'], s: [] },
    { k: '바지/팬츠', g: '하의·원피스', w: ['팬츠', '바지', '레깅스', '조거', '트랙', '트레이닝', '치노'], x: ['반바지', '쇼츠', '숏팬츠', '숏츠', '스윔', '청바지', '데님', '진팬츠', '브리프', '팬티', '스커트', '치마바지'], s: [] },
    { k: '청바지', g: '하의·원피스', w: ['청바지', '데님', '진팬츠', '스키니진', '데님진'], x: ['반바지', '쇼츠', '숏팬츠'], s: [] },
    { k: '반바지', g: '하의·원피스', w: ['반바지', '쇼츠', '숏팬츠', '숏츠', '하프팬츠', '버뮤다', '스윔팬츠'], x: [], s: ['봄', '여름'] },
    { k: '스커트', g: '하의·원피스', w: ['스커트', '치마바지'], x: [], s: [] },
    { k: '원피스', g: '하의·원피스', w: ['원피스', '드레스', '점프수트', '투피스', '셋업', '바디수트', '바디슈트', '스윔수트'], x: [], s: ['봄', '여름', '가을'] },
    { k: '브리프/팬티', g: '속옷·양말', w: ['브리프', '팬티', '트렁크', '드로즈', '언더웨어', '속옷'], x: [], s: [] },
    { k: '양말', g: '속옷·양말', w: ['양말', '삭스'], x: [], s: [] },
    { k: '스니커즈', g: '신발', w: ['스니커즈', '운동화', '러닝화', '골프화', '하이탑', '로우탑'], x: [], s: [] },
    { k: '샌들/쪼리', g: '신발', w: ['샌들', '쪼리', '플립플롭', '플립플랍'], x: [], s: ['봄', '여름'] },
    { k: '슬리퍼', g: '신발', w: ['슬리퍼', '슬라이드', '뮬'], x: [], s: [] },
    { k: '부츠', g: '신발', w: ['부츠', '첼시', '앵클', '워커', '부티'], x: [], s: ['가을', '겨울'] },
    { k: '로퍼', g: '신발', w: ['로퍼', '구두', '옥스포드', '더비', '몽크스트랩', '드라이빙'], x: [], s: [] },
    { k: '단화/플랫', g: '신발', w: ['플랫', '발레리나', '단화', '메리제인', '슬립온'], x: [], s: ['봄', '여름', '가을'] },
    { k: '하이힐/펌프스', g: '신발', w: ['펌프스', '하이힐', '스틸레토', '힐'], x: ['슬리퍼', '부츠'], s: [] },
    { k: '가방', g: '가방', w: ['백', '가방', '토트', '숄더', '크로스', '백팩', '클러치', '파우치', '힙색'], x: [], s: [] },
    { k: '백팩', g: '가방', w: ['백팩', '스쿨백'], x: [], s: [] },
    { k: '숄더백', g: '가방', w: ['숄더백', '쇼퍼백', '틸리백', '호보백'], x: [], s: [] },
    { k: '크로스백', g: '가방', w: ['크로스백', '메신저백', '미니백', '새들백', '체인백', '카메라백', '카세트백'], x: [], s: [] },
    { k: '토트백', g: '가방', w: ['토트백', '핸드백', '핸들백', '더플백', '보스턴백', '버킷백', '바스켓백', '갤러리아백', '조디백'], x: [], s: [] },
    { k: '클러치', g: '가방', w: ['클러치'], x: [], s: [] },
    { k: '힙색', g: '가방', w: ['힙색', '벨트백', '웨이스트백'], x: [], s: [] },
    { k: '파우치', g: '가방', w: ['파우치'], x: [], s: [] },
    { k: '지갑', g: '지갑', w: ['지갑', '월렛'], x: [], s: [] },
    { k: '장지갑', g: '지갑', w: ['장지갑'], x: [], s: [] },
    { k: '중지갑', g: '지갑', w: ['중지갑'], x: [], s: [] },
    { k: '반지갑', g: '지갑', w: ['반지갑'], x: [], s: [] },
    { k: '카드지갑', g: '지갑', w: ['카드지갑', '카드 지갑', '카드케이스', '카드 케이스', '카드홀더', '명함지갑'], x: [], s: [] },
    { k: '동전지갑', g: '지갑', w: ['동전지갑', '코인지갑', '코인파우치'], x: [], s: [] },
    { k: '키지갑', g: '지갑', w: ['키지갑', '키케이스', '키 케이스'], x: [], s: [] },
    { k: '머니클립', g: '지갑', w: ['머니클립'], x: [], s: [] },
    { k: '모자', g: '모자', w: ['모자', '캡', '볼캡', '비니', '버킷햇', '벙거지', '베레', '바이저', '바라클라바'], x: ['캡슐'], s: [] },
    { k: '비니', g: '모자', w: ['비니', '바라클라바'], x: [], s: [] },
    { k: '볼캡', g: '모자', w: ['볼캡', '골프캡', '캡모자', '캡 모자', '야구모자'], x: [], s: [] },
    { k: '썬캡', g: '모자', w: ['썬캡', '선캡', '바이저'], x: [], s: [] },
    { k: '버킷햇/벙거지', g: '모자', w: ['버킷햇', '버킷 햇', '벙거지'], x: [], s: [] },
    { k: '머플러', g: '스카프·쥬얼리', w: ['머플러', '넥워머', '목도리'], x: [], s: ['가을', '겨울', '봄'] },
    { k: '스카프', g: '스카프·쥬얼리', w: ['스카프', '넥보우', '숄'], x: ['숄더'], s: ['가을', '겨울', '봄'] },
    { k: '쥬얼리', g: '스카프·쥬얼리', w: ['쥬얼리', '주얼리', '목걸이', '귀걸이', '이어링', '반지', '팔찌', '브레이슬릿', '네크리스', '넥클리스', '펜던트'], x: ['반지갑'], s: [] },
    { k: '목걸이', g: '스카프·쥬얼리', w: ['목걸이', '넥클리스', '네크리스', '펜던트'], x: [], s: [] },
    { k: '귀걸이', g: '스카프·쥬얼리', w: ['귀걸이', '이어링'], x: [], s: [] },
    { k: '반지', g: '스카프·쥬얼리', w: ['반지'], x: ['반지갑'], s: [] },
    { k: '팔찌', g: '스카프·쥬얼리', w: ['팔찌', '브레이슬릿'], x: [], s: [] },
    { k: '벨트', g: '기타 잡화', w: ['벨트'], x: ['벨트백'], s: [] },
    { k: '넥타이', g: '기타 잡화', w: ['넥타이'], x: [], s: [] },
    { k: '키링/키홀더', g: '기타 잡화', w: ['키링', '키홀더'], x: [], s: [] },
    { k: '헤어 악세사리', g: '기타 잡화', w: ['헤어핀', '헤어밴드', '헤어타이', '헤어 타이', '헤어 악세사리', '헤어악세사리', '반다나', '스크런치', '이어머프', '머리띠'], x: [], s: [] },
    { k: '잡화', g: '기타 잡화', w: ['선글라스', '안경', '장갑', '글러브', '케이스', '타올', '타월', '우산', '잡화', '액세서리', '악세서리'], x: ['카드케이스', '카드 케이스', '키케이스', '키 케이스'], s: [] },
    { k: '스크래치', g: '상태', w: ['스크래치'], x: [], s: [] }
  ];
  var SPEC = {}; KIND_SPEC.forEach(function (sp) { SPEC[sp.k] = sp; KIND_MAP[sp.k] = sp.w; });
  var KIND_GROUPS = [];
  KIND_SPEC.forEach(function (sp) {
    var g = KIND_GROUPS.filter(function (x) { return x[0] === sp.g; })[0];
    if (!g) KIND_GROUPS.push(g = [sp.g, []]);
    g[1].push(sp.k);
  });
  // 요청 문장에 이 말이 있으면 이 칩(들)을 고른다 (칩 이름과 다른 말·예전 말)
  var KIND_ALIAS = {
    '티셔츠': ['긴팔티', '반팔티'], '긴팔': ['긴팔티'], '반팔': ['반팔티'], '롱슬리브': ['긴팔티'], '후드': ['후드티'],
    '신발': ['스니커즈', '샌들/쪼리', '슬리퍼', '부츠', '로퍼', '단화/플랫', '하이힐/펌프스'],
    '샌들': ['샌들/쪼리'], '쪼리': ['샌들/쪼리'], '구두': ['로퍼'], '구두/로퍼': ['로퍼'], '단화': ['단화/플랫'], '플랫슈즈': ['단화/플랫'],
    '하이힐': ['하이힐/펌프스'], '펌프스': ['하이힐/펌프스'], '브리프': ['브리프/팬티'], '팬티': ['브리프/팬티'], '속옷': ['브리프/팬티'],
    '팬츠': ['바지/팬츠'], '바지': ['바지/팬츠'],
    '목도리': ['머플러'], '넥워머': ['머플러'], '주얼리': ['쥬얼리'], '반지갑': ['반지갑'], '키링': ['키링/키홀더'], '키홀더': ['키링/키홀더'],
    '버킷햇': ['버킷햇/벙거지'], '벙거지': ['버킷햇/벙거지'], '선캡': ['썬캡'], '바이저': ['썬캡'],
    '삭스': ['양말'], '헤어핀': ['헤어 악세사리'], '헤어밴드': ['헤어 악세사리'], '머리띠': ['헤어 악세사리'], '코인지갑': ['동전지갑'], '카드홀더': ['카드지갑'],
    '스크래치': ['스크래치'], '핸드백': ['토트백'], '메신저백': ['크로스백'], '웨이스트백': ['힙색'],
    '롱패딩': ['패딩'], '경량패딩': ['패딩'], '다운': ['패딩'], '푸퍼': ['패딩']
  };
  // ───────── 계절 ─────────
  // 달 → 지금 팔리는 계절 (한 달 앞서 판다)
  var SEASON_OF_MONTH = { 1: ['겨울'], 2: ['겨울', '봄'], 3: ['봄'], 4: ['봄'], 5: ['봄', '여름'], 6: ['여름'], 7: ['여름'], 8: ['여름', '가을'], 9: ['가을'], 10: ['가을', '겨울'], 11: ['가을', '겨울'], 12: ['겨울'] };
  // 계절에 확실히 안 맞는 상품명 단어
  var OFF_WORDS = {
    '겨울': ['반팔', '반바지', '샌들', '쪼리', '플립플롭', '민소매', '슬리브리스', '쇼츠', '수영복', '비키니', '린넨', '리넨'],
    '봄': ['패딩', '다운', '푸퍼', '기모', '무스탕', '시어링', '목도리', '수영복', '비키니'],
    '여름': ['패딩', '다운', '푸퍼', '기모', '무스탕', '시어링', '목도리', '머플러', '부츠', '코트', '캐시미어'],
    '가을': ['샌들', '쪼리', '플립플롭', '민소매', '슬리브리스', '수영복', '비키니', '린넨', '리넨']
  };
  // mode: 'auto'(이번 달) | '봄'|'여름'|'가을'|'겨울' | 'none'
  function activeSeasons(mode, now) {
    if (mode === 'none') return [];
    if (OFF_WORDS[mode]) return [mode];
    return SEASON_OF_MONTH[(now || new Date()).getMonth() + 1];
  }
  // 활성 계절 모두에서 안 맞는 단어. 고른 종류 자신의 단어(예: 겨울에 샌들/쪼리를 직접 고름)는 뺀다.
  function offWords(active, kinds) {
    if (!active || !active.length) return [];
    var own = {}; (kinds || []).forEach(function (k) { (KIND_MAP[k] || []).forEach(function (w) { own[w] = 1; }); });
    return OFF_WORDS[active[0]].filter(function (w) {
      return !own[w] && active.every(function (a) { return OFF_WORDS[a].indexOf(w) >= 0; });
    });
  }
  function kindInSeason(k, active) {
    var sp = SPEC[k]; if (!sp || !sp.s.length || !active || !active.length) return true;
    return sp.s.some(function (x) { return active.indexOf(x) >= 0; });
  }
  function dropOffSeason(rows, off) {
    if (!off || !off.length) return rows;
    return rows.filter(function (r) {
      var n = r.name + ' ' + (r.tg || '');
      for (var i = 0; i < off.length; i++) { if (n.indexOf(off[i]) >= 0) return false; }
      return true;
    });
  }
  // 단어 w 가 고른 종류(들)의 단어일 때, 그 종류의 '아님' 단어가 상품명에 있으면 이 단어로는 안 잡는다
  function blockedByKind(w, text, kinds) {
    if (!kinds || !kinds.length) return false;
    var owners = kinds.filter(function (k) { return SPEC[k] && SPEC[k].w.indexOf(w) >= 0; });
    if (!owners.length) return false;                         // 종류와 상관없는 직접 쓴 단어
    return owners.every(function (k) { return SPEC[k].x.some(function (xw) { return text.indexOf(xw) >= 0; }); });
  }
  var STOP = ['명품', '세일', '기획전', '기획', '할인', '프로모션', '이벤트', '관련', '브랜드', '입니다', '주세요', '해주세요',
    '11월', '12월', '10월', '9월', '8월', '1월', '2월', '3월', '4월', '5월', '6월', '7월', '등', '및', '그리고'];

  function norm(s) { return String(s == null ? '' : s).replace(/\s+/g, '').toLowerCase(); }
  function cellStr(v) { return v == null ? '' : String(v).replace(/\r?\n/g, ' ').trim(); }

  // aoa(2차원 배열) → {rows:[{code,name,brand}], cols}
  // 상품명 맨 앞 시즌 코드 (예: "26FW 마야 ..." → "26FW"). 없으면 빈 문자열.
  function seasonOf(name) {
    var m = /^\s*(\d{2})\s?(SS|FW)\b/i.exec(String(name || ''));
    return m ? m[1] + m[2].toUpperCase() : '';
  }
  // 시즌 코드 → 정렬용 숫자 (26FW > 26SS > 25FW)
  function seasonRank(s) { return s ? parseInt(s.slice(0, 2), 10) * 2 + (s.slice(2) === 'FW' ? 1 : 0) : -1; }

  // 두 가지 사방넷 형식을 읽는다.
  //  A) 상품대량수정: 한 줄 = 상품 1개 (품번코드, 상품명, 브랜드명 …)
  //  B) 단품대량수정: 한 줄 = 옵션(사이즈) 1개 (사방넷상품코드 "184326-0001", 상품명, 옵션상세명칭, 현재고, 제조사 …) → 상품별로 합친다
  function parseSabangnet(aoa) {
    var hi = -1, kind = '', i, j;
    for (i = 0; i < Math.min(aoa.length, 8) && hi < 0; i++) {
      var r = aoa[i] || [];
      for (j = 0; j < r.length; j++) {
        var c = cellStr(r[j]);
        if (c.indexOf('품번코드') === 0) { hi = i; kind = 'A'; break; }
        if (c.indexOf('사방넷상품코드') === 0) { hi = i; kind = 'B'; break; }
      }
    }
    if (hi < 0) throw new Error('사방넷 파일이 아닌 것 같습니다 ("품번코드" 또는 "사방넷상품코드" 열을 못 찾았어요)');
    var h = aoa[hi].map(cellStr);
    function col(test) { for (var k = 0; k < h.length; k++) { if (test(h[k])) return k; } return -1; }
    var starts = function (p) { return function (x) { return x.indexOf(p) === 0; }; };
    var cCode = col(starts(kind === 'A' ? '품번코드' : '사방넷상품코드'));
    var cOwn = col(starts('자체상품코드'));
    var cName = col(starts('상품명'));
    var cBrand = col(function (x) { return x === '브랜드명'; });
    if (cBrand < 0) cBrand = col(starts('제조사')); // 단품 파일에는 브랜드명 열이 없고 제조사에 브랜드가 들어 있음
    var cOpt = col(starts('옵션상세명칭'));
    var cStock = col(starts('현재고'));
    if (cStock < 0) cStock = col(starts('총재고수량')); // 쇼핑몰상품등록 다운로드 형식
    var cCat = col(starts('상품분류'));
    var cReg = col(starts('등록일시'));
    var cMod = col(starts('수정일시'));
    if (cMod < 0) cMod = col(starts('등록일시'));
    var asOf = '';
    var cPrice = col(function (x) { return x === '판매가' || x.indexOf('판매가 ') === 0; });
    if (cName < 0) throw new Error('"상품명" 열을 못 찾았어요');
    var map = {}, rows = [];
    for (i = hi + 1; i < aoa.length; i++) {
      var row = aoa[i] || [];
      var raw = cellStr(row[cCode]);
      if (!raw || raw.charAt(0) === '▶') continue; // 설명 행 건너뜀
      var name = cellStr(row[cName]);
      if (!name) continue;
      var code = raw;
      if (kind === 'B') code = (cOwn >= 0 && cellStr(row[cOwn])) ? cellStr(row[cOwn]) : raw.split('-')[0];
      if (cMod >= 0) { var dt = cellStr(row[cMod]); if (dt > asOf && /^\d{4}-\d{2}-\d{2}/.test(dt)) asOf = dt; }
      var rec = map[code];
      if (!rec) {
        rec = { code: code, name: name, brand: cBrand >= 0 ? cellStr(row[cBrand]) : '', stock: null, sizes: [], reg: cReg >= 0 ? cellStr(row[cReg]) : '', season: seasonOf(name), cat: cCat >= 0 ? cellStr(row[cCat]) : '', price: cPrice >= 0 ? parseFloat(cellStr(row[cPrice])) || 0 : 0 };
        map[code] = rec; rows.push(rec);
      }
      if (cStock >= 0) {
        var q = parseFloat(cellStr(row[cStock]));
        if (!isNaN(q)) { rec.stock = (rec.stock || 0) + q; }
      }
      if (cOpt >= 0 && cellStr(row[cOpt])) rec.sizes.push(cellStr(row[cOpt]));
    }
    return { rows: rows, hasBrand: cBrand >= 0, hasStock: cStock >= 0, hasCat: cCat >= 0, kind: kind, asOf: asOf };
  }

  // MD 요청 문장 → 조건 {brands:[], kinds:[], words:[]}
  function parseRequest(text, allBrands) {
    var wantKids = /키즈|kids/i.test(text);
    var tokens = String(text).split(/[^0-9A-Za-z가-힣]+/).filter(function (t) { return t.length >= 2 && STOP.indexOf(t) < 0; });
    var textN = norm(text);
    var brands = [];
    allBrands.forEach(function (b) {
      var bn = norm(b);
      if (!bn) return;
      var isKids = /키즈|kids/i.test(b);
      if (isKids && !wantKids) return;
      var hit = textN.indexOf(bn) >= 0;
      if (!hit) {
        for (var t = 0; t < tokens.length; t++) {
          var tn = norm(tokens[t]);
          if (tn.length >= 2 && bn.indexOf(tn) === 0) { hit = true; break; } // 몽클 → 몽클레어
        }
      }
      if (hit) brands.push(b);
    });
    var words = [], kinds = [];
    Object.keys(KIND_MAP).forEach(function (k) {
      if ((k === '셔츠' ? textN.replace(/티셔츠/g, '') : textN).indexOf(k) >= 0) {
        kinds.push(k);
        KIND_MAP[k].forEach(function (w) { if (words.indexOf(w) < 0) words.push(w); });
      }
    });
    Object.keys(KIND_ALIAS).forEach(function (a) {
      if (textN.indexOf(a) < 0) return;
      KIND_ALIAS[a].forEach(function (k) {
        if (kinds.indexOf(k) < 0) kinds.push(k);
        (KIND_MAP[k] || []).forEach(function (w) { if (words.indexOf(w) < 0) words.push(w); });
      });
    });
    var canon = []; // 예전 이름(티셔츠·신발·머플러…)은 칩 이름으로 바꾼다
    kinds.forEach(function (k) { (KIND_ALIAS[k] || [k]).forEach(function (c) { if (canon.indexOf(c) < 0) canon.push(c); }); });
    kinds = canon;
    if (kinds.indexOf('셔츠') >= 0 && textN.replace(/티셔츠/g, '').indexOf('셔츠') < 0) kinds.splice(kinds.indexOf('셔츠'), 1); // '티셔츠'만 말했는데 셔츠까지 고르지 않게
    var audiences = [];
    if (/키즈|아동|아기|주니어|kids/i.test(text)) audiences.push('아동');
    if (/여성|우먼|레이디/.test(text)) audiences.push('여성');
    if (/남성|맨즈|남자/.test(text)) audiences.push('남성');
    if (!audiences.length) audiences = ['여성', '남성']; // 말이 없으면 성인만 (아동 제외)
    return { brands: brands, kinds: kinds, words: words, audiences: audiences };
  }

  // audiences: ['여성','남성','아동'] 중 허용할 대상 (상품분류 맨 앞 단어 기준). 비어 있거나 분류가 없으면 거르지 않는다.
  function select(rows, brands, words, inStockOnly, audiences, seasons, kinds) {
    var bset = {};
    brands.forEach(function (b) { bset[b] = true; });
    return rows.filter(function (r) {
      if (inStockOnly && !(r.stock > 0)) return false;
      if (seasons && seasons.length && seasons.indexOf(r.season || seasonOf(r.name)) < 0) return false;
      if (audiences && audiences.length && r.cat) {
        var a = r.cat.split('>')[0].trim();
        if (audiences.indexOf(a) < 0) return false;
      }
      if (brands.length && !bset[r.brand]) return false;
      if (words.length) {
        var ok = false;
        var hay = r.name + ' ' + (r.cat || '') + ' ' + (r.tg || ''); // 상품분류(카테고리)와 AI가 붙인 태그(r.tg)도 함께 본다
        for (var i = 0; i < words.length; i++) { if (hay.indexOf(words[i]) >= 0 && !blockedByKind(words[i], hay, kinds)) { ok = true; break; } }
        if (!ok) return false;
      }
      return true;
    });
  }

  // 정렬: 'stock' 재고 많은 순 / 'new' 신상(등록일 최신) 순 / 그 외는 그대로. balance=true 면 정렬 순서를 지키며 브랜드별로 번갈아 뽑는다.
  function order(rows, mode, balance) {
    var out = rows.slice();
    if (mode === 'stock') out.sort(function (a, b) { return (b.stock || 0) - (a.stock || 0); });
    else if (mode === 'new') out.sort(function (a, b) { return (b.reg || '') < (a.reg || '') ? -1 : (b.reg || '') > (a.reg || '') ? 1 : 0; });
    if (balance) {
      var groups = {}, keys = [];
      out.forEach(function (r) { if (!groups[r.brand]) { groups[r.brand] = []; keys.push(r.brand); } groups[r.brand].push(r); });
      var mixed = [], more = true, i = 0;
      while (more) {
        more = false;
        keys.forEach(function (k) { if (groups[k][i]) { mixed.push(groups[k][i]); more = true; } });
        i++;
      }
      out = mixed;
    }
    return out;
  }
  // 브랜드별 상품 수·재고 합
  function brandStats(rows) {
    var st = {};
    rows.forEach(function (r) {
      if (!r.brand) return;
      var s = st[r.brand] || (st[r.brand] = { n: 0, stock: 0 });
      s.n++; s.stock += r.stock || 0;
    });
    return st;
  }

  // ───────── 플랫폼(쇼핑몰) 변환 ─────────
  // 사방넷 "쇼핑몰상품수정 다운로드" 한 줄 = 한 쇼핑몰(+ID)에 등록된 상품 1개.
  // 우리가 쓰는 열(순서 고정): 쇼핑몰명, 쇼핑몰ID, 쇼핑몰상품코드, 품번코드, 자체상품코드, 상품명(송신), 모델명, 모델NO, 브랜드명, 제조사, 배송비구분, 배송비, 상품상태(송신), 재고관리여부, 판매가(송신), 수정송신일시
  var MALL_COLS = ['쇼핑몰명', '쇼핑몰ID', '쇼핑몰상품코드', '품번코드', '자체상품코드', '상품명(송신)', '모델명', '모델NO', '브랜드명', '제조사', '배송비구분', '배송비', '상품상태(송신)', '재고관리여부', '판매가(송신)', '수정송신일시', '부가정보제목'];
  // 변환 결과 엑셀의 열 (사용자가 정한 순서)
  var OUT_HEAD = ['쇼핑몰상품코드', '품번코드', '자체상품코드', '상품명(송신)', '모델명', '모델NO', '브랜드명', '제조사', '배송비구분', '배송비', '상품상태(송신)', '재고관리여부', '판매가(송신)', '부가정보제목'];

  // 엑셀에서 읽은 행 → 저장용 레코드 (배열). 판매가는 숫자, 나머지는 문자열.
  function mallRecord(r) {
    var price = parseFloat(r[14]);
    return [r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10], r[11], r[12], r[13], isNaN(price) ? 0 : Math.round(price), r[15], r[16] || ''];
  }
  function mallKey(r) { return r[0] + '|' + r[1]; }
  // 읽은 행들을 {쇼핑몰키: {품번코드: 레코드}} 로 묶는다
  function groupMalls(rows) {
    var g = {};
    rows.forEach(function (r) {
      if (!r[3]) return; // 품번코드 없는 줄 제외
      var k = mallKey(r);
      (g[k] || (g[k] = {}))[r[3]] = mallRecord(r);
    });
    return g;
  }
  // 이미 저장된 쇼핑몰 자료에 새 자료를 합친다. 같은 품번이면 수정송신일시가 더 최근(같으면 새 파일)인 쪽이 이긴다.
  function mergeMap(oldMap, newMap) {
    var out = oldMap || {};
    Object.keys(newMap).forEach(function (code) {
      var o = out[code], n = newMap[code];
      if (!o || (n[13] || '') >= (o[13] || '')) out[code] = n;
    });
    return out;
  }
  function mapAsOf(map) {
    var m = '';
    Object.keys(map).forEach(function (c) { var d = map[c][13] || ''; if (d > m) m = d; });
    return m; // 예: "20261030 16:59"
  }
  // 고른 상품(picked: [{code,name}]) → 쇼핑몰 자료(map)에서 찾아 바꾼다.
  // 결과: { matched:[레코드...], skipped:[{code,name,reason}] }
  function convert(picked, map, excludePaused) {
    var matched = [], skipped = [], seen = {};
    picked.forEach(function (p) {
      if (seen[p.code]) return; seen[p.code] = true;
      var rec = map[p.code];
      if (!rec) { skipped.push({ code: p.code, name: p.name, reason: '이 쇼핑몰에 등록 안 됨' }); return; }
      if (excludePaused && rec[10] !== '공급중') { skipped.push({ code: p.code, name: p.name, reason: '쇼핑몰 상태: ' + (rec[10] || '알 수 없음') }); return; }
      matched.push(rec);
    });
    return { matched: matched, skipped: skipped };
  }

  // 상품 종류(kinds) → 사이트 상품분류에서 볼 구역. 분류가 '상의/하의/가방/신발…' 수준으로 굵어서 종류까지는 못 가르고,
  // "AI에게 물어볼 후보"의 범위를 좁히는 데만 쓴다(예: 패딩 요청이면 가방·신발·모자는 AI에게 묻지 않는다).
  var KIND_CAT = {
    '패딩': 'TOP', '다운': 'TOP', '푸퍼': 'TOP', '코트': 'TOP', '자켓': 'TOP', '재킷': 'TOP', '점퍼': 'TOP', '니트': 'TOP', '스웨터': 'TOP',
    '후드': 'TOP', '후드티': 'TOP', '맨투맨': 'TOP', '셔츠': 'TOP', '티셔츠': 'TOP', '가디건': 'TOP', '블레이저': 'TOP', '무스탕': 'TOP', '파카': 'TOP', '트렌치': 'TOP', '베스트': 'TOP',
    '팬츠': 'BOTTOM', '바지/팬츠': 'BOTTOM', '청바지': 'BOTTOM', '스커트': 'BOTTOM', '원피스': 'CLOTH',
    '가방': '가방', '백팩': '가방', '숄더백': '가방', '크로스백': '가방', '토트백': '가방', '클러치': '가방', '힙색': '가방', '파우치': '가방',
    '지갑': '지갑', '장지갑': '지갑', '중지갑': '지갑', '반지갑': '지갑', '카드지갑': '지갑', '동전지갑': '지갑', '키지갑': '지갑', '머니클립': '지갑',
    '스니커즈': '신발', '부츠': '신발', '신발': '신발', '머플러': '머플러', '목도리': '머플러',
    '긴팔티': 'TOP', '반팔티': 'TOP', '반바지': 'BOTTOM', '샌들/쪼리': '신발', '슬리퍼': '신발', '로퍼': '신발', '단화/플랫': '신발', '하이힐/펌프스': '신발'
  };
  function catOkForKinds(r, kinds) {
    if (!kinds || !kinds.length || !r.cat) return true;
    var c = r.cat;
    return kinds.some(function (k) {
      var g = KIND_CAT[k];
      if (!g) return true;                                   // 모르는 종류는 거르지 않는다
      if (g === 'TOP') return c.indexOf('의류') >= 0 && c.indexOf('하의') < 0;
      if (g === 'BOTTOM') return c.indexOf('의류') >= 0 && c.indexOf('상의') < 0;
      if (g === 'CLOTH') return c.indexOf('의류') >= 0;
      return c.indexOf(g) >= 0;
    });
  }
  // 이 종류가 "아닌 게 확실한" 상품명 단어 — AI에게 물어볼 후보에서 뺀다(예: 패딩 요청에 '티셔츠'·'니트'·'팬츠'는 묻지 않음).
  var PADDING_EXCL = ['티셔츠', '셔츠', '블라우스', '니트', '스웨터', '가디건', '카디건', '팬츠', '바지', '스커트', '원피스', '드레스', '맨투맨', '후드티', '폴로', '탑', '민소매', '반팔', '슬리브리스', '반바지', '쇼츠', '레깅스', '청바지', '진 '];
  var KIND_EXCL = { '패딩': PADDING_EXCL, '다운': PADDING_EXCL, '푸퍼': PADDING_EXCL, '롱패딩': PADDING_EXCL, '경량패딩': PADDING_EXCL };
  function excludedByKinds(r, kinds) {
    if (!kinds || !kinds.length) return false;
    var n = r.name || '';
    return kinds.every(function (k) {
      var ex = KIND_EXCL[k]; if (!ex) return false;
      return ex.some(function (w) { return n.indexOf(w) >= 0; });
    });
  }
  var api = { KIND_SPEC: KIND_SPEC, KIND_GROUPS: KIND_GROUPS, KIND_ALIAS: KIND_ALIAS, activeSeasons: activeSeasons, offWords: offWords, kindInSeason: kindInSeason, dropOffSeason: dropOffSeason, excludedByKinds: excludedByKinds, catOkForKinds: catOkForKinds, MALL_COLS: MALL_COLS, OUT_HEAD: OUT_HEAD, mallRecord: mallRecord, groupMalls: groupMalls, mergeMap: mergeMap, mapAsOf: mapAsOf, convert: convert, seasonOf: seasonOf, seasonRank: seasonRank, order: order, brandStats: brandStats, parseSabangnet: parseSabangnet, parseRequest: parseRequest, select: select, KIND_MAP: KIND_MAP };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PromoPick = api;
})(typeof window !== 'undefined' ? window : this);
