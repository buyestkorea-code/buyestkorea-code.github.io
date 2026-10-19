// BUYEST 사진 자동 찾기 — Cloudflare Worker (v2)
// GET /find?code=품번[&color=컬러][&stage=1|2]  → 1차(파트너 사이트 직접 조회) → 2차(구글 검색)로 '품번이 같은 상품' 사진 URL 반환
// GET /img?u=사진URL                          → 사진 중계 (브라우저 CORS 회피, zip 저장용)
// GET /health
// 비밀값: SERPER_KEY (wrangler secret put SERPER_KEY) — 코드·저장소·채팅에 키를 적지 말 것.
// 제약: 무료 플랜은 요청 1건당 외부 호출 50회·CPU 10ms → 외부 호출은 BUDGET 이하로 세고, 큰 HTML은 정규식으로만 훑는다(DOM 파싱 안 함).

const ALLOWED_ORIGINS = ['https://buyestkorea-code.github.io'];
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const BUDGET = 44;          // 요청 1건당 외부 호출 상한(무료 플랜 50회 미만)
const FETCH_TIMEOUT = 9000; // 외부 사이트 한 번 기다리는 최대 시간(ms)

// 2차 검색에서 제외: 한국 사이트·개인 판매자 마켓·SNS·검색엔진·위키 등
const BLOCK_WORDS = /(naver|coupang|11st|gmarket|auction\.co|danawa|kream|musinsa|29cm|wconcept|ssfshop|lotte|shinsegae|buyma|amazon|ebay|aliexpress|temu|etsy|poshmark|depop|vestiaire|pinterest|facebook|instagram|youtube|tiktok|reddit|twitter|wikipedia|alibaba|dhgate|taobao|rakuten|rakuma|fril|mercari|yahoo|shopee|lyst|grailed|buyest|feelway|xiaohongshu|tmall|qoo10|carousell|wish\.com|trenbe\.kr)/i;
const BLOCK_EXACT = new Set(['x.com', 't.co']);
// 브랜드 공식몰(공식 사진은 쓰지 않음)
const OFFICIAL = /(^|\.)(gucci|prada|saintlaurent|ysl|burberry|moncler|stoneisland|canadagoose|dolcegabbana|versace|fendi|balenciaga|bottegaveneta|loewe|dior|chanel|hermes|louisvuitton|givenchy|valentino|ferragamo|tods|furla|armani|msgm|moschino|golden-goose|goldengoose|palmangels|off---white|maisonmargiela|jilsander|acnestudios|maxmara|marni|miumiu|etro|lanvin|celine|apc|ganni|stellamccartney|viviennewestwood|nike|adidas|newbalance|puma|asics|converse|vans|ugg|birkenstock|gfore|herno|amiparis|isabelmarant|pucci|isseymiyake|mcmworldwide|thombrowne|chloe|tory-?burch|toryburch|kongessloejd|kongesslojd)\./i;
// 1차 출처(결과에 이 도메인이 있으면 우선)
const PREFERRED = ['cettire.com', 'vitkac.com', 'thedoublef.com', 'biffi.com', 'the-fashion-square.com'];

const norm = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dedupe = (a) => [...new Set(a)];
const blockedHost = (h) => !h || BLOCK_EXACT.has(h) || /\.kr$/.test(h) || BLOCK_WORDS.test(h);

/* ---------- 접근 제한 (A) ---------- */
function corsFor(req) {
  const o = req.headers.get('Origin') || '';
  if (!(ALLOWED_ORIGINS.includes(o) || LOCAL_ORIGIN.test(o))) return null;
  return { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' };
}
const json = (o, status, cors) => new Response(JSON.stringify(o), { status: status || 200, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors } });

export default {
  async fetch(req, env) {
    const cors = corsFor(req);
    if (!cors) return new Response('forbidden', { status: 403 }); // 허용된 사이트(툴킷)가 아니면 구글 검색 한도·사진 중계를 쓰지 못하게 막는다
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(req.url);
    try {
      if (url.pathname === '/health') return json({ ok: true, serper: !!env.SERPER_KEY, v: 2 }, 200, cors);
      if (url.pathname === '/img') return await proxyImage(url.searchParams.get('u'), cors);
      if (url.pathname === '/find') return json(await find(url.searchParams.get('code') || '', url.searchParams.get('color') || '', env, url.searchParams.get('stage') || '', url.searchParams.get('debug') === '1'), 200, cors);
      return json({ error: 'not found' }, 404, cors);
    } catch (e) {
      return json({ status: 'error', reason: String((e && e.message) || e) }, 500, cors);
    }
  },
};

