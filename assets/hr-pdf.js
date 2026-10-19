/* 급여명세서·근로계약서 PDF 만들기 (브라우저 안에서만 처리 — 서버로 보내지 않는다).
   화면 조각(HTML) → html2canvas 로 그림 → A4 쪽 단위로 잘라 JPEG → 아주 단순한 PDF 로 묶어 내려받기.
   한글 폰트를 따로 넣을 필요가 없는 대신, PDF 안의 글씨는 그림이라 복사·검색은 안 된다. */
(function(root){
  var A4W = 595.28, A4H = 841.89, MARGIN = 28;

  function loadScript(src){
    return new Promise(function(res, rej){
      var s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = function(){ rej(new Error('라이브러리를 불러오지 못했어요')); };
      document.head.appendChild(s);
    });
  }
  function ensureLib(){
    if(root.html2canvas) return Promise.resolve();
    return loadScript('assets/libs/html2canvas-1.4.1.min.js');
  }
  function b64ToBytes(b64){
    var bin = atob(b64), n = bin.length, u = new Uint8Array(n);
    for(var i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  function ascii(s){ var u = new Uint8Array(s.length); for(var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; }
  function concat(parts){
    var n = 0, i; for(i = 0; i < parts.length; i++) n += parts[i].length;
    var out = new Uint8Array(n), o = 0;
    for(i = 0; i < parts.length; i++){ out.set(parts[i], o); o += parts[i].length; }
    return out;
  }

  // pages: [{jpeg:Uint8Array, w:px, h:px}]  → PDF 바이트
  function buildPdf(pages){
    var objs = [];   // 번호 n 의 내용 = objs[n-1]
    var dw = A4W - 2 * MARGIN;
    var kids = [];
    objs.push(null); objs.push(null);   // 1 카탈로그, 2 페이지 목록 (뒤에 채움)
    pages.forEach(function(p, i){
      var pageNo = 3 + i * 3, contNo = pageNo + 1, imgNo = pageNo + 2;
      var dh = dw * p.h / p.w;
      var y = A4H - MARGIN - dh;
      var content = 'q ' + dw.toFixed(2) + ' 0 0 ' + dh.toFixed(2) + ' ' + MARGIN + ' ' + y.toFixed(2) + ' cm /Im0 Do Q';
      kids.push(pageNo + ' 0 R');
      objs.push(ascii('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + A4W + ' ' + A4H + '] /Contents ' + contNo + ' 0 R /Resources << /XObject << /Im0 ' + imgNo + ' 0 R >> >> >>'));
      objs.push(concat([ascii('<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream')]));
      objs.push(concat([ascii('<< /Type /XObject /Subtype /Image /Width ' + p.w + ' /Height ' + p.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + p.jpeg.length + ' >>\nstream\n'), p.jpeg, ascii('\nendstream')]));
    });
    objs[0] = ascii('<< /Type /Catalog /Pages 2 0 R >>');
    objs[1] = ascii('<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + pages.length + ' >>');
    var parts = [ascii('%PDF-1.4\n')], offsets = [], pos = parts[0].length;
    objs.forEach(function(o, i){
      var head = ascii((i + 1) + ' 0 obj\n'), tail = ascii('\nendobj\n');
      offsets.push(pos);
      parts.push(head, o, tail);
      pos += head.length + o.length + tail.length;
    });
    var xref = 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
    offsets.forEach(function(o){ xref += ('0000000000' + o).slice(-10) + ' 00000 n \n'; });
    xref += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + pos + '\n%%EOF';
    parts.push(ascii(xref));
    return concat(parts);
  }

  // 요소 하나 → A4 쪽 여러 장(JPEG)
  function elementToPages(el){
    return root.html2canvas(el, {scale:2, backgroundColor:'#ffffff', useCORS:true}).then(function(canvas){
      var dw = A4W - 2 * MARGIN, maxH = A4H - 2 * MARGIN;
      var sliceH = Math.floor(maxH / dw * canvas.width), out = [];
      for(var y = 0; y < canvas.height; y += sliceH){
        var h = Math.min(sliceH, canvas.height - y);
        var c = document.createElement('canvas'); c.width = canvas.width; c.height = h;
        var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, h);
        g.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
        out.push({jpeg:b64ToBytes(c.toDataURL('image/jpeg', 0.92).split(',')[1]), w:c.width, h:h});
      }
      return out;
    });
  }

  function makePdf(elements){
    return ensureLib().then(function(){
      var all = [];
      return elements.reduce(function(chain, el){
        return chain.then(function(){ return elementToPages(el).then(function(p){ all = all.concat(p); }); });
      }, Promise.resolve()).then(function(){ return buildPdf(all); });
    });
  }
  function saveBytes(bytes, filename){
    var blob = new Blob([bytes], {type:'application/pdf'}), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function download(elements, filename){ return makePdf(elements).then(function(b){ saveBytes(b, filename); return b; }); }


  /* ---------- 문서 모양 (A4 폭 794px 기준, 화면 밖에 잠깐 그렸다가 PDF 로 찍는다) ---------- */
  function esc(t){ return String(t == null ? '' : t).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function won(v){ return (typeof v === 'number' ? Math.round(v).toLocaleString('ko-KR') : esc(v)) + (typeof v === 'number' ? '원' : ''); }
  function dotDate(s){ return s ? String(s).replace(/-/g, '.') : ''; }
  var FONT = '"Pretendard Variable",Pretendard,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif';
  function shell(html){
    var d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;box-sizing:border-box;padding:44px 46px 40px;background:#fff;color:#1d2220;font-family:' + FONT + ';font-size:13px;line-height:1.55;';
    d.innerHTML = html;
    document.body.appendChild(d);
    return d;
  }
  function rows(list){
    return list.map(function(p){ return '<tr><td style="padding:7px 10px;border-bottom:1px solid #e6e2d8;">' + esc(p[0]) + '</td><td style="padding:7px 10px;border-bottom:1px solid #e6e2d8;text-align:right;font-variant-numeric:tabular-nums;">' + won(p[1]) + '</td></tr>'; }).join('')
      || '<tr><td colspan="2" style="padding:7px 10px;color:#8a8f86;">해당 없음</td></tr>';
  }
  function payslipEl(s){
    var ym = String(s.ym || '').split('-');
    var th = 'style="padding:8px 10px;background:#2F5D53;color:#fff;text-align:left;font-weight:700;"';
    var tot = 'style="padding:9px 10px;background:#f4f1e8;font-weight:800;"';
    var info = function(k, v){ return '<td style="padding:6px 10px;background:#f4f1e8;font-weight:700;width:90px;border:1px solid #e0dccf;">' + k + '</td><td style="padding:6px 10px;border:1px solid #e0dccf;">' + esc(v || '–') + '</td>'; };
    var body;
    if(s.status){
      body = '<div style="margin:28px 0;padding:26px;border:1px dashed #b9b4a4;border-radius:10px;text-align:center;font-size:16px;font-weight:700;">' + esc(s.status) + ' 중 — 이 달 지급 내역이 없습니다</div>';
    } else {
      body = '<div style="display:flex;gap:14px;align-items:flex-start;">' +
        '<table style="flex:1;border-collapse:collapse;border:1px solid #e0dccf;"><tr><th colspan="2" ' + th + '>지급 내역</th></tr>' + rows(s.pay || []) + '<tr><td ' + tot + '>지급합계</td><td ' + tot + ' align="right">' + won(s.pay_total != null ? s.pay_total : 0) + '</td></tr></table>' +
        '<table style="flex:1;border-collapse:collapse;border:1px solid #e0dccf;"><tr><th colspan="2" ' + th + '>공제 내역</th></tr>' + rows(s.ded || []) + '<tr><td ' + tot + '>공제합계</td><td ' + tot + ' align="right">' + won(s.ded_total != null ? s.ded_total : 0) + '</td></tr></table></div>' +
        '<div style="margin-top:16px;padding:18px 22px;border-radius:12px;background:#E3ECE8;display:flex;justify-content:space-between;align-items:baseline;"><span style="font-size:15px;font-weight:700;">차인지급액 (실수령액)</span><span style="font-size:26px;font-weight:800;color:#2F5D53;font-variant-numeric:tabular-nums;">' + won(s.net != null ? s.net : 0) + '</span></div>' +
        ((s.memo && s.memo.length) ? '<div style="margin-top:10px;font-size:12px;color:#5C6259;">참고: ' + s.memo.map(function(p){ return esc(p[0]) + ' ' + won(p[1]); }).join(' · ') + '</div>' : '') +
        (s.note ? '<div style="margin-top:8px;font-size:12px;color:#5C6259;">비고: ' + esc(s.note) + '</div>' : '');
    }
    return shell(
      '<div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #2F5D53;padding-bottom:12px;margin-bottom:18px;">' +
        '<div><div style="font-size:26px;font-weight:800;letter-spacing:-.02em;">급여명세서</div><div style="color:#5C6259;margin-top:2px;">' + esc(s.company) + '</div></div>' +
        '<div style="text-align:right;"><div style="font-size:17px;font-weight:700;">' + esc(ym[0]) + '년 ' + esc(ym[1]) + '월분</div><div style="color:#5C6259;margin-top:2px;">지급일 ' + esc(dotDate(s.pay_date) || '–') + '</div></div></div>' +
      '<table style="width:100%;border-collapse:collapse;margin-bottom:18px;"><tr>' + info('성명', s.name) + info('사원번호', s.emp_no) + '</tr><tr>' + info('입사일', dotDate(s.join_date)) + info('직위·부서', [s.title, s.dept].filter(Boolean).join(' · ')) + '</tr></table>' +
      body +
      '<div style="margin-top:34px;padding-top:12px;border-top:1px solid #e0dccf;font-size:11px;color:#8a8f86;line-height:1.6;">본 명세서는 BUYEST Toolkit에서 본인 계정 확인 후 발급되었습니다. 본인 외 열람·유출을 금지하며, 내용에 이상이 있으면 관리자에게 문의해 주세요.<br>발급 ' + esc(new Date().toLocaleString('ko-KR')) + '</div>');
  }
  function contractEl(c, who){
    var sig = c.signature ? '<img src="' + esc(c.signature) + '" alt="서명" style="height:70px;max-width:260px;display:block;">' : '<div style="height:70px;color:#b23b3b;font-weight:700;line-height:70px;">(미서명)</div>';
    return shell(
      '<div style="border-bottom:3px solid #2F5D53;padding-bottom:10px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:flex-end;"><div style="font-size:24px;font-weight:800;">근로계약서</div><div style="color:#5C6259;">' + esc(c.year) + '년 · ' + esc(c.company) + '</div></div>' +
      '<div style="white-space:pre-wrap;word-break:keep-all;font-size:13px;line-height:1.8;">' + esc(c.body) + '</div>' +
      '<div style="margin-top:30px;padding:14px 18px;border:1px solid #e0dccf;border-radius:10px;display:flex;justify-content:space-between;align-items:center;gap:16px;">' +
        '<div><div style="font-weight:700;margin-bottom:4px;">근로자 서명 · ' + esc(who || c.username || '') + '</div><div style="font-size:12px;color:#5C6259;">' + (c.signed_at ? '서명일시 ' + esc(c.signed_at) : '서명 전') + '</div></div>' + sig + '</div>' +
      '<div style="margin-top:14px;font-size:11px;color:#8a8f86;">BUYEST Toolkit 전자서명(간이) · 서명 시점의 계약 본문과 서명 이미지가 서버에 저장됩니다.</div>');
  }
  function withEl(el, fn){ return fn(el).then(function(r){ el.remove(); return r; }, function(e){ el.remove(); throw e; }); }

  root.HRPDF = {makePdf:makePdf, download:download, buildPdf:buildPdf, payslipEl:payslipEl, contractEl:contractEl, withEl:withEl};
})(window);
