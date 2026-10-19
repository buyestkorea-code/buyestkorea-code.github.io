// BUYEST 사진 자동 찾기 — Cloudflare Worker
// GET /find?code=품번[&color=컬러]  → 해외 상품페이지에서 품번 일치 확인 후 사진 URL 반환
// GET /img?u=사진URL               → 사진 중계(브라우저 CORS 회피, zip 저장용)
// 비밀값: SERPER_KEY (wrangler secret put SERPER_KEY) — 코드에 키를 넣지 말 것
// CPU 10ms(무료) 제한 때문에 DOM 파싱 없이 정규식으로 필요한 부분만 뽑는다.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// 1차 출처: 결과에 이 도메인이 있으면 우선 확인
const PREFERRED = ['cettire.com', 'vitkac.com', 'thedoublef.com', 'biffi.com', 'fashionsquare.it', 'fashionsquare.com'];
// 제외: 한국 사이트·마켓·BUYMA·브랜드 공식몰·검색/SNS
const BLOCK_HOST = /(\.kr$|\.co\.kr$|naver|coupang|11st|gmarket|auction|danawa|kream|musinsa|29cm|wconcept|ssfshop|lotte|shinsegae|buyma|amazon|ebay|aliexpress|temu|etsy|poshmark|depop|vestiaire|farfetch-outlet|pinterest|facebook|instagram|youtube|tiktok|reddit|twitter|x\.com|wikipedia|alibaba|dhgate|taobao|rakuten|mercari|yahoo)/i;
const OFFICIAL = /(^|\.)(gucci|prada|saintlaurent|ysl|burberry|moncler|stoneisland|canadagoose|dolcegabbana|versace|fendi|balenciaga|bottegaveneta|loewe|dior|chanel|hermes|louisvuitton|givenchy|valentino|ferragamo|tods|furla|armani|msgm|moschino|golden-goose|goldengoose|palmangels|offwhite|maisonmargiela|jilsander|acnestudios|maxmara|marni|miumiu|etro|lanvin|celine|apc|ganni|stellamccartney|vivienne-?westwood|viviennewestwood|nike|adidas|newbalance|puma|asics|converse|vans|ugg|birkenstock)\./i;

const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS } });

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(req.url);
    try {
      if (url.pathname === '/img') return await proxyImage(url.searchParams.get('u'));
      if (url.pathname === '/find') return json(await find(url.searchParams.get('code') || '', url.searchParams.get('color') || '', env));
      return json({ ok: true, usage: '/find?code=품번&color=컬러 , /img?u=사진URL' });
    } catch (e) {
      return json({ error: String(e && e.message || e) }, 500);
    }
  },
};

async function proxyImage(u) {
  if (!u || !/^https:\/\//i.test(u)) return json({ error: 'bad url' }, 400);
  const h = hostOf(u);
  if (!h || BLOCK_HOST.test(h)) return json({ error: 'blocked host' }, 400);
  const r = await fetch(u, { headers: { 'User-Agent': UA, Referer: 'https://' + h + '/' } });
  if (!r.ok) return json({ error: 'upstream ' + r.status }, 502);
  const ct = r.headers.get('content-type') || '';
  if (!/^image\//i.test(ct)) return json({ error: 'not image' }, 400);
  return new Response(r.body, { headers: { 'Content-Type': ct, 'Cache-Control': 'public, max-age=86400', ...CORS } });
}

async function find(code, color, env) {
  const full = norm(code);
  if (full.length < 5) return { status: 'skip', reason: '품번이 5자 미만이라 조회하지 않음' };
  if (!env.SERPER_KEY) return { status: 'error', reason: 'SERPER_KEY 미설정' };
  const digitsOnly = /^\d+$/.test(full);

  // 검색: 품번 따옴표 검색 (+컬러가 있으면 한 번 더)
  const queries = [`"${code.trim()}"`];
  if (color) queries.push(`"${code.trim()}" ${color}`);
  const seen = new Set();
  const cands = [];
  for (const q of queries) {
    const r = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': env.SERPER_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q, num: 10, gl: 'us', hl: 'en' }),
    });
    if (!r.ok) return { status: 'error', reason: 'Serper ' + r.status };
    const d = await r.json();
    for (const it of (d.organic || [])) {
      const h = hostOf(it.link);
      if (!h || seen.has(it.link)) continue;
      seen.add(it.link);
      if (BLOCK_HOST.test(h) || OFFICIAL.test(h) || /[가-힣]/.test(it.title || '')) continue;
      cands.push({ link: it.link, host: h, title: it.title || '', pref: PREFERRED.some(p => h.endsWith(p)) ? 0 : 1 });
    }
    if (cands.length >= 4) break;
  }
  cands.sort((a, b) => a.pref - b.pref);

  const found = [];
  let checked = 0;
  for (const c of cands.slice(0, 6)) {
    if (checked >= 5 || found.length >= 3) break;
    checked++;
    const p = await inspect(c.link);
    if (!p) continue;
    const m = matchLevel(full, color, p);
    if (!m) continue;
    found.push({ source: c.host, page: c.link, name: p.name, match: m, images: p.images.slice(0, 8), primary: c.pref === 0 });
  }
  if (!found.length) return { status: 'none', checked };

  // 정확 > 컬러명 일치, 1차 출처 우선
  found.sort((a, b) => (a.match === 'exact' ? 0 : 1) - (b.match === 'exact' ? 0 : 1) || (a.primary ? 0 : 1) - (b.primary ? 0 : 1));
  const best = found[0];
  let status = best.match === 'exact' ? 'exact' : 'color';
  if (status === 'exact' && digitsOnly && full.length < 8) status = 'verify'; // 숫자만 짧은 품번은 직접 확인
  return { status, best, others: found.slice(1) };
}

