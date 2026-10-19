/* 급여대장(엑셀) → 직원별 급여명세서 데이터로 바꾸는 해석기. 브라우저/노드 공용.
   대상: 급여 프로그램에서 뽑은 "N월분 급여대장" 한 장짜리 시트. 직원 1명 = 3줄 묶음.
     1줄째  B 사원번호 · C 성명 · D~I 지급항목 · K~O 공제항목 · P 미제출비과세 · R 비고
     2줄째  B 입사일 · C 직위 · K~M 공제항목(고용보험 등) · P 공제합계
     3줄째  B 퇴사일 · C 부서 · J 지급합계 · O 농특세 · P 차인지급액
   항목 이름은 시트 머리글(성명이 있는 줄부터 3줄)에서 열마다 읽어 오므로, 회사마다 항목이 달라도 된다. */
(function(root){
  function norm(s){ return String(s == null ? '' : s).replace(/\s+/g, ''); }
  function str(v){ return v == null ? '' : String(v).trim(); }
  function isNum(v){ return typeof v === 'number' && isFinite(v); }
  function toDate(v){
    if(v instanceof Date && !isNaN(v)) return v.getFullYear() + '-' + ('0'+(v.getMonth()+1)).slice(-2) + '-' + ('0'+v.getDate()).slice(-2);
    var m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/.exec(str(v));
    return m ? m[1] + '-' + ('0'+m[2]).slice(-2) + '-' + ('0'+m[3]).slice(-2) : '';
  }
  function mapCompany(raw){
    if(/에스엘에스|SLS/i.test(raw)) return '에스엘에스 글로벌';
    if(/바이스트|BUYEST/i.test(raw)) return '바이스트';
    return '';
  }

  function parse(rows){
    var warnings = [], meta = {ym:'', pay_date:'', company_raw:'', company:''};
    for(var i = 0; i < Math.min(rows.length, 10); i++){
      for(var c = 0; c < (rows[i] || []).length; c++){
        var s = str(rows[i][c]); if(!s) continue;
        var m;
        if(!meta.ym && (m = /(\d{4})\s*년\s*(\d{1,2})\s*월분/.exec(s))) meta.ym = m[1] + '-' + ('0'+m[2]).slice(-2);
        if(!meta.pay_date && (m = /지급일\s*:\s*(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/.exec(s))) meta.pay_date = m[1] + '-' + ('0'+m[2]).slice(-2) + '-' + ('0'+m[3]).slice(-2);
        if(!meta.company_raw && (m = /회사명\s*:\s*(.+?)\s*(\(|$)/.exec(s))) meta.company_raw = m[1].trim();
      }
    }
    meta.company = mapCompany(meta.company_raw);

    // 시트 범위가 B열부터 시작하는 경우도 있어서, '성명'이 C열(색인 2)에 오도록 모든 줄을 좌우로 맞춘다
    var h1 = -1, at = -1;
    for(i = 0; i < Math.min(rows.length, 20) && h1 < 0; i++){
      var ri = rows[i] || [];
      for(c = 0; c < ri.length; c++){ if(norm(ri[c]) === '성명'){ h1 = i; at = c; break; } }
    }
    if(h1 >= 0 && at !== 2){
      var sh = 2 - at;
      rows = rows.map(function(rw){ rw = rw || []; return sh > 0 ? new Array(sh).fill(null).concat(rw) : rw.slice(-sh); });
    }
    if(h1 < 0) return {error:'급여대장 형식이 아니에요 (성명 머리글을 찾지 못했어요)', meta:meta, records:[], warnings:warnings};

    var H = [rows[h1] || [], rows[h1+1] || [], rows[h1+2] || []].map(function(r){ return r.map(norm); });
    var sec = (rows[h1-1] || []).map(norm), dedStart = 10;
    for(c = 0; c < sec.length; c++){ if(sec[c].indexOf('공제내역') === 0){ dedStart = c; break; } }
    var lastCol = dedStart + 5;   // 공제 구역 끝(미제출비과세·공제합계·차인지급액 열)

    var records = [], expected = null, r = h1 + 3;
    while(r < rows.length){
      var row = rows[r] || [];
      var b = str(row[1]), nm = str(row[2]);
      if(/^인원/.test(norm(b))){ var mm = /(\d+)/.exec(b); if(mm) expected = +mm[1]; break; }
      var next = rows[r+1] || [];
      if(/^\d+$/.test(b) && nm && toDate(next[1])){
        var rec = {emp_no:b, name:nm, join_date:toDate(next[1]), leave_date:toDate((rows[r+2] || [])[1]),
                   title:str(next[2]), dept:str((rows[r+2] || [])[2]), status:'', pay:[], ded:[], memo:[],
                   pay_total:null, ded_total:null, net:null, note:''};
        for(var off = 0; off < 3; off++){
          var rr = rows[r+off] || [];
          for(c = 3; c <= lastCol; c++){
            var label = H[off][c], v = rr[c];
            if(!label) continue;
            if(off === 0 && c === 3 && typeof v === 'string' && v.trim() && !isNum(v)) rec.status = v.trim();
            if(!isNum(v) || v === 0) continue;
            if(label === '지급합계') rec.pay_total = v;
            else if(label === '공제합계') rec.ded_total = v;
            else if(label === '차인지급액') rec.net = v;
            else if(label === '미제출비과세' || label.indexOf('국고지원금') > -1) rec.memo.push([label, v]);
            else if(c < dedStart) rec.pay.push([label, v]);
            else rec.ded.push([label, v]);
          }
        }
        // 비고(R열 이후 문자열)
        var notes = [];
        for(off = 0; off < 3; off++){ var rr2 = rows[r+off] || []; for(c = lastCol + 2; c < rr2.length; c++){ if(typeof rr2[c] === 'string' && rr2[c].trim()) notes.push(rr2[c].trim()); } }
        rec.note = notes.join(' ');
        // 검산: 지급 합 = 지급합계, 지급합계 − 공제합계 = 차인지급액
        if(!rec.status){
          var ps = rec.pay.reduce(function(a, x){ return a + x[1]; }, 0);
          if(rec.pay_total != null && Math.abs(ps - rec.pay_total) > 1) warnings.push(nm + ': 지급항목 합(' + ps.toLocaleString() + ')이 지급합계와 달라요');
          if(rec.pay_total != null && rec.ded_total != null && rec.net != null && Math.abs(rec.pay_total - rec.ded_total - rec.net) > 1) warnings.push(nm + ': 지급합계−공제합계가 차인지급액과 달라요');
          if(rec.net == null) warnings.push(nm + ': 차인지급액을 찾지 못했어요');
        }
        records.push(rec);
        r += 3;
        continue;
      }
      r++;
    }
    if(!records.length) warnings.push('직원 내역을 하나도 찾지 못했어요');
    if(expected != null && expected !== records.length) warnings.push('시트의 "인원 : ' + expected + '"과 읽은 인원(' + records.length + '명)이 달라요');
    if(!meta.ym) warnings.push('귀속월(○○월분)을 찾지 못했어요 — 직접 골라 주세요');
    return {meta:meta, records:records, warnings:warnings, expected:expected};
  }

  var api = {parse:parse};
  if(typeof module !== 'undefined' && module.exports) module.exports = api; else root.HRPARSE = api;
})(typeof window !== 'undefined' ? window : this);
