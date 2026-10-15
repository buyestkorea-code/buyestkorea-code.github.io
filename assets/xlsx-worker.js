/* 엑셀 읽기 전용 작업 스레드 — 큰 파일을 읽는 동안 화면(버튼·스크롤)이 얼어붙지 않게 한다. xlsx-async.js 가 사용. */
importScripts('libs/xlsx.full-0.20.2.min.js');
self.onmessage = function (e) {
  var d = e.data;
  try {
    var wb = XLSX.read(d.buf, d.opts || { type: 'array' });
    self.postMessage({ id: d.id, wb: wb });
  } catch (err) {
    self.postMessage({ id: d.id, error: String((err && err.message) || err) });
  }
};
