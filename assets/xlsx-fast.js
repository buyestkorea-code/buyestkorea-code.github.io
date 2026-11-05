/* 큰 xlsx 를 빠르게 읽는 도구 (브라우저·노드 공용, 서버 호출 없음)
 * SheetJS 는 셀마다 서식까지 해석해서 10만 줄이 넘는 사방넷 다운로드 파일에서 수십 초가 걸린다.
 * 여기서는 zip 을 풀고 <row>/<c> 만 정규식으로 훑어서 필요한 열의 값만 뽑는다. (메인 화면의 readXlsxAoaViaRegex 와 같은 방식)
 *
 *   XlsxFast.readColumns(file, ['품번코드','판매가(송신)', ...])
 *     → { header:[...], rows:[ [값,...] ] }   (rows 의 열 순서 = 요청한 이름 순서, 값은 모두 문자열)
 *   file 은 arrayBuffer() 를 가진 객체(File/Blob)면 된다.
 */
(function (root) {
  'use strict';

  async function inflateRaw(bytes) {
    var ds = new DecompressionStream('deflate-raw');
    var stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function readZip(buf) {
    var view = new DataView(buf), bytes = new Uint8Array(buf), eocd = -1, i;
    for (i = bytes.length - 22; i >= 0; i--) { if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
    if (eocd === -1) throw new Error('올바른 xlsx(zip) 파일이 아닙니다.');
    var cdCount = view.getUint16(eocd + 10, true), p = view.getUint32(eocd + 16, true), entries = {};
    for (i = 0; i < cdCount; i++) {
      if (view.getUint32(p, true) !== 0x02014b50) throw new Error('zip 중앙 디렉터리 손상');
      var method = view.getUint16(p + 10, true), compSize = view.getUint32(p + 20, true);
      var nameLen = view.getUint16(p + 28, true), extraLen = view.getUint16(p + 30, true), commentLen = view.getUint16(p + 32, true);
      var localOffset = view.getUint32(p + 42, true);
      var name = new TextDecoder('utf-8').decode(bytes.subarray(p + 46, p + 46 + nameLen));
      var lName = view.getUint16(localOffset + 26, true), lExtra = view.getUint16(localOffset + 28, true);
      var start = localOffset + 30 + lName + lExtra;
      entries[name] = { method: method, data: bytes.subarray(start, start + compSize) };
      p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  }
  async function getText(entries, name) {
    var e = entries[name]; if (!e) return '';
    var b = e.method === 0 ? e.data : await inflateRaw(e.data);
    return new TextDecoder('utf-8').decode(b);
  }

  function unesc(s) {
    if (s.indexOf('&') < 0) return s;
    return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, function (_, d) { return String.fromCharCode(+d); })
      .replace(/&#x([0-9a-fA-F]+);/g, function (_, h) { return String.fromCharCode(parseInt(h, 16)); })
      .replace(/&amp;/g, '&');
  }
  function sharedStrings(xml) {
    var out = [], siRe = /<si>([\s\S]*?)<\/si>|<si\/>/g, m, tRe = /<t[^>]*>([\s\S]*?)<\/t>/g, t;
    while ((m = siRe.exec(xml))) {
      var s = '';
      if (m[1]) { tRe.lastIndex = 0; while ((t = tRe.exec(m[1]))) s += t[1]; }
      out.push(unesc(s));
    }
    return out;
  }
  function firstSheetPath(wbXml, relsXml) {
    var sm = /<sheet [^>]*?r:id="([^"]+)"/.exec(wbXml);
    if (!sm) throw new Error('시트를 찾지 못했습니다.');
    var rm = new RegExp('<Relationship [^>]*?Id="' + sm[1] + '"[^>]*?>').exec(relsXml);
    var tm = rm && /Target="([^"]+)"/.exec(rm[0]);
    if (!tm) throw new Error('시트 경로를 찾지 못했습니다.');
    var target = tm[1].replace(/^\.?\//, '');
    return target.indexOf('xl/') === 0 ? target : 'xl/' + target;
  }
  function colIndex(letters) { var c = 0; for (var i = 0; i < letters.length; i++) c = c * 26 + (letters.charCodeAt(i) - 64); return c - 1; }

  async function readColumns(file, wanted, opts) {
    var buf = await file.arrayBuffer();
    var entries = await readZip(buf);
    var sst = sharedStrings(await getText(entries, 'xl/sharedStrings.xml'));
    var path = firstSheetPath(await getText(entries, 'xl/workbook.xml'), await getText(entries, 'xl/_rels/workbook.xml.rels'));
    var xml = await getText(entries, path);
    var rowRe = /<row [^>]*?r="(\d+)"[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g;
    var cellRe = /<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    var header = null, pick = null, rows = [], m, cm;
    var maxHeaderRows = (opts && opts.headerScan) || 6;
    while ((m = rowRe.exec(xml))) {
      var rowNum = parseInt(m[1], 10), content = m[2];
      if (!content) continue;
      var cells = {};
      cellRe.lastIndex = 0;
      while ((cm = cellRe.exec(content))) {
        if (cm[3] === undefined) continue;
        var attrs = cm[2], inner = cm[3], val = '', im;
        if ((im = /<is>([\s\S]*?)<\/is>/.exec(inner))) {
          var tt = /<t[^>]*>([\s\S]*?)<\/t>/g, t2, acc = ''; while ((t2 = tt.exec(im[1]))) acc += t2[1]; val = unesc(acc);
        } else if ((im = /<v>([\s\S]*?)<\/v>/.exec(inner))) {
          val = /\bt="s"/.test(attrs) ? (sst[parseInt(im[1], 10)] || '') : unesc(im[1]);
        }
        cells[colIndex(cm[1])] = val;
      }
      if (!pick) {
        if (rowNum > maxHeaderRows) throw new Error('머리글 행을 찾지 못했습니다 (' + wanted.join(', ') + ')');
        var names = {}, any = false;
        Object.keys(cells).forEach(function (k) { names[String(cells[k]).replace(/\s+/g, ' ').trim()] = +k; });
        pick = wanted.map(function (w) { var k = names[w]; if (k !== undefined) any = true; return k; });
        if (!any || pick.indexOf(undefined) >= 0) { pick = null; continue; }
        header = Object.keys(names);
        continue;
      }
      var out = new Array(pick.length);
      for (var i = 0; i < pick.length; i++) { var v = cells[pick[i]]; out[i] = v === undefined ? '' : v; }
      rows.push(out);
    }
    if (!pick) throw new Error('필요한 열을 찾지 못했습니다: ' + wanted.join(', '));
    return { header: header, rows: rows };
  }

  var api = { readColumns: readColumns };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.XlsxFast = api;
})(typeof window !== 'undefined' ? window : this);