/* ---------- 외부 호출(횟수·시간 제한) ---------- */
class Ctx {
  constructor(env) { this.env = env; this.n = 0; }
  async fetch(url, opt = {}) {
    if (++this.n > BUDGET) throw new Error('외부 호출 한도(요청당 ' + BUDGET + '회)에 도달');
    return fetch(url, { ...opt, headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', ...(opt.headers || {}) }, redirect: 'follow', signal: AbortSignal.timeout(FETCH_TIMEOUT) });
  }
  async text(url, retry429 = true) {
    for (let i = 0; i < 2; i++) {
      try {
        const r = await this.fetch(url);
        if (r.status === 429 && retry429 && i === 0) { await sleep(2000); continue; }
        if (!r.ok) return null;
        return (await r.text()).slice(0, 700000);
      } catch (e) { if (/한도/.test(e.message)) throw e; return null; }
    }
    return null;
  }
  async json(url, opt) {
    for (let i = 0; i < 2; i++) {
      try {
        const r = await this.fetch(url, opt);
        if (r.status === 429 && i === 0) { await sleep(2000); continue; }
        if (!r.ok) return null;
        return await r.json();
      } catch (e) { if (/한도/.test(e.message)) throw e; return null; }
    }
    return null;
  }
}

/* ---------- 품번 분해 (C) ---------- */
// "GMH000145 PUMICE"처럼 끝이 컬러 이름이면 컬러로 떼어낸다. 컬러 열이 따로 오면 그걸 쓴다.
function parse(code, colorArg) {
  const tokens = String(code).trim().split(/\s+/).filter(Boolean);
  let color = String(colorArg || '').trim();
  const last = tokens[tokens.length - 1] || '';
  if (!color && tokens.length >= 2 && /^[A-Za-z][A-Za-z/]{2,}$/.test(last)) color = tokens.pop();
  const colorWords = color ? color.toUpperCase().split(/[/\s,]+/).filter((w) => w.length >= 3) : [];
  const colorIsName = colorWords.length > 0 && !/\d/.test(color);
  const model = norm(tokens.join(''));
  // 컬러 이름이 아니면 컬러도 품번의 일부(컬러코드)다
  const full = colorIsName ? model : norm(tokens.join('') + color);
  const splitLast = !colorIsName && tokens.length >= 2 && !color;
  const modelQ = splitLast ? norm(tokens.slice(0, -1).join('')) : model; // 1차 사이트 검색용 '모델 부분'
  const rawModel = splitLast ? tokens.slice(0, -1).join(' ') : tokens.join(' ');
  return { raw: String(code).trim(), tokens, color, colorWords, colorIsName, model, full, modelQ, rawModel, first: norm(tokens[0] || '') };
}
// 숫자만으로 된 짧은 품번은 우연히 겹치기 쉽다 → 결과를 '직접 확인'으로만 낸다
const isWeak = (p) => !p.colorIsName && !/[A-Z]/.test(p.full) && p.full.length < 10;

// 정규화된 텍스트(n)에서 판정: exact(전체 일치) / name(모델+컬러명 일치) / partial(모델만)
function judge(p, n) {
  if (p.colorIsName) {
    if (!n.includes(p.model)) return null;
    return p.colorWords.some((w) => n.includes(w)) ? 'name' : 'partial';
  }
  if (n.includes(p.full)) return 'exact';
  return n.includes(p.modelQ) ? 'partial' : null;
}
// 본문(원문 HTML)에서 구분자만 다르게 적힌 품번 찾기 — 큰 문자열을 통째로 바꾸지 않고 정규식으로만 훑어 CPU를 아낀다
const SEP = '[\\s.\\-_/]{0,2}';
function bodyRegex(s) { return new RegExp(s.split('').map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(SEP), 'i'); }
function judgeBody(p, html) {
  if (p.colorIsName) {
    if (!bodyRegex(p.model).test(html)) return null;
    return p.colorWords.some((w) => new RegExp(w, 'i').test(html)) ? 'name' : 'partial';
  }
  return bodyRegex(p.full).test(html) ? 'exact' : null;
}

/* ---------- 공통 추출 ---------- */
const absUrl = (x, base) => { try { return new URL(x, base).toString(); } catch { return ''; } };
const decode = (s) => String(s || '').replace(/&apos;|&#39;|&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&ndash;/g, '–');
function meta(html, prop) {
  const out = [];
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    if (!new RegExp('(?:property|name)=["\']' + prop + '["\']', 'i').test(tag)) continue;
    const c = tag.match(/content=["']([^"']*)["']/i);
    if (c) out.push(decode(c[1]));
  }
  return out;
}
const titleOf = (html) => decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ''])[1].replace(/\s+/g, ' ').trim());
function findProduct(o) {
  if (!o) return null;
  if (Array.isArray(o)) { for (const x of o) { const p = findProduct(x); if (p) return p; } return null; }
  if (typeof o !== 'object') return null;
  const t = [].concat(o['@type'] || []);
  if (t.includes('Product') || t.includes('ProductGroup')) return o;
  if (o['@graph']) return findProduct(o['@graph']);
  return null;
}
function ldProduct(html) {
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const p = findProduct(JSON.parse(m[1].trim())); if (p) return p; } catch { /* 다음 블록 */ }
  }
  return null;
}
function ldImages(prod, base) {
  if (!prod) return [];
  return [].concat(prod.image || []).map((x) => (typeof x === 'string' ? x : x && (x.url || x.contentUrl))).filter(Boolean).map((u) => absUrl(u, base)).filter(Boolean);
}
// 같은 사진이 프로토콜·?v= 등만 다르게 중복되는 것을 하나로 합친다
function uniqImages(list) {
  const m = new Map();
  for (const u of list) { const k = u.replace(/^https?:\/\//, '').replace(/[?#].*$/, ''); if (!m.has(k)) m.set(k, u.replace(/^http:\/\//, 'https://')); }
  return [...m.values()];
}

/* ---------- 1차: 파트너 사이트 직접 조회 (B) ---------- */
async function shopify(ctx, p, base, label) {
  const cands = new Map();
  for (const q of dedupe([p.full, p.modelQ])) {
    const j = await ctx.json(`${base}/search/suggest.json?q=${encodeURIComponent(q)}&resources[type]=product&resources[limit]=8`);
    await sleep(300);
    for (const x of j?.resources?.results?.products || []) cands.set(x.handle, x);
    if (cands.size) break;
  }
  let partial = null, tries = 0;
  for (const [h, x] of cands) {
    if (!norm(h + x.title).includes(p.modelQ) || tries >= 3) continue;
    tries++;
    const pj = (await ctx.json(`${base}/products/${h}.json`))?.product;
    await sleep(300);
    if (!pj) continue;
    const tags = Array.isArray(pj.tags) ? pj.tags.join(' ') : pj.tags || '';
    const lv = judge(p, norm(pj.variants.map((v) => v.sku || '').join(' ') + ' ' + tags + ' ' + h));
    const rec = { source: label, page: `${base}/products/${h}`, name: pj.title, match: lv, images: pj.images.map((i) => i.src), primary: true };
    if (lv === 'exact' || lv === 'name') return { hit: rec };
    if (lv === 'partial' && !partial) partial = rec;
  }
  return { partial };
}

async function cettire(ctx, p) {
  let partial = null;
  for (const q of dedupe([p.modelQ, p.first])) {
    const j = await ctx.json('https://search.cettire.com/search-ai/pro-search/api/aiRecommendForProduct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': 'Vh7tW03Y9qLJ5udg1oTNsAmQcXr2vZbK', Origin: 'https://www.cettire.com' },
      body: JSON.stringify({ countryCode: 'US', regionCode: 'us', currencyCode: 'USD', langCode: 'en', productQueryInfo: { query: q, pageSize: 10, currentPage: 0 } }),
    });
    await sleep(300);
    for (const x of j?.products || []) {
      const v = x.variantData || x;
      const m = norm(v.designerModelNumber || ''), c = norm(v.designerColor || '');
      if (!m) continue;
      const page = `https://www.cettire.com/products/${v.handle}`;
      const exact = !p.colorIsName && p.full === m + c;
      const named = p.colorIsName && m === p.model && p.colorWords.some((w) => norm(v.Color || v.designerColor || '').includes(w));
      if (!exact && !named) { if ((m === p.modelQ || m === p.model) && !partial) partial = { source: 'Cettire', page, name: v.title, match: 'partial', images: [] }; continue; }
      // 상품 페이지는 보통 봇 차단(403)이라 검색 응답의 사진(약 400px)을 쓴다. 더 큰 사진은 2차에서 따로 찾는다
      const imgs = dedupe([v.largeImage, ...(Array.isArray(v.product_images) ? v.product_images : []), v.image_set2_url, v.set3_medium, v.media_medium].filter((u) => typeof u === 'string' && u.startsWith('http')));
      return { hit: { source: 'Cettire', page, name: v.title, match: exact ? 'exact' : 'name', images: imgs, primary: true, lowres: true } };
    }
  }
  return { partial };
}

