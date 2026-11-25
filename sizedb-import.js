/* 실측데이터: 카카오톡·네이트온 대화 내보내기 파일에서 실측 기록을 뽑는다.
   브라우저에서만 읽고, 서버에는 뽑은 실측 줄만 보낸다(대화 원문은 보내지 않는다). */
(function(root){
  'use strict';

  /* ---------- 공통: 치수·품번 ---------- */
  var LAB = [['어깨','어깨'],['가슴단면','가슴'],['가슴','가슴'],['흉','가슴'],['소매길이','소매'],['소매','소매'],['팔길이','소매'],['팔','소매'],['총기장','총장'],['총장','총장'],['총길이','총장'],['기장','총장'],['총','총장'],['허리','허리'],['밑위','밑위'],['허벅지','허벅지'],['밑단','밑단'],['힙','힙'],['엉덩이','힙'],['가로','가로'],['세로','세로'],['높이','높이'],['폭','폭'],['밑창길이','밑창길이'],['발길이','밑창길이'],['둘레','둘레'],['미디','미디']];
  var MAP = {}; LAB.forEach(function(x){ MAP[x[0]] = x[1]; });
  var LABRE = LAB.map(function(x){return x[0];}).sort(function(a,b){return b.length-a.length;}).join('|');
  var PAIR = new RegExp('('+LABRE+')(?:단면)?\\s*(?:\\([^)]*\\))?\\s*[:：=\\-]?\\s*(\\d+(?:\\.\\d+)?)','g');
  var LABS = new RegExp(LABRE,'g');
  var LABS_AT_START = new RegExp('^(?:'+LABRE+')');

  function parseMeas(t){
    var m = {};
    Array.from(String(t||'').matchAll(PAIR)).forEach(function(x){
      var k = MAP[x[1]], v = parseFloat(x[2]);
      if (!(k in m) && v>0 && v<300) m[k] = v;
    });
    return m;
  }
  function normCode(s){ return String(s||'').toUpperCase().replace(/[^0-9A-Z]/g,''); }
  function splitBase(s){
    var t = String(s||'').trim().toUpperCase().split(/[\s\/_]+/).map(function(x){return x.replace(/[^0-9A-Z]/g,'');}).filter(Boolean);
    return t.length>=2 ? t.slice(0,-1).join('') : (t[0]||'');
  }

  /* ---------- 대화 파일 읽기 ---------- */
  function decode(buf){
    var b = new Uint8Array(buf);
    if (b[0]===0xFF && b[1]===0xFE) return new TextDecoder('utf-16le').decode(b);
    if (b[0]===0xFE && b[1]===0xFF) return new TextDecoder('utf-16be').decode(b);
    try { return new TextDecoder('utf-8',{fatal:true}).decode(b); }
    catch(e){
      var u = new TextDecoder('utf-8').decode(b);
      // 일부 글자만 깨진 UTF-8 파일은 그대로 UTF-8, 대부분 깨지면 옛 한글 인코딩(CP949)
      var broken = (u.match(/�/g)||[]).length;
      return broken < u.length*0.001 ? u : new TextDecoder('euc-kr').decode(b);
    }
  }
  function pad(n){ return (n<10?'0':'')+Number(n); }
  function ymd(y,m,d){ return y+'-'+pad(m)+'-'+pad(d); }
  function hm(ap,h,mi){ h = Number(h); if (ap) h = h%12 + (ap==='오후'?12:0); return pad(h)+':'+pad(mi); }

  var DATELINE = /^[-=─\s\[<]*(\d{4})\s*(?:년|\.|-|\/)\s*(\d{1,2})\s*(?:월|\.|-|\/)\s*(\d{1,2})\s*(?:일|\.)?\s*(?:\(?[월화수목금토일](?:요일)?\)?)?[-=─\s\]>]*$/;
  // 각 형식: 머리줄 정규식 → {date?, time, who, text}
  var FORMATS = [
    {name:'카카오톡 (PC)', re:/^\[(.+?)\] \[(오전|오후) (\d+):(\d+)\] ?(.*)$/,
      get:function(m){ return {who:m[1], time:hm(m[2],m[3],m[4]), text:m[5]}; }},
    {name:'카카오톡 (휴대폰)', re:/^(\d{4})년 (\d{1,2})월 (\d{1,2})일 (오전|오후) (\d{1,2}):(\d{2}), (.+?) : (.*)$/,
      get:function(m){ return {date:ymd(m[1],m[2],m[3]), time:hm(m[4],m[5],m[6]), who:m[7], text:m[8]}; }},
    {name:'카카오톡 (아이폰)', re:/^(\d{4})\. ?(\d{1,2})\. ?(\d{1,2})\.? (?:(오전|오후) )?(\d{1,2}):(\d{2}), (.+?) : (.*)$/,
      get:function(m){ return {date:ymd(m[1],m[2],m[3]), time:hm(m[4],m[5],m[6]), who:m[7], text:m[8]}; }},
    {name:'네이트온', re:/^\[?(\d{4})[-.\/](\d{1,2})[-.\/](\d{1,2})\.?\s+(?:(오전|오후)\s*)?(\d{1,2}):(\d{2})(?::\d{2})?\]?[\s,]+(.+?)\s*[:：](?:\s+(.*))?$/,
      get:function(m){ return {date:ymd(m[1],m[2],m[3]), time:hm(m[4],m[5],m[6]), who:m[7], text:m[8]||''}; }},
    {name:'네이트온', re:/^\[(.+?)\]\s*\[?(오전|오후)\s*(\d{1,2}):(\d{2})(?::\d{2})?\]?\s*(.*)$/,
      get:function(m){ return {who:m[1], time:hm(m[2],m[3],m[4]), text:m[5]}; }},
    {name:'네이트온', re:/^(.{1,30}?)\s*[\(\[](오전|오후)\s*(\d{1,2}):(\d{2})(?::\d{2})?[\)\]]\s*[:：]?\s*(.*)$/,
      get:function(m){ return {who:m[1], time:hm(m[2],m[3],m[4]), text:m[5]}; }},
    {name:'네이트온', re:/^(.{1,30}?)\s*님의 말\s*(?:[\(\[]\s*(오전|오후)?\s*(\d{1,2}):(\d{2})[^\)\]]*[\)\]])?\s*[:：]?\s*$/,
      get:function(m){ return {who:m[1], time:m[3]?hm(m[2],m[3],m[4]):'', text:''}; }}
  ];

  function csvRows(text){
    var rows=[], row=[], f='', q=false, i, c;
    for(i=0;i<text.length;i++){ c=text[i];
      if(q){ if(c==='"'){ if(text[i+1]==='"'){f+='"';i++;} else q=false; } else f+=c; }
      else if(c==='"') q=true;
      else if(c===','){ row.push(f); f=''; }
      else if(c==='\n'){ row.push(f); rows.push(row); row=[]; f=''; }
      else if(c!=='\r') f+=c;
    }
    if(f||row.length){ row.push(f); rows.push(row); }
    return rows;
  }

  function parseChat(text){
    text = String(text||'').replace(/^﻿/,'');
    if (/^"?Date"?,"?User"?,"?Message"?/.test(text)){
      var list = csvRows(text).slice(1).map(function(r){
        var m = String(r[0]||'').match(/^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d)/);
        return m ? {date:ymd(m[1],m[2],m[3]), time:m[4]+':'+m[5], who:r[1]||'', text:r[2]||''} : null;
      }).filter(Boolean);
      return {format:'카카오톡 (CSV)', messages:list};
    }
    var lines = text.split('\n').map(function(l){ return l.replace(/\r$/,''); });
    var counts = FORMATS.map(function(f){ var n=0; lines.forEach(function(l){ if(f.re.test(l)) n++; }); return n; });
    var best = 0; counts.forEach(function(n,i){ if(n>counts[best]) best=i; });
    if (counts[best] < 3) return {format:null, messages:[]};
    var F = FORMATS[best], msgs = [], cur = null, date = null, time = '00:00';
    lines.forEach(function(l){
      var d = l.match(DATELINE);
      if (d){ date = ymd(d[1],d[2],d[3]); cur = null; return; }
      var m = l.match(F.re);
      if (m){
        var x = F.get(m);
        if (x.date) date = x.date;
        if (x.time) time = x.time;
        cur = {date:date, time:time, who:x.who, text:x.text}; msgs.push(cur);
      } else if (cur) { cur.text += (cur.text ? '\n' : '') + l; }
    });
    return {format:F.name, messages:msgs.filter(function(x){ return x.date; })};
  }

  /* ---------- 요청(품번·사이즈) → 답변(실측) 연결 ---------- */
  var SZ = '(?:\\d{1,3}\\s*[AaYy세]?(?:\\s*[-~]\\s*\\d{1,3}\\s*[AaYy세]?)?|XXS|XS|S|M|L|XL|XXL|TU|FREE|FR)';
  var SZRE = new RegExp('^\\s*'+SZ+'\\s*$','i');
  var REQW = /(실측\s*사이즈|상세\s*사이즈|실측|사이즈|상세|확인|부탁\s*(?:드립니다|드려요|드립니당|해요|해|행|합니다|드려용)?|해주세요|해줘|가능할까|가능하신가요|있으면|있는거|매장|본사)[!.^~ㅠㅜ?\s]*/gi;
  var KEYNOTE = /기모|로고|안감|모자|탈부착|밴딩|스판|A라인|나그랑|재봉|인밴드|탈착|후드|케어라벨/;
  var SIZE_PREFIX = new RegExp('^[\\[\\(]?\\s*('+SZ+')\\s*[\\]\\)]?\\s*(?:사이즈)?\\s*[:：\\-]?\\s*(?=(?:'+LABRE+'))','i');
  var CODE_SIZE = new RegExp('^(.*\\d.*?)_('+SZ+')$','i');

  function isMeasLine(l){ PAIR.lastIndex = 0; var r = PAIR.test(l); PAIR.lastIndex = 0; return r; }
  function labsOf(s){ return s.match(LABS) || []; }
  function sizesFrom(txt){
    return txt.trim().split(/[,，\/\s]+/).map(function(t){ return t.replace(/^[()\[\]]+|[()\[\]]+$/g,''); })
      .filter(function(t){ return t && SZRE.test(t); }).map(function(t){ return t.replace(/ /g,'').toUpperCase(); });
  }
  function parseCodeLine(l){
    var s = l.replace(REQW,' ').replace(/[!^~ㅠㅜ?]+/g,'').trim();
    if (!s) return null;
    var sizes = [];
    var mb = s.match(/((?:\s*[\(\[][^\)\]]*[\)\]])+)\s*$/);
    if (mb){
      Array.from(mb[1].matchAll(/[\(\[]([^\)\]]*)[\)\]]/g)).forEach(function(g){ sizes = sizes.concat(sizesFrom(g[1])); });
      s = s.slice(0, mb.index).trim();
    }
    if (s.indexOf('/')>=0){
      var parts = s.split('/').map(function(p){return p.trim();});
      s = parts[0];
      parts.slice(1).forEach(function(p){ sizes = sizes.concat(sizesFrom(p)); });
    }
    var mu = s.match(CODE_SIZE);
    if (mu && normCode(mu[1]).length>=5){ s = mu[1]; sizes.push(mu[2].toUpperCase()); }
    if (/[가-힣]/.test(s)) return null;
    var c = normCode(s);
    if (c.length<5 || (c.match(/\d/g)||[]).length<3) return null;
    return {code:s.toUpperCase().replace(/\s+/g,' '), sizes:sizes};
  }
  function absT(m){
    var d = m.date.split('-').map(Number), t = m.time.split(':').map(Number);
    return Date.UTC(d[0], d[1]-1, d[2], t[0], t[1]);
  }
  function skeyChat(s){ return s ? s.toUpperCase().replace(/[AY세]$/,'') : s; }

  function extract(messages, source){
    var recs = [], pending = [];
    function finished(r){ return r.sizes.length ? r.sizes.every(function(s){return r.done.has(s);}) : r.done.size>0; }
    function alive(r,t){ return (t-r.t) <= 90*60*1000 && !finished(r); }
    function takeSize(req,size){
      var i;
      if (size){
        var k = skeyChat(size);
        for(i=0;i<req.sizes.length;i++) if (skeyChat(req.sizes[i])===k){ req.done.add(req.sizes[i]); return req.sizes[i]; }
        req.done.add(size); return size;
      }
      for(i=0;i<req.sizes.length;i++) if (!req.done.has(req.sizes[i])){ req.done.add(req.sizes[i]); return req.sizes[i]; }
      req.done.add(''); return '';
    }
    function emit(req,size,lines,m,conf){
      var meas = parseMeas(lines.join(' '));
      if (!Object.keys(meas).length) return;
      var raw = lines.filter(isMeasLine).map(function(x){return x.trim();}).join(' ').trim();
      var note = lines.filter(function(x){ return !isMeasLine(x) && KEYNOTE.test(x); }).map(function(x){return x.trim();}).join(' ');
      recs.push({code:req.code, size:size||'', meas:meas, raw:raw, note:note, src:source, date:m.date, conf:conf});
    }

    messages.forEach(function(m){
      var txt = m.text;
      if (txt.indexOf('삭제되었습니다')>=0 && txt.length<30) return;
      var t = absT(m), lines = txt.split('\n');
      var hasreq = /실측|상세\s*사이즈|사이즈|치수/.test(txt);
      var hasmeas = lines.some(isMeasLine);
      if (!hasreq && !hasmeas) return;
      pending = pending.filter(function(r){ return alive(r,t); });

      var seq = [];
      lines.forEach(function(l){
        var ls = l.trim(); if (!ls) return;
        if (isMeasLine(ls)){
          var mm = ls.match(SIZE_PREFIX);
          if (mm && !LABS_AT_START.test(ls)) seq.push({t:'size', v:mm[1].replace(/ /g,'').toUpperCase(), rest:ls.slice(mm[0].length)});
          else seq.push({t:'meas', v:ls});
          return;
        }
        var bare = ls.replace(/[\[\]\(\):\s]|사이즈/g,'');
        if (hasmeas && ls.length<12 && SZRE.test(bare)){ seq.push({t:'size', v:bare.toUpperCase(), rest:null}); return; }
        var pc = parseCodeLine(ls);
        if (pc) seq.push({t:'code', v:pc.code, sizes:pc.sizes});
        else if (hasmeas && ls.length<40) seq.push({t:'note', v:ls});
      });

      var newreqs = [], groups = [];
      var st = {req:null, size:null, lines:[], labs:new Set()};
      function push(){
        if (st.lines.length) groups.push({req:st.req, size:st.size, lines:st.lines});
        st.lines = []; st.labs = new Set(); st.size = null;
      }
      seq.forEach(function(it){
        if (it.t==='code'){
          push();
          var r = {code:it.v, sizes:it.sizes.slice(), done:new Set(), t:t};
          st.req = r; newreqs.push(r);
        } else if (it.t==='size'){
          if (st.lines.length) push();
          st.size = it.v;
          if (it.rest){ st.lines.push(it.rest); labsOf(it.rest).forEach(function(x){st.labs.add(x);}); }
        } else if (it.t==='meas'){
          var labs = labsOf(it.v);
          if (st.lines.length && labs.some(function(x){return st.labs.has(x);})) push();
          st.lines.push(it.v); labs.forEach(function(x){st.labs.add(x);});
        } else if (st.lines.length) st.lines.push(it.v);
      });
      push();

      // 요청만 있는 메시지: 사이즈만 적힌 줄은 마지막 품번 요청에 붙인다
      if (newreqs.length && !hasmeas){
        lines.forEach(function(l){
          var ls = l.trim().replace(/(실측|상세|사이즈|부탁|드립니다|확인|해|!|\.)/g,'');
          if (ls && !parseCodeLine(l) && /^[\p{L}\p{N}_,\s\[\]\(\)\-~]+$/u.test(ls)){
            var toks = sizesFrom(ls);
            if (toks.length && toks.length >= ls.split(/[,\s]+/).filter(Boolean).length){
              var last = newreqs[newreqs.length-1]; last.sizes = last.sizes.concat(toks);
            }
          }
        });
      }

      groups.forEach(function(g){
        var req = g.req, conf = 'high';
        if (!req){
          var cand = pending.filter(function(r){ return alive(r,t); });
          if (!cand.length) return;
          req = cand[0]; if (cand.length>1) conf = 'mid';
        }
        emit(req, takeSize(req,g.size), g.lines, m, conf);
      });
      newreqs.forEach(function(r){ if (!finished(r)) pending.push(r); });
    });
    return recs;
  }

  /* ---------- DB 형식으로 정리 ---------- */
  var BAD = /아니냐|문의|개 찾|주면|오셨|고객|입니다만/;
  var SHAPE = ['가로','세로','높이','밑창길이','폭','둘레'];
  var PHONE = /01[016789][-. ]?\d{3,4}[-. ]?\d{4}/g;

  function recKey(r){
    var meas = r[3];
    return normCode(r[1])+'|'+String(r[2]||'').toUpperCase().replace(/[AY세]$/,'')+'|'+
      Object.keys(meas).sort().map(function(k){ return k+'='+Number(meas[k]); }).join(',');
  }
  // existing: [[brand,code,size,meas,...]] → {fresh:[], found:n, dup:n}
  function toRecords(extracted, existing){
    var brand = {}, seen = {};
    existing.forEach(function(r){ seen[recKey(r)] = 1; if (r[0]) brand[splitBase(r[1])] = r[0]; });
    var fresh = [], found = 0, dup = 0;
    extracted.forEach(function(c){
      var keys = Object.keys(c.meas);
      if (BAD.test(c.raw)) return;
      if (keys.length<2 && !keys.some(function(k){return SHAPE.indexOf(k)>=0;})) return;
      found++;
      var r = [brand[splitBase(c.code)]||'', c.code, c.size.toUpperCase(), c.meas,
        c.raw.replace(PHONE,'').slice(0,300), c.note.replace(PHONE,'').slice(0,200), c.src, c.date, c.conf];
      var k = recKey(r);
      if (seen[k]){ dup++; return; }
      seen[k] = 1; fresh.push(r);
    });
    return {fresh:fresh, found:found, dup:dup};
  }

  var api = {decode:decode, parseChat:parseChat, extract:extract, toRecords:toRecords, recKey:recKey};
  if (typeof module!=='undefined' && module.exports) module.exports = api;
  else root.SizeImport = api;
})(this);
