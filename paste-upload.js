/* BUYEST 툴킷 공통 붙여넣기(Ctrl+V) 업로드
   - 탐색기에서 파일을 Ctrl+C → 화면 아무 곳에서나 Ctrl+V 하면 지금 보이는 파일 선택칸에 들어간다.
   - 엑셀에서 셀 범위를 Ctrl+C → Ctrl+V 하면 그 내용을 엑셀 파일(xlsx)로 만들어 넣는다.
   - 글자 입력칸(input/textarea)에 붙여넣는 것은 건드리지 않는다.
   - 기존 화면별 paste 처리보다 먼저 실행되고(capture), 처리하면 중복 실행되지 않게 막는다. */
(function(){
  if(window.__buyestPasteUpload) return; window.__buyestPasteUpload = true;

  var lastDown = null;
  document.addEventListener('pointerdown', function(e){ lastDown = e.target; }, true);

  function isTextTarget(t){
    if(!t || t.nodeType !== 1) return false;
    if(t.isContentEditable) return true;
    var tag = t.tagName;
    if(tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if(tag === 'INPUT'){ var ty = (t.type || 'text').toLowerCase(); return ty !== 'file' && ty !== 'button' && ty !== 'checkbox' && ty !== 'radio'; }
    return false;
  }
  function shown(el){
    // 입력칸 자체는 숨겨져 있어도(드롭존 뒤에 감춘 경우) 부모가 보이면 "보이는" 것으로 본다
    var p = el.parentElement;
    while(p && p !== document.body){
      var cs = getComputedStyle(p);
      if(cs.display === 'none' || cs.visibility === 'hidden') return false;
      p = p.parentElement;
    }
    var host = el.parentElement; if(!host) return false;
    var r = host.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function extOf(name){ var m = /\.([^.]+)$/.exec(name || ''); return m ? m[1].toLowerCase() : ''; }
  function accepts(input, file){
    var acc = (input.getAttribute('accept') || '').toLowerCase().trim();
    if(!acc) return true;
    var ext = '.' + extOf(file.name), type = (file.type || '').toLowerCase();
    return acc.split(',').some(function(a){
      a = a.trim(); if(!a) return false;
      if(a[0] === '.') return a === ext;
      if(a.slice(-2) === '/*') return type.indexOf(a.slice(0, -1)) === 0;
      return a === type;
    });
  }
  function candidates(file){
    var all = Array.prototype.slice.call(document.querySelectorAll('input[type=file]'));
    var ok = all.filter(function(i){ return !i.disabled && shown(i) && accepts(i, file); });
    if(!ok.length) return null;
    // 마지막으로 클릭한 곳과 가장 가까운(같은 카드 안) 입력칸을 우선
    if(lastDown && ok.length > 1){
      var el = lastDown;
      while(el && el !== document.body){
        var hit = ok.filter(function(i){ return el.contains(i); });
        if(hit.length) return hit[0];
        el = el.parentElement;
      }
    }
    return ok[0];
  }
  function toast(msg, bad){
    var d = document.createElement('div');
    d.textContent = msg;
    d.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483647;padding:10px 16px;border-radius:10px;font:600 13px/1.4 system-ui,sans-serif;color:#fff;background:' + (bad ? '#b3261e' : '#1f6f43') + ';box-shadow:0 4px 16px rgba(0,0,0,.25);max-width:80vw';
    document.body.appendChild(d); setTimeout(function(){ d.remove(); }, 2600);
  }
  function give(input, files){
    var dt = new DataTransfer();
    (input.multiple ? files : [files[0]]).forEach(function(f){ dt.items.add(f); });
    input.files = dt.files;
    input.dispatchEvent(new Event('change', {bubbles:true}));
    toast('붙여넣기 완료: ' + dt.files[0].name + (dt.files.length > 1 ? ' 외 ' + (dt.files.length - 1) + '개' : ''));
  }

  // 엑셀/표에서 복사한 글자(탭·줄바꿈 구분) → 2차원 배열. 따옴표로 감싼 셀(줄바꿈 포함)도 처리
  function parseTsv(t){
    var rows = [], row = [], cur = '', q = false, i = 0, c;
    t = t.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if(t.slice(-1) === '\n') t = t.slice(0, -1);
    for(; i < t.length; i++){
      c = t[i];
      if(q){
        if(c === '"'){ if(t[i + 1] === '"'){ cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if(c === '"' && cur === ''){ q = true; }
      else if(c === '\t'){ row.push(cur); cur = ''; }
      else if(c === '\n'){ row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += c;
    }
    row.push(cur); rows.push(row);
    return rows;
  }
  function cellVal(s){
    // 0으로 시작하는 코드(001234)나 15자리 넘는 숫자는 문자 그대로 둔다
    if(/^-?(0|[1-9]\d{0,14})(\.\d+)?$/.test(s)) return Number(s);
    return s;
  }
  function tsvToFile(text){
    var rows = parseTsv(text).map(function(r){ return r.map(cellVal); });
    var name = '붙여넣기_' + new Date().toISOString().slice(0, 10);
    if(window.XLSX){
      var ws = XLSX.utils.aoa_to_sheet(rows), wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      var out = XLSX.write(wb, {bookType:'xlsx', type:'array'});
      return new File([out], name + '.xlsx', {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    }
    var csv = rows.map(function(r){ return r.map(function(v){ v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); }).join('\r\n');
    return new File(['﻿' + csv], name + '.csv', {type:'text/csv'});
  }

  document.addEventListener('paste', function(e){
    if(isTextTarget(e.target)) return;
    var cd = e.clipboardData; if(!cd) return;
    var files = cd.files && cd.files.length ? Array.prototype.slice.call(cd.files) : [];
    var input = null;
    if(files.length) input = candidates(files[0]);
    if(!input){
      // 엑셀 셀 복사는 그림(png)도 같이 클립보드에 담기므로, 파일이 안 맞으면 글자(표)로 다시 시도
      files = [];
      var text = cd.getData('text');
      if(text && (text.indexOf('\t') >= 0 || text.indexOf('\n') >= 0)){
        var f = tsvToFile(text);
        input = candidates(f);
        if(input) files = [f];
      }
    }
    if(!input || !files.length) return;
    e.preventDefault(); e.stopPropagation();
    give(input, files);
  }, true);
})();
