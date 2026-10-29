/* 사용 설명서 공통 렌더러 — manual-data.js 의 항목 하나를 화면용 HTML 문자열로 바꿔 준다 */
(function(){
  var D = window.TOOLKIT_MANUALS;
  function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  // [[버튼]] → 버튼 모양, **굵게** → <b>
  function fmt(s){
    return esc(s).replace(/\[\[([^\]]+)\]\]/g,'<span class="mbtn">$1</span>').replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>');
  }
  function list(arr){ return '<ul>' + arr.map(function(x){ return '<li>' + fmt(x) + '</li>'; }).join('') + '</ul>'; }
  function groupName(id){ var g = D.groups.filter(function(x){ return x.id === id; })[0]; return g ? g.name : ''; }
  function find(id){ return D.items.filter(function(x){ return x.id === id; })[0]; }

  function itemHTML(it){
    var h = '<div class="mn">';
    h += '<div class="mn-group">' + esc(groupName(it.g)) + '</div>';
    h += '<div class="mn-head"><h2>' + esc(it.title) + '</h2><span class="mn-badge ' + it.st + '">' + (it.st === 'ok' ? '사용가능' : '시험판') + '</span></div>';
    h += '<div class="mn-what">' + fmt(it.what) + '</div>';
    if(it.login) h += '<div class="mn-login"><span>' + fmt(it.login) + '</span></div>';
    if(it.when) h += '<div class="mn-sec"><h3>이럴 때 쓰세요</h3><p>' + fmt(it.when) + '</p></div>';
    if(it.need && it.need.length) h += '<div class="mn-sec"><h3>미리 준비할 것</h3>' + list(it.need) + '</div>';
    h += '<div class="mn-sec"><h3>따라 하기</h3><ol class="mn-steps">' +
      it.steps.map(function(s){ return '<li><div class="t">' + fmt(s[0]) + '</div><div class="d">' + fmt(s[1]) + '</div></li>'; }).join('') +
      '</ol></div>';
    if(it.result && it.result.length) h += '<div class="mn-tip"><h3>결과는 이렇게 보여요</h3>' + list(it.result) + '</div>';
    if(it.warn && it.warn.length) h += '<div class="mn-warn"><h3>꼭 확인하세요</h3>' + list(it.warn) + '</div>';
    if(it.faq && it.faq.length) h += '<div class="mn-sec"><h3>자주 묻는 질문</h3><dl class="mn-faq">' +
      it.faq.map(function(q){ return '<dt>' + fmt(q[0]) + '</dt><dd>' + fmt(q[1]) + '</dd>'; }).join('') + '</dl></div>';
    return h + '</div>';
  }
  window.ManualR = { esc:esc, fmt:fmt, list:list, itemHTML:itemHTML, groupName:groupName, find:find, data:D };
})();
