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
      if (textN.indexOf(k) >= 0) {
        kinds.push(k);
        KIND_MAP[k].forEach(function (w) { if (words.indexOf(w) < 0) words.push(w); });
      }
    });
    var audiences = [];
    if (/키즈|아동|아기|주니어|kids/i.test(text)) audiences.push('아동');
    if (/여성|우먼|레이디/.test(text)) audiences.push('여성');
    if (/남성|맨즈|남자/.test(text)) audiences.push('남성');
    if (!audiences.length) audiences = ['여성', '남성']; // 말이 없으면 성인만 (아동 제외)
    return { brands: brands, kinds: kinds, words: words, audiences: audiences };
  }

  // audiences: ['여성','남성','아동'] 중 허용할 대상 (상품분류 맨 앞 단어 기준). 비어 있거나 분류가 없으면 거르지 않는다.
  function select(rows, brands, words, inStockOnly, audiences, seasons) {
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
        var hay = r.name + ' ' + (r.cat || ''); // 상품분류(카테고리)가 있으면 그것도 함께 본다
        for (var i = 0; i < words.length; i++) { if (hay.indexOf(words[i]) >= 0) { ok = true; break; } }
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

  var api = { seasonOf: seasonOf, seasonRank: seasonRank, order: order, brandStats: brandStats, parseSabangnet: parseSabangnet, parseRequest: parseRequest, select: select, KIND_MAP: KIND_MAP };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PromoPick = api;
})(typeof window !== 'undefined' ? window : this);
