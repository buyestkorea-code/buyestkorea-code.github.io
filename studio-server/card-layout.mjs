import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {getTemplate} from './templates.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
// Character wrapping also handles long Korean words and model codes.
function wrap(value,width,size){const rows=[];let row='',units=0;for(const ch of String(value||'')){const u=/[\u0000-\u007f]/.test(ch)?0.56:1;if(ch==='\n'||units+u>width/size){rows.push(row.trim());row='';units=0;if(ch==='\n')continue;}row+=ch;units+=u;}if(row)rows.push(row.trim());return rows;}
export async function editorialCard(image,card,brand,index,count,demo,background,templateId='editorial'){
 const t=getTemplate(templateId),a=t.color,ink='#18212a';let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"><rect width="1080" height="1350" fill="${t.bg}"/>`;
 const rect=(x,y,w,h,fill,rx=0)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"/>`;
 const txt=(s,x,y,size=28,color=ink,weight=400)=>`<text x="${x}" y="${y}" font-family="Malgun Gothic, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${esc(s)}</text>`;
 const block=(value,x,y,w,size,max=3,color=ink,weight=400)=>{let rows=wrap(value,w,size);while(rows.length>max&&size>20){size-=2;rows=wrap(value,w,size);}return rows.slice(0,max).map((r,i)=>txt(r,x,y+i*size*1.4,size,color,weight)).join('');};
 const logo=await readFile(new URL('./brand-assets/buyest-logo.png',import.meta.url));
 svg+=rect(0,0,1080,112,'#fff')+`<image x="52" y="34" width="180" height="41" href="data:image/png;base64,${logo.toString('base64')}"/>`+txt(card.collection||'SELECTED BY BUYEST',540,62,21)+txt(`${index+1} / ${count}`,947,62,22);
 if(index===0&&background)svg+=`<image x="0" y="112" width="1080" height="1090" opacity="0.18" href="data:image/png;base64,${background.toString('base64')}"/>`;
 let photo=[80,330,920,570],head=[60,215,950,64],info=[60,970,950],tagY=880;
 switch(t.layout){
 case 'split':photo=[40,160,560,870];head=[640,220,390,46];info=[640,630,380];tagY=530;svg+=rect(620,112,460,1090,'#fff');break;
 case 'gallery':photo=[140,280,800,610];head=[130,205,820,48];info=[130,1010,820];tagY=925;svg+=rect(80,145,920,1000,'#fff');break;
 case 'bold':photo=[300,350,730,550];head=[55,235,950,80];info=[70,1000,940];tagY=920;svg+=rect(0,345,255,560,a)+txt('SELECT',28,820,44,'#fff',700);break;
 case 'catalog':photo=[70,150,940,650];head=[70,870,940,44];info=[70,1060,940];tagY=990;svg+=rect(35,130,1010,1050,'#fff');break;
 case 'note':photo=[440,170,580,710];head=[55,240,350,50];info=[55,960,960];tagY=885;svg+=rect(35,155,380,680,'#fff')+txt('EDITOR’S NOTE',55,190,20,a,700);break;
 case 'spotlight':photo=[215,300,650,590];head=[90,215,900,58];info=[90,1015,900];tagY=930;svg+=`<circle cx="540" cy="600" r="405" fill="#f5dc9e"/>`;break;
 case 'stripe':photo=[55,285,680,610];head=[55,210,970,54];info=[55,1030,970];tagY=940;svg+=rect(775,112,305,800,a)+txt('BUYEST',805,865,44,'#fff',700);break;
 case 'minimal':photo=[200,340,680,510];head=[160,235,760,43];info=[160,1035,760];tagY=955;svg+=`<line x1="160" y1="900" x2="920" y2="900" stroke="${a}"/>`;break;
 case 'poster':photo=[80,145,920,600];head=[60,840,960,62];info=[60,1070,960];tagY=1000;svg+=rect(0,770,1080,440,'#fff');break;
 case 'kids':photo=[155,330,770,530];head=[80,225,920,62];info=[80,1020,920];tagY=925;svg+=`<circle cx="950" cy="220" r="80" fill="#ffb48c"/><circle cx="100" cy="830" r="70" fill="#b8d9be"/>`+rect(110,300,860,590,'#fff',72);break;
 }
 const pic=await sharp(image).resize(Math.round(photo[2]),Math.round(photo[3]),{fit:'contain',background:'#fff'}).png().toBuffer();
 svg+=`<image x="${photo[0]}" y="${photo[1]}" width="${photo[2]}" height="${photo[3]}" href="data:image/png;base64,${pic.toString('base64')}"/>`;
 svg+=block(card.title,...head,t.layout==='note'?4:2,ink,700);
 const ix=info[0],iw=info[2];svg+=block(card.tagline||card.kicker||t.name,ix,tagY,iw,27,2,a,700);
 svg+=block(card.body,ix,info[1],iw,28,3);
 const points=(card.points||[]).filter(x=>typeof x==='string');if(t.layout==='split')svg+=block(points.join('\n'),ix,830,iw,23,6);else if(info[1]<1035)svg+=block(points.join(' · '),ix,info[1]+110,iw,22,2);
 svg+=rect(0,1190,1080,160,'#fff')+block(card.meta||'',52,1220,960,20,1,'#62707d')+txt(card.price||'',52,1270,35,a,700)+txt(demo?'샘플 · AI 생성 아님':'buyest.co.kr · 구매 전 상세페이지 확인',52,1320,19,'#62707d')+txt(index===count-1?'저장하고 비교하기 ↗':'옆으로 넘겨보기 →',810,1320,20,a,700);
 svg+='</svg>';return sharp(Buffer.from(svg)).png().toBuffer();
}
