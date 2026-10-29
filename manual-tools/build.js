/* 툴킷 교육자료 생성기 (사이트에는 올라가지 않는 로컬 도구)
   사용:  cd manual-tools && npm install && node build.js shots   → ../manual-shots/*.png 화면 캡처
          node build.js pdf                                      → ../BUYEST-툴킷-교육자료.pdf
   manual-data.js 를 고친 뒤에는 pdf 를 다시 만들어 주세요. */
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');
const ROOT = path.resolve(__dirname, '..');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.png':'image/png', '.woff2':'font/woff2', '.svg':'image/svg+xml', '.mjs':'text/javascript' };

function serve(port) {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); return rsp.end('no'); }
      rsp.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rsp);
    }).listen(port, () => res(srv));
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function shots(browser, base) {
  const data = {}; global.window = data; require(path.join(ROOT, 'manual-data.js'));
  const ids = data.TOOLKIT_MANUALS.items.map(i => i.id).filter(id => id !== 'dashboard');
  fs.mkdirSync(path.join(ROOT, 'manual-shots'), { recursive: true });
  for (const id of ids) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1100, height: 700, deviceScaleFactor: 1.6 });
    // 서버로 나가는 요청은 막는다(캡처용 화면일 뿐, 실제 로그인·저장이 일어나면 안 됨)
    await page.setRequestInterception(true);
    page.on('request', r => { const u = r.url(); if (u.startsWith(base) || u.startsWith('data:') || u.startsWith('blob:')) r.continue(); else r.abort(); });
    await page.evaluateOnNewDocument(() => {
      try { localStorage.setItem('buyest.dash.auth', JSON.stringify({ id: 'sample', pass: '', role: 'staff' })); localStorage.setItem('buyest.dash.skip', '1'); } catch (e) {}
    });
    await page.goto(base + '/index.html#' + id, { waitUntil: 'load' });
    await sleep(2500);
    await page.evaluate(() => { const b = document.getElementById('bootSplash'); if (b) b.remove(); });
    // 서버에 못 붙어서 오류 문구가 뜬 화면은 교육자료에 넣지 않는다(실제와 다르게 보이므로)
    let txt = ""; for (const f of page.frames()) { try { txt += await f.evaluate(() => document.body ? document.body.innerText : ""); } catch (e) {} }
    const bad = /연결할 수 없|불러오지 못|서버 오류|로그인한 직원만|로그인 후|로그인해|툴킷에 로그인|실패했/.test(txt.split("사용 설명서").pop());
    const fp = path.join(ROOT, "manual-shots", id + ".png");
    if (bad) { try { fs.unlinkSync(fp); } catch (e) {} console.log("SKIP(오류 문구)", id); await page.close(); continue; }
    await page.screenshot({ path: fp, clip: { x: 264, y: 0, width: 836, height: 470 } });
    console.log('shot', id);
    await page.close();
  }
}

async function pdf(browser, base) {
  const data = {}; global.window = data; require(path.join(ROOT, 'manual-data.js'));
  const out = path.join(ROOT, 'BUYEST-툴킷-교육자료.pdf');
  const mk = async (pages) => {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(p => { window.__pages = p; }, pages || {});
    await page.goto(base + '/manual.html', { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    await sleep(500);
    return page;
  };
  const opts = {
    path: out, format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: '<div style="width:100%;font-size:8px;color:#777;display:flex;justify-content:space-between;padding:0 14mm;font-family:sans-serif"><span>BUYEST Toolkit 사용 교육자료</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
    margin: { top: '16mm', bottom: '18mm', left: '14mm', right: '14mm' }
  };
  // 1차: 쪽수 파악용
  let page = await mk();
  await page.pdf({ ...opts, path: out });
  await page.close();
  // 각 섹션이 몇 쪽에서 시작하는지 PDF 텍스트로 찾는다
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs').catch(() => null);
  let pages = {};
  if (pdfjs) {
    const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(out)), useSystemFonts: true }).promise;
    const texts = [];
    for (let i = 1; i <= doc.numPages; i++) { const t = await (await doc.getPage(i)).getTextContent(); texts.push(t.items.map(x => x.str).join('').replace(/\s+/g, '')); }
    const M = data.TOOLKIT_MANUALS;
    const find = (needle, from) => { const n = needle.replace(/\s+/g, ''); for (let i = from; i < texts.length; i++) if (texts[i].includes(n)) return i; return -1; };
    const marks = { s0: '1부·시작하기', s1: '화면읽는법', s2: '모든메뉴에공통인약속', s3: '이럴땐이메뉴', s4: '용어사전', s9: '자주묻는질문' };
    let from = 2;
    for (const [k, v] of Object.entries(marks)) { const i = find(v, from); if (i >= 0) { pages[k] = i + 1; from = i; } }
    from = Math.max(from, 5);
    // 메뉴별: 3~4번째 페이지 이후 "그룹명+제목+사용가능/시험판" 머리 부분으로 찾음
    let cur = (pages.s4 || 6);
    for (const it of M.items.filter(i => i.id !== 'dashboard')) {
      const head = (M.groups.find(g => g.id === it.g).name + it.title).replace(/\s+/g, '');
      const i = find(head, cur);
      if (i >= 0) { pages['m-' + it.id] = i + 1; cur = i; }
    }
    page = await mk(pages);
    await page.pdf({ ...opts, path: out });
    await page.close();
  }
  console.log('pdf done', out, 'pages mapped:', Object.keys(pages).length);
}

(async () => {
  const mode = process.argv[2] || 'pdf';
  const srv = await serve(8765);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--font-render-hinting=none'] });
  try {
    if (mode === 'shots') await shots(browser, 'http://localhost:8765');
    else await pdf(browser, 'http://localhost:8765');
  } finally { await browser.close(); srv.close(); }
})().catch(e => { console.error(e); process.exit(1); });
