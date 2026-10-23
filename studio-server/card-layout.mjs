import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function lines(text,n){const out=[];for(const part of String(text||'').split('\n')){let line='';for(const word of part.split(' ')){if(line&&line.length+word.length+1>n){out.push(line);line='';}line+=(line?' ':'')+word;}if(line)out.push(line);}return out;}
export async function editorialCard(image,card,brand,index,count,demo){
 const logo=await readFile(new URL('./brand-assets/buyest-logo.png',import.meta.url));
 const picture=await sharp(image).resize(760,670,{fit:'contain',background:'#ffffff'}).png().toBuffer();
 const cover=index===0,accent='#d74932',ink='#171b19';
 const text=(s,x,y,size=30,color=ink,weight=400)=>`<text x="${x}" y="${y}" font-family="Malgun Gothic, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${esc(s)}</text>`;
 const title=lines(card.title,cover?12:18).slice(0,3),points=(card.points||[]).slice(0,3);
 let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"><rect width="1080" height="1350" fill="#fff"/><image x="64" y="46" width="200" height="45" href="data:image/png;base64,${logo.toString('base64')}"/>${text(card.collection||'STYLE GUIDE',660,78,23)}${text(`${String(index+1).padStart(2,'0')} / ${String(count).padStart(2,'0')}`,945,78,22)}<line x1="64" y1="118" x2="1016" y2="118" stroke="#252a26"/>`;
 if(cover){
  svg+=text(card.kicker||'이번 시즌, 무엇을 고를까?',64,178,25,accent,700);
  title.forEach((l,i)=>svg+=text(l,59,285+i*105,94,ink,700));
  svg+=`<image x="255" y="485" width="760" height="670" href="data:image/png;base64,${picture.toString('base64')}"/><rect x="64" y="520" width="165" height="165" rx="82" fill="${accent}"/>${text(String(Math.max(1,count-1)),111,625,91,'#fff',700)}${text('가지 셀렉션',75,735,23,ink,700)}`;
  lines(card.body,29).slice(0,3).forEach((l,i)=>svg+=text(l,64,1120+i*40,29));
 }else{
  svg+=text(card.kicker||'MONCLER SELECT',64,172,24,accent,700);
  title.forEach((l,i)=>svg+=text(l,60,242+i*65,58,ink,700));
  svg+=`<image x="160" y="310" width="760" height="540" href="data:image/png;base64,${picture.toString('base64')}"/>`;
  if(card.tagline)svg+=`<rect x="64" y="860" width="952" height="65" fill="${ink}"/>${text(card.tagline,87,903,30,'#fff',700)}`;
  const bodyLines=lines(card.body,32).slice(0,2);bodyLines.forEach((l,i)=>svg+=text(l,64,976+i*39,29));
  points.forEach((p,i)=>svg+=text('• '+p,64,1076+i*38,27,'#454b46'));
  if(card.price)svg+=text(card.price,64,1233,38,accent,700);
  if(card.meta)svg+=text(card.meta,64,1188,22,'#606761');
 }
 svg+=`<line x1="64" y1="1270" x2="1016" y2="1270" stroke="#b9bdb7"/>${text(demo?'샘플 · AI 생성 아님':'buyest.co.kr  |  상품 정보는 구매 전 상세페이지에서 확인',64,1313,19,'#5c655e')}${text(cover?'옆으로 넘겨보기 →':index===count-1?'저장하고 비교해 보세요 ↗':'다음 상품 →',790,1313,22,accent,700)}</svg>`;
 return sharp(Buffer.from(svg)).png().toBuffer();
}
