/* XLSXW.read(buf, opts) → Promise<workbook>
   XLSX.read 와 같은 결과를 돌려주지만 읽기 작업을 별도 스레드(Worker)에서 한다.
   - 큰 엑셀(수만 줄)을 올려도 읽는 동안 화면이 멈추지 않는다.
   - 워커를 못 쓰는 환경(파일로 직접 열기 등)이면 자동으로 기존 방식(XLSX.read)으로 읽는다.
   - 엑셀이 잘못된 파일이면 XLSX.read 와 똑같이 오류(reject)를 낸다. */
(function () {
  var worker = null, seq = 0, pending = {}, broken = false;

  function fail(msg) {
    broken = true;
    try { if (worker) worker.terminate(); } catch (e) {}
    worker = null;
    var p = pending; pending = {};
    Object.keys(p).forEach(function (k) { p[k].fallback(); });
  }
  function getWorker() {
    if (broken) return null;
    if (worker) return worker;
    try {
      worker = new Worker('assets/xlsx-worker.js');
      worker.onmessage = function (e) {
        var d = e.data, p = pending[d.id];
        if (!p) return;
        delete pending[d.id];
        if (d.error) p.reject(new Error(d.error)); else p.resolve(d.wb);
      };
      worker.onerror = function () { fail('worker error'); };
    } catch (e) { broken = true; worker = null; }
    return worker;
  }

  window.XLSXW = {
    read: function (buf, opts) {
      opts = opts || { type: 'array' };
      return new Promise(function (resolve, reject) {
        var w = getWorker();
        var direct = function () { try { resolve(XLSX.read(buf, opts)); } catch (err) { reject(err); } };
        if (!w) return direct();
        var id = ++seq;
        pending[id] = { resolve: resolve, reject: reject, fallback: direct };
        try { w.postMessage({ id: id, buf: buf, opts: opts }); }   // buf 는 복사해서 보낸다(원본은 그대로 사용 가능)
        catch (e) { delete pending[id]; direct(); }
      });
    }
  };
})();
