const origin='https://buyest.co.kr';
export function siteUrl(value){const u=new URL(value,origin);if(u.origin!==origin||u.username||u.password)throw Error('바이스트 상품 링크만 사용할 수 있습니다.');return u;}
async function download(url,fetcher=fetch,max=8_000_000){const r=await fetcher(siteUrl(url),{redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('상품 정보를 불러오지 못했습니다.');let size=0;const chunks=[];for await(const c of r.body){size+=c.length;if(size>max)throw Error('상품 파일이 너무 큽니다.');chunks.push(c);}return Buffer.concat(chunks);}
export function parseProduct(html,pid){
 const nodes=[];const visit=x=>{if(Array.isArray(x))x.forEach(visit);else if(x&&typeof x==='object'){nodes.push(x);if(x['@graph'])visit(x['@graph']);}};
 for(const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi))try{visit(JSON.parse(m[1]));}catch{}
 const p=nodes.find(x=>[].concat(x['@type']).includes('Product'));if(!p?.name)throw Error('상품 상세 정보를 찾지 못했습니다.');
 const offer=[].concat(p.offers||[])[0]||{},image=[].concat(p.image||[])[0];
 const img=typeof image==='string'?image:image?.url;if(!img)throw Error('상품 사진이 없습니다.');siteUrl(img);
 return {pid:String(pid),name:String(p.name).slice(0,240),brand:String(p.brand?.name||'').slice(0,80),description:String(p.description||'').slice(0,500),price:offer.price==null?'':String(offer.price),currency:offer.priceCurrency||'',image:siteUrl(img).href,url:`${origin}/product_detail.php?pid=${pid}`,fetchedAt:new Date().toISOString()};
}
export async function product(pid,fetcher=fetch){if(!/^\d{1,10}$/.test(String(pid)))throw Error('상품 번호를 확인해 주세요.');return parseProduct((await download(`${origin}/product_detail.php?pid=${pid}`,fetcher)).toString(),pid);}
export async function searchProducts(input,fetcher=fetch){
 if(typeof input!=='string'||input.length>2000)throw Error('품번이나 링크를 입력해 주세요.');const lines=[...new Set(input.split(/\r?\n/).map(s=>s.trim()).filter(Boolean))];if(!lines.length||lines.length>8)throw Error('한 줄에 하나씩 최대 8개를 입력해 주세요.');
 const results=[];for(const query of lines){try{
  let ids=[];if(/^https?:/i.test(query)){const u=siteUrl(query);if(u.pathname!=='/product_detail.php'||!/^\d+$/.test(u.searchParams.get('pid')||''))throw Error('상품 상세페이지 링크를 입력해 주세요.');ids=[u.searchParams.get('pid')];}
  else {const html=(await download(`${origin}/product_search.php?max_search_key=${encodeURIComponent(query)}`,fetcher)).toString();ids=[...new Set([...html.matchAll(/product_detail\.php\?pid=(\d+)/g)].map(m=>m[1]))];}
  const truncated=ids.length>12;const candidates=[];for(const id of ids.slice(0,12)){try{candidates.push(await product(id,fetcher));}catch{}}
  results.push({query,candidates,truncated,error:candidates.length?'':'일치하는 상품을 찾지 못했습니다. 상세페이지 링크로 시도해 주세요.'});
 }catch(e){results.push({query,candidates:[],error:e.message});}}
 return results;
}
export async function importProducts(ids,fetcher=fetch){
 if(!Array.isArray(ids)||!ids.length||ids.length>8||new Set(ids).size!==ids.length)throw Error('서로 다른 상품을 1~8개 선택해 주세요.');
 const images=[];for(const id of ids){const p=await product(id,fetcher);const b=await download(p.image,fetcher);images.push({data:`data:image/jpeg;base64,${b.toString('base64')}`,name:p.name,product:p});}return {images};
}
