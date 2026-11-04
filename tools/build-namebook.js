/* 상품명 학습자료 만들기 — 사용: node tools/build-namebook.js <메인.tsv> <키즈.tsv>
 * TSV 열: pid, 브랜드(한글), 노출(Y/N), 상품명.  서버에서 읽기 전용으로 뽑는다:
 *   mysql <DB> -N -e "select p.pid, ifnull(b.brand_name_kr,''), p.product_display, replace(p.product_name,'\t',' ') from max_product p left join max_brand b on b.bid=p.product_brand"
 * 결과 assets/photo-auto/namebook.json 은 공개 상품명(이미 사이트에 노출된 문구)과 집계만 담는다. 가격·재고·고객정보 없음. */
const fs=require('fs');
const H=/[가-힣]/, SEASON=/^\d{2}(SS|FW|AW|F\/W|S\/S|A\/W)$/i;
const rows=[];
[['main',process.argv[2]],['kids',process.argv[3]]].forEach(([site,f])=>{
  fs.readFileSync(f,'utf8').split('\n').forEach(l=>{ const p=l.split('\t'); if(p.length<4) return;
    let name=p.slice(3).join(' ').trim(); if(/^\[스크래치|^◆|^\[하자/.test(name)) return;
    const t=name.split(/\s+/); let i=t.length; while(i>0&&!H.test(t[i-1])) i--; if(i<2) return;
    const m=t[0].match(/^(\d{2})(SS|FW|AW)$/i);
    rows.push({site,brand:p[1].trim().replace(/\s*[^가-힣A-Za-z0-9\s]\s*키즈$/,""),shown:p[2]==='Y',name,color:t[i-1],item:t[i-2],year:m?+m[1]:0,tokens:t.length});
  });
});
const cnt=(arr,key,n)=>{const m=new Map();arr.forEach(r=>{const k=key(r);if(k)m.set(k,(m.get(k)||0)+1);});return [...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,n);};
// 아이템 단어: 색상 바로 앞 단어. 색상 단어 자체가 아이템 자리에 온 경우(두 단어 색상 등)는 제외
const colorSet=new Set(cnt(rows,r=>r.color,400).map(x=>x[0]));
const itemsTop=cnt(rows.filter(r=>!colorSet.has(r.item)),r=>r.item,220);
const itemSet=new Set(itemsTop.map(x=>x[0]));
// 디테일 단어: 아이템 앞쪽 한글 단어 중 흔한 것
const mod=new Map();
rows.forEach(r=>{const t=r.name.split(/\s+/);t.slice(0,-1).forEach(w=>{ if(H.test(w)&&!SEASON.test(w)&&w!==r.color&&w!==r.item&&w.length<=8&&!/^(키즈|여성|남성)$/.test(w)&&!/^\d/.test(w)) mod.set(w,(mod.get(w)||0)+1);});});
const mods=[...mod.entries()].filter(x=>x[1]>=25).sort((a,b)=>b[1]-a[1]).slice(0,140);
// 예시 고르기: 최신 시즌 우선, 노출중, 아이템/브랜드 골고루
const score=r=>(r.shown?1000:0)+(r.year>=24?r.year*10:r.year)+Math.min(r.tokens,8);
const pick=(list,n,keyf)=>{const used=new Map(),out=[];list.slice().sort((a,b)=>score(b)-score(a)).forEach(r=>{const k=keyf(r);if((used.get(k)||0)>=1)return;used.set(k,1);if(out.length<n)out.push(r);});return out;};
const brands={};
const byBrand=new Map(), shape=new Map(); rows.forEach(r=>{ if(!r.brand) return; const k=r.brand.replace(/s/g,''); (byBrand.get(k)||byBrand.set(k,[]).get(k)).push(r); const sm=shape.get(k)||shape.set(k,new Map()).get(k); sm.set(r.brand,(sm.get(r.brand)||0)+1); });
[...byBrand.entries()].filter(([b,l])=>l.length>=12).sort((a,b)=>b[1].length-a[1].length).slice(0,140).forEach(([k,l])=>{ const b=[...shape.get(k).entries()].sort((x,y)=>y[1]-x[1])[0][0];
  const ex=pick(l,10,r=>r.item); brands[b]={n:l.length,kids:l.filter(r=>r.site==='kids').length,items:cnt(l,r=>itemSet.has(r.item)?r.item:'',6).map(x=>x[0]),ex:ex.map(r=>r.name)};
});
const gl=[];
['main','kids'].forEach(site=>{
  const per=site==='main'?3:3, pool=rows.filter(r=>r.site===site&&itemSet.has(r.item));
  itemsTop.slice(0,70).forEach(([it])=>{ const l=pool.filter(r=>r.item===it); pick(l,per,r=>r.brand).forEach(r=>gl.push({s:site==='kids'?'k':'m',n:r.name})); });
});
const out={built:new Date().toISOString().slice(0,10),total:rows.length,main:rows.filter(r=>r.site==='main').length,kids:rows.filter(r=>r.site==='kids').length,
  colors:cnt(rows,r=>r.color,120),items:itemsTop,mods,brands,examples:gl,
  kidsToken:{kidsWithTag:rows.filter(r=>r.site==='kids'&&/(^|\s)키즈(\s|$)/.test(r.name)).length,kidsTotal:rows.filter(r=>r.site==='kids').length,mainWithTag:rows.filter(r=>r.site==='main'&&/(^|\s)키즈(\s|$)/.test(r.name)).length}};
fs.writeFileSync('assets/photo-auto/namebook.json',JSON.stringify(out));
console.log('rows',rows.length,'colors',out.colors.length,'items',itemsTop.length,'mods',mods.length,'brands',Object.keys(brands).length,'examples',gl.length,out.kidsToken,(fs.statSync('assets/photo-auto/namebook.json').size/1024).toFixed(0)+'KB');