async function sitePages(ctx, p, searchTpl, linkRe, prefix) {
  const seen = [];
  const queries = dedupe([p.rawModel + (p.colorIsName ? '' : ''), p.raw, p.first]);
  outer: for (const g of ['women', 'men']) for (const q of queries.slice(0, 2)) {
    const html = await ctx.text(searchTpl.replace(/\{g\}/g, g).replace('{q}', encodeURIComponent(q)));
    await sleep(300);
    if (!html) continue;
    for (const m of html.matchAll(linkRe)) { const u = absUrl(m[1], prefix); if (u && !seen.includes(u)) seen.push(u); }
    if (seen.length) break outer;
  }
  return seen.slice(0, 3);
}
async function vitkac(ctx, p) {
  for (const u of await sitePages(ctx, p, 'https://www.vitkac.com/us/shop/{g}?q={q}', /href="(\/us\/p\/[^"#?]+)/g, 'https://www.vitkac.com')) {
    const html = await ctx.text(u); await sleep(300);
    if (!html || judgeBody(p, html) !== 'exact') continue;
    const og = meta(html, 'og:image').map((x) => absUrl(x, u)).filter(Boolean);
    // 목록용 작은 사진(/lg/)을 원본 경로(/up/)로 바꾼다. 안 열리면 화면이 작은 사진으로 대신한다
    return { hit: { source: 'Vitkac', page: u, name: titleOf(html), match: 'exact', images: dedupe(og).map((x) => x.replace('/lg/', '/up/')), alts: Object.fromEntries(dedupe(og).map((x) => [x.replace('/lg/', '/up/'), x])), primary: true } };
  }
  return {};
}
async function fashionSquare(ctx, p) {
  for (const u of await sitePages(ctx, p, 'https://the-fashion-square.com/us/en/search/{g}?q={q}&page=1&view=80', /href="(\/us\/en\/(?:women|men)\/[^"]+\/p\/[^"]+)"/g, 'https://the-fashion-square.com')) {
    const html = await ctx.text(u); await sleep(300);
    if (!html || judgeBody(p, html) !== 'exact') continue;
    let imgs = ldImages(ldProduct(html), u);
    if (!imgs.length) imgs = meta(html, 'og:image').map((x) => absUrl(x, u)).filter(Boolean);
    return { hit: { source: 'Fashion Square', page: u, name: titleOf(html), match: 'exact', images: uniqImages(imgs), primary: true } };
  }
  return {};
}

async function stage1(ctx, p) {
  const steps = [['Cettire', () => cettire(ctx, p)], ['Vitkac', () => vitkac(ctx, p)],
    ['TheDoubleF', () => shopify(ctx, p, 'https://www.thedoublef.com/en-eu', 'TheDoubleF')],
    ['Biffi', () => shopify(ctx, p, 'https://www.biffi.com/en-us', 'Biffi')],
    ['Fashion Square', () => fashionSquare(ctx, p)]];
  const partials = [];
  for (const [name, fn] of steps) {
    try {
      const r = await fn();
      if (r.hit) return { hit: r.hit, partials };
      if (r.partial) partials.push({ source: r.partial.source, page: r.partial.page, name: r.partial.name });
    } catch (e) { if (/한도/.test(e.message)) break; /* 이 사이트만 건너뜀 */ }
  }
  return { partials };
}

/* ---------- 2차: 구글 검색(Serper) ---------- */
async function stage2(ctx, p) {
  const key = ctx.env.SERPER_KEY;
  if (!key) return { error: 'SERPER_KEY 미설정' };
  // 품번을 적는 방식이 사이트마다 달라서(공백·붙여쓰기) 검색어를 몇 가지로 바꿔 본다
  const joined = p.tokens.join('');
  const queries = dedupe([`"${p.raw}"`, p.tokens.length > 1 ? `"${joined}"` : '', `"${p.rawModel}"` + (p.color ? ' ' + p.color : '')].filter(Boolean));
  const cands = [];
  const seen = new Set();
  let qn = 0;
  for (const q of queries) {
    if (qn >= 3) break; qn++;
    const r = await ctx.fetch('https://google.serper.dev/search', { method: 'POST', headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ q, num: 10, gl: 'us', hl: 'en' }) });
    if (!r.ok) return { error: 'Serper ' + r.status };
    const d = await r.json();
    for (const it of d.organic || []) {
      const h = hostOf(it.link);
      if (!h || seen.has(it.link)) continue;
      seen.add(it.link);
      if (blockedHost(h) || OFFICIAL.test(h) || /[가-힣]/.test(it.title || '')) continue;
      // 검색 결과 제목·요약·주소에 모델 품번이 들어있는 것만 열어 본다
      const hay0 = norm(it.link + (it.title || '') + (it.snippet || ''));
      if (!hay0.includes(p.modelQ) && !hay0.includes(p.model) && !(p.first.length >= 7 && hay0.includes(p.first))) continue;
      cands.push({ link: it.link, host: h, pref: PREFERRED.some((x) => h.endsWith(x)) ? 0 : 1 });
    }
    if (cands.length >= 3) break;
  }
  cands.sort((a, b) => a.pref - b.pref);
  const found = [], partials = [], log = [];
  let checked = 0;
  for (const c of cands.slice(0, 8)) {
    if (checked >= 6 || found.length >= 3) break;
    checked++;
    await sleep(300);
    const html = await ctx.text(c.link, false);
    if (!html) { log.push([c.link.slice(0, 90), '열리지 않음']); continue; }
    // 상품 한 개를 소개하는 페이지만 인정 (목록·영상·게시글 제외)
    const prod = ldProduct(html);
    const isProduct = !!prod || meta(html, 'og:type').some((t) => /product/i.test(t));
    if (!isProduct) { log.push([c.link.slice(0, 90), '상품 페이지 아님']); continue; }
    const ids = [c.link, titleOf(html), ...meta(html, 'og:title'), ...meta(html, 'description'), ...meta(html, 'og:description')];
    if (prod) { const offers = [].concat(prod.offers || []); ids.push(prod.sku, prod.mpn, prod.productID, prod.model, prod.name, String(prod.description || '').slice(0, 600), ...offers.map((o) => o && o.sku)); }
    let lv = judge(p, norm(ids.filter(Boolean).join(' ')));
    // 제목·메타에 없으면 본문에서 확인한다. 숫자만 짧은 품번과 컬러명 품번은 제외(컬러명이 본문 어딘가에만 있으면 다른 색 상품일 수 있다)
    if ((!lv || lv === 'partial') && !isWeak(p) && !p.colorIsName) lv = judgeBody(p, html) || lv;
    if (!lv || lv === 'partial') { log.push([c.link.slice(0, 90), lv || '품번 없음']); if (lv === 'partial') partials.push({ source: c.host, page: c.link, name: titleOf(html).slice(0, 100) }); continue; }
    if (isWeak(p) && !norm(c.link + titleOf(html) + (prod ? JSON.stringify(prod).slice(0, 4000) : '')).includes(p.full)) continue;
    const images = uniqImages([...ldImages(prod, c.link), ...meta(html, 'og:image').map((x) => absUrl(x, c.link)).filter(Boolean)]).slice(0, 8);
    if (!images.length) continue;
    found.push({ source: c.host, page: c.link, name: decode(prod?.name || titleOf(html)).slice(0, 120), match: lv, images, primary: c.pref === 0 });
  }
  found.sort((a, b) => (a.match === 'exact' ? 0 : 1) - (b.match === 'exact' ? 0 : 1) || (a.primary ? 0 : 1) - (b.primary ? 0 : 1));
  return { found, partials, checked, log, cands: cands.map((c) => c.link.slice(0, 90)) };
}

