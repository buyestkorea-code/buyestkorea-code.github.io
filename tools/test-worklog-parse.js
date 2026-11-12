// node tools/test-worklog-parse.js
var assert = require('assert');
var parseWorklog = require('../worklog-parse.js').parseWorklog;

function q(text, alias){
  return parseWorklog(text, alias || {}).items.filter(function(i){ return i.qty !== null; })
    .map(function(i){ return i.canonical + ' ' + i.qty; });
}
function memos(text){
  return parseWorklog(text, {}).items.filter(function(i){ return i.qty === null; }).map(function(i){ return i.memo; });
}
var n = 0;
function t(name, fn){ try{ fn(); n++; console.log('ok  ' + name); }catch(e){ console.log('FAIL ' + name + '\n  ' + e.message); process.exitCode = 1; } }

t('dash + 개 + 구분자 /', function(){
  assert.deepStrictEqual(q('쿠팡 - 81개 / 위즈위드 50 / NS 50'), ['쿠팡 81', '위즈위드 50', 'NS 50']);
});
t('사진작업/스토어팜', function(){
  assert.deepStrictEqual(q('사진작업 4개 / 스토어팜 47개'), ['사진작업 4', '스토어팜 47']);
});
t('공백으로 이어진 쌍', function(){
  assert.deepStrictEqual(q('사진작업14  성인2'), ['사진작업 14', '성인 2']);
});
t('괄호는 메모', function(){
  var it = parseWorklog('키즈작업17(성인7) 성인1', {}).items;
  assert.deepStrictEqual(it.map(function(i){ return i.name + ' ' + i.qty; }), ['키즈작업 17', '성인 1']);
  assert.strictEqual(it[0].memo, '성인7');
});
t('택배 250', function(){ assert.deepStrictEqual(q('택배 250'), ['택배 250']); });
t('숫자 없는 조각은 메모', function(){
  assert.deepStrictEqual(memos('택배찾기'), ['택배찾기']);
  assert.deepStrictEqual(q('택배찾기'), []);
});
t('RF1 괄호 안 쉼표/슬래시는 쪼개지 않음', function(){
  assert.deepStrictEqual(q('LF 기획전 (사이즈,키즈,의류)'), []);
  assert.deepStrictEqual(memos('LF 기획전 (사이즈,키즈,의류)'), ['LF 기획전 (사이즈,키즈,의류)']);
  assert.deepStrictEqual(memos('기획전 (a/b)'), ['기획전 (a/b)']);
});
t('RF2 날짜·시간·퍼센트는 수량 아님', function(){
  assert.deepStrictEqual(q('3.26 재고추가 완료'), []);
  assert.deepStrictEqual(q('7월10일 재고추가 완료'), []);
  assert.deepStrictEqual(q('18:00 출근 (11명)'), []);
  assert.deepStrictEqual(q('할인 10% UP'), []);
  assert.deepStrictEqual(q('재고 차감 1/18.5'), []);
});
t('주년·시각 숫자는 수량 아님', function(){
  assert.deepStrictEqual(q('13주년 노출 순서 변경 / 11시 출근 / 시즌 8'), ['시즌 8']);
});
t('날짜 조각과 수량 조각이 섞여도 수량만', function(){
  assert.deepStrictEqual(q('3.26 재고추가 완료 / 택배 104'), ['택배 104']);
});
t('별칭 적용', function(){
  assert.deepStrictEqual(q('스텔라필웨이 87개', {'스텔라필웨이': '필웨이'}), ['필웨이 87']);
});
t('이름 공백 제거·라틴 대문자', function(){
  assert.deepStrictEqual(q('ns 42 / 사진 작업 5'), ['NS 42', '사진작업 5']);
});
t('빈 입력', function(){
  assert.deepStrictEqual(parseWorklog('', {}).items, []);
  assert.deepStrictEqual(parseWorklog('  \n ', {}).items, []);
});
t('줄바꿈 구분 + 쉼표', function(){
  assert.deepStrictEqual(q('쿠팡 10\nNS 5, 스토어팜 3'), ['쿠팡 10', 'NS 5', '스토어팜 3']);
});
console.log(n + ' passed');