// 상품페이지(JSON-LD Product 또는 og:type=product)만 인정
async function inspect(link) {
  let r;
  try { r = await fetch(link, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, redirect: 'follow' }); } catch { return null; }
  if (!r.ok) return null;
  const ct = r.headers.get('content-type') || '';
  if (!/html/i.test(ct)) return null;
  const html = (await r.text()).slice(0, 600000);

  let ld = null;
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const prod = findProduct(JSON.parse(m[1].trim()));
      if (prod) { ld = prod; break; }
    } catch {}
  }
  const og = n => { const x = html.match(new RegExp('<meta[^>]+(?:property|name)=["\']' + n + '["\'][^>]*content=["\']([^"\']*)["\']', 'i')) || html.match(new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:property|name)=["\']' + n + '["\']', 'i')); return x ? decode(x[1]) : ''; };
  const ogType = og('og:type');
  if (!ld && !/product/i.test(ogType)) return null;

  const ids = [];
  let name = '', images = [];
  if (ld) {
    const offers = [].concat(ld.offers || []);
    ids.push(ld.sku, ld.mpn, ld.productID, ld.gtin, ld.model, ld.name, ...offers.map(o => o && o.sku));
    name = decode(String(ld.name || ''));
    images = [].concat(ld.image || []).map(x => typeof x === 'string' ? x : (x && (x.url || x.contentUrl))).filter(Boolean);
  }
  ids.push(og('og:title'), link);
  if (!name) name = og('og:title');
  if (!images.length) { const i = og('og:image'); if (i) images = [i]; }
  images = images.map(x => absUrl(x, link)).filter(Boolean);
  images = [...new Set(images)];
  return { name, ids: ids.filter(Boolean).map(String), images, text: norm(ids.join(' ') + ' ' + (html.match(/<title>([\s\S]*?)<\/title>/i) || [, ''])[1]) };
}

function findProduct(o) {
  if (!o) return null;
  if (Array.isArray(o)) { for (const x of o) { const p = findProduct(x); if (p) return p; } return null; }
  if (typeof o !== 'object') return null;
  const t = [].concat(o['@type'] || []);
  if (t.includes('Product') || t.includes('ProductGroup')) return o;
  if (o['@graph']) return findProduct(o['@graph']);
  return null;
}

// 전체 품번(구분자 제거) 포함 → exact. 컬러가 이름이면 모델+컬러명 일치 → color
function matchLevel(full, color, p) {
  const hay = p.text;
  if (hay.includes(full)) return 'exact';
  const c = norm(color);
  if (c && c.length >= 3) {
    // 품번이 "모델 컬러코드" 형태일 때 모델 부분만 일치하면서 컬러명이 같이 있는 경우
    const model = full.slice(0, Math.max(5, full.length - 3));
    if (hay.includes(model) && hay.includes(c)) return 'color';
  }
  return null;
}

function absUrl(x, base) { try { return new URL(x, base).toString(); } catch { return ''; } }
function decode(s) { return s.replace(/&apos;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>'); }