/* ---------- 합치기 ---------- */
async function find(code, color, env, stage, debug) {
  const p = parse(code, color);
  if (/^(MODEL|BRAND|TOTAL|SIZE|COLOR|COLOUR|ITEM|STYLE|CODE|NAME|QTY|PRICE|UNIT|INVOICE)$/.test(p.model)) return { status: 'skip', reason: '머리글 단어라 조회하지 않음' };
  if (p.model.length < 5) return { status: 'skip', reason: '품번이 5자 미만이라 조회하지 않음' };
  const ctx = new Ctx(env);
  const out = { parsed: { model: p.model, color: p.color, colorIsName: p.colorIsName } };
  let s1 = {}, s2 = {};
  try {
    if (stage !== '2') s1 = await stage1(ctx, p);
    const need2 = stage !== '1' && (!s1.hit || s1.hit.lowres);
    if (need2) s2 = await stage2(ctx, p);
  } catch (e) { return { status: 'error', reason: String((e && e.message) || e) }; }
  if (s2.error && !s1.hit) return { status: 'error', reason: s2.error };

  const list = [];
  for (const f of s2.found || []) list.push({ ...f, stage: 2 });
  if (s1.hit) list.push({ ...s1.hit, stage: 1 }); // Cettire처럼 사진이 작은 1차 결과는 큰 사진을 찾은 2차 결과 뒤(보조)로 간다
  const rank = (x) => (x.match === 'exact' ? 0 : 1) * 2 + (x.lowres ? 1 : 0);
  list.sort((a, b) => rank(a) - rank(b) || (a.primary ? 0 : 1) - (b.primary ? 0 : 1));
  const partials = [...(s1.partials || []), ...(s2.partials || [])].slice(0, 3);
  if (!list.length) return { ...out, status: 'none', checked: (s2.checked || 0), partials, calls: ctx.n, ...(debug ? { log: s2.log, cands: s2.cands } : {}) };
  const best = list[0];
  let status = best.match === 'exact' ? 'exact' : 'color';
  if (isWeak(p) && status === 'exact') status = 'verify';
  return { ...out, status, best, others: list.slice(1, 3), partials, calls: ctx.n };
}

/* ---------- 이미지 중계 ---------- */
async function proxyImage(u, cors) {
  let x; try { x = new URL(u || ''); } catch { return json({ error: 'bad url' }, 400, cors); }
  const h = x.hostname.replace(/^www\./, '');
  if (x.protocol !== 'https:' || /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':') || /(^localhost$|\.local$|\.internal$)/.test(h) || blockedHost(h)) return json({ error: 'blocked host' }, 400, cors);
  const r = await fetch(x.href, { headers: { 'User-Agent': UA, Accept: 'image/avif,image/webp,image/*,*/*;q=0.8', Referer: x.origin + '/' }, redirect: 'follow', signal: AbortSignal.timeout(FETCH_TIMEOUT + 6000) });
  if (!r.ok) return json({ error: 'upstream ' + r.status }, 502, cors);
  const ct = r.headers.get('content-type') || '';
  if (!/^image\//i.test(ct)) return json({ error: 'not image' }, 415, cors);
  if (Number(r.headers.get('content-length') || 0) > 25 * 1024 * 1024) return json({ error: 'too large' }, 413, cors);
  return new Response(r.body, { headers: { 'Content-Type': ct, 'Cache-Control': 'public, max-age=86400', ...cors } });
}
