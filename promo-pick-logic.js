/* 기획전 상품 뽑기 - 셀렉 로직 (브라우저/노드 공용, 서버 호출 없음) */
(function (root) {
  'use strict';

  // 상품 종류 말 → 상품명에서 찾을 단어들
  var KIND_MAP = {
    '패딩': ['패딩', '다운', '푸퍼'], '다운': ['패딩', '다운', '푸퍼'], '푸퍼': ['패딩', '다운', '푸퍼'],
    '코트': ['코트'], '자켓': ['자켓', '재킷'], '재킷': ['자켓', '재킷'], '점퍼': ['점퍼', '자켓'],
    '니트': ['니트', '스웨터'], '스웨터': ['니트', '스웨터'], '후드': ['후드'], '맨투맨': ['맨투맨', '스웨트'],
    '셔츠': ['셔츠'], '티셔츠': ['티셔츠'], '팬츠': ['팬츠', '바지'], '청바지': ['데님', '진'],
    '스커트': ['스커트'], '원피스': ['원피스', '드레스'], '가방': ['백', '가방', '토트', '숄더', '크로스'],
    '지갑': ['지갑', '월렛'], '스니커즈': ['스니커즈', '운동화'], '부츠': ['부츠'], '신발': ['스니커즈', '부츠', '로퍼', '샌들', '슈즈'],
    '머플러': ['머플러', '스카프'], '목도리': ['머플러', '스카프']
  };
  var STOP = ['명품', '세일', '기획전', '기획', '할인', '프로모션', '이벤트', '관련', '브랜드', '입니다', '주세요', '해주세요',
    '11월', '12월', '10월', '9월', '8월', '1월', '2월', '3월', '4월', '5월', '6월', '7월', '등', '및', '그리고'];

  function norm(s) { return String(s == null ? '' : s).replace(/\s+/g, '').toLowerCase(); }
  function cellStr(v) { return v == null ? '' : String(v).replace(/\r?\n/g, ' ').trim(); }

  // aoa(2차원 배열) → {rows:[{code,name,brand}], cols}
  function parseSabangnet(aoa) {
    var hi = -1, i, j;
    for (i = 0; i < Math.min(aoa.length, 8); i++) {
      var r = aoa[i] || [];
      for (j = 0; j < r.length; j++) { if (cellStr(r[j]).indexOf('품번코드') === 0) { hi = i; break; } }
      if (hi >= 0) break;
    }
    if (hi < 0) throw new Error('사방넷 파일이 아닌 것 같습니다 ("품번코드" 열을 못 찾았어요)');
    var h = aoa[hi].map(cellStr);
    function col(test) { for (var k = 0; k < h.length; k++) { if (test(h[k])) return k; } return -1; }
    var cCode = col(function (x) { return x.indexOf('품번코드') === 0; });
    var cName = col(function (x) { return x === '상품명'; });
    var cBrand = col(function (x) { return x === '브랜드명'; });
    if (cName < 0) throw new Error('"상품명" 열을 못 찾았어요');
    var rows = [];
    for (i = hi + 1; i < aoa.length; i++) {
      var row = aoa[i] || [];
      var code = cellStr(row[cCode]);
      if (!code || code.charAt(0) === '▶') continue; // 설명 행 건너뜀
      var name = cellStr(row[cName]);
      if (!name) continue;
      rows.push({ code: code, name: name, brand: cBrand >= 0 ? cellStr(row[cBrand]) : '' });
    }
    return { rows: rows, hasBrand: cBrand >= 0 };
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
      if (textN.indexOf(k) >= 0) {
        kinds.push(k);
        KIND_MAP[k].forEach(function (w) { if (words.indexOf(w) < 0) words.push(w); });
      }
    });
    return { brands: brands, kinds: kinds, words: words };
  }

  function select(rows, brands, words) {
    var bset = {};
    brands.forEach(function (b) { bset[b] = true; });
    return rows.filter(function (r) {
      if (brands.length && !bset[r.brand]) return false;
      if (words.length) {
        var ok = false;
        for (var i = 0; i < words.length; i++) { if (r.name.indexOf(words[i]) >= 0) { ok = true; break; } }
        if (!ok) return false;
      }
      return true;
    });
  }

  var api = { parseSabangnet: parseSabangnet, parseRequest: parseRequest, select: select, KIND_MAP: KIND_MAP };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PromoPick = api;
})(typeof window !== 'undefined' ? window : this);
