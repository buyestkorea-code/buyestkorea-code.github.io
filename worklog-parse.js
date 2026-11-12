/* 바이스트팀룸 — 업무량 텍스트 파서.
   "쿠팡 - 81개 / 위즈위드 50 / 택배찾기" → [{name,canonical,qty,memo}]
   qty=null 인 항목은 숫자 없는 메모(집계 제외). 브라우저: window.parseWorklog / node: module.exports. */
(function(root){
  var UNIT = '(?:개|건|명|장|벌)';

  // 괄호 밖의 / , 줄바꿈으로 조각낸다. 숫자/숫자, 숫자,숫자(1/18.5, 1,200)는 쪼개지 않는다.
  function splitTop(text){
    var out = [], cur = '', depth = 0, i, c, p, n;
    for(i = 0; i < text.length; i++){
      c = text.charAt(i);
      if(c === '(' || c === '（'){ depth++; }
      else if((c === ')' || c === '）') && depth > 0){ depth--; }
      if(depth === 0 && (c === '/' || c === ',' || c === '，' || c === '\n' || c === '\r')){
        p = text.charAt(i - 1); n = text.charAt(i + 1);
        if((c === '/' || c === ',') && /\d/.test(p) && /\d/.test(n)){ cur += c; continue; }
        out.push(cur); cur = '';
        continue;
      }
      cur += c;
    }
    out.push(cur);
    return out.map(function(s){ return s.replace(/\s+/g, ' ').trim(); }).filter(Boolean);
  }

  function blank(s, re){ return s.replace(re, function(m){ return new Array(m.length + 1).join('§'); }); }

  // 같은 길이의 "수량 후보만 남긴" 문자열: 괄호 안·날짜·시간·%·월/일 숫자는 §로 가린다.
  function mask(seg){
    var s = seg, depth = 0, buf = '', i, c;
    for(i = 0; i < s.length; i++){
      c = s.charAt(i);
      if(c === '(' || c === '（'){ depth++; buf += '§'; continue; }
      if((c === ')' || c === '）') && depth > 0){ depth--; buf += '§'; continue; }
      buf += depth > 0 ? '§' : c;
    }
    buf = blank(buf, /\d{1,2}:\d{2}/g);
    buf = blank(buf, /\d+(?:[./]\d+)+/g);
    buf = blank(buf, /\d+\s*(?:월|일|%|퍼센트|원|주년|주차|분|시(?!즌))/g);
    return buf;
  }

  function normName(s){
    return s.replace(/\s+/g, '').replace(/[A-Za-z]+/g, function(m){ return m.toUpperCase(); }).slice(0, 60);
  }

  function parseWorklog(text, alias){
    alias = alias || {};
    var items = [];
    splitTop(String(text == null ? '' : text)).forEach(function(seg){
      var masked = mask(seg);
      var re = new RegExp('([가-힣A-Za-z#_][가-힣A-Za-z#_ ]*?)\\s*[-:]?\\s*(\\d+)\\s*' + UNIT + '?', 'g');
      var m, found = 0;
      while((m = re.exec(masked)) !== null){
        var name = normName(m[1]);
        if(!name) continue;
        found++;
        var after = seg.slice(re.lastIndex);
        var pm = /^\s*[(（]([^)）]*)[)）]/.exec(after);
        var memo = pm ? pm[1].trim().slice(0, 200) : '';
        items.push({name: name, canonical: alias[name] || name, qty: parseInt(m[2], 10), memo: memo});
      }
      if(!found){
        items.push({name: '', canonical: '', qty: null, memo: seg.slice(0, 200)});
      }
    });
    return {items: items};
  }

  if(typeof module !== 'undefined' && module.exports){ module.exports = {parseWorklog: parseWorklog}; }
  else { root.parseWorklog = parseWorklog; }
})(typeof window !== 'undefined' ? window : this);
