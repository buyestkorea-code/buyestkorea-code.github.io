import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile,writeFile,mkdir,readdir,rename,stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { validateInput,produce } from './core.mjs';
import { createProviders } from './providers.mjs';
import { command } from './media.mjs';

const root=path.dirname(fileURLToPath(import.meta.url)),web=path.resolve(root,'../studio-next');
const dataRoot=path.resolve(process.env.STUDIO_DATA_DIR||path.join(root,'.data'));
const port=Number(process.env.PORT||4317),jobs=new Map();
await mkdir(dataRoot,{recursive:true});
for(const entry of await readdir(dataRoot,{withFileTypes:true}))if(entry.isDirectory())try {
  const job=JSON.parse(await readFile(path.join(dataRoot,entry.name,'project.json'),'utf8'));job.busy=false;
  if(job.running||['planning','running'].includes(job.status)){job.running=false;job.status='failed';job.error='서버가 다시 시작됐습니다. 저장된 결과부터 이어서 제작할 수 있습니다.';}
  jobs.set(job.id,job);
}catch{}
let renderer=false;try{await command(process.env.FFMPEG_PATH||'ffmpeg',['-version']);renderer=true;}catch{}
const jobDir=job=>path.join(dataRoot,job.id);
const writes=new Map();
async function save(job){const snapshot=JSON.stringify({...job,busy:false},null,2);const next=(writes.get(job.id)||Promise.resolve()).catch(()=>{}).then(async()=>{const dir=jobDir(job);await mkdir(dir,{recursive:true});await writeFile(path.join(dir,'project.tmp'),snapshot);await rename(path.join(dir,'project.tmp'),path.join(dir,'project.json'));});writes.set(job.id,next);await next;}
function expose(job){return {...job,images:job.images.map(i=>({file:i.file})),uploads:undefined,music:undefined,completed:undefined};}
function json(res,data,status=200){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
async function body(req){let size=0;const chunks=[];for await(const c of req){size+=c.length;if(size>68_000_000)throw Error('사진 총 용량이 너무 큽니다.');chunks.push(c);}try{return JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch{throw Error('요청 형식을 확인해 주세요.');}}
const providers=job=>createProviders(process.env,jobDir(job),save);
async function create(input,demo=false){
  const clean=validateInput(input),job={id:randomUUID(),brand:clean.brand,output:clean.output,brief:clean.brief,facts:clean.facts,images:[],status:'draft',stage:'draft',createdAt:new Date().toISOString(),demo,completed:{}};
  await mkdir(jobDir(job),{recursive:true});
  for(let i=0;i<clean.images.length;i++){
    const raw=Buffer.from(clean.images[i].data.split(',')[1],'base64'),file=`photo-${i}.jpg`;
    await sharp(raw,{limitInputPixels:40_000_000}).rotate().resize(1600,1600,{fit:'inside',withoutEnlargement:true}).jpeg({quality:90}).toFile(path.join(jobDir(job),file));job.images.push({file});
  }
  if(process.env.STUDIO_MUSIC_PATH)job.music=path.resolve(process.env.STUDIO_MUSIC_PATH);
  jobs.set(job.id,job);await save(job);return job;
}
async function sampleImages(){
  const colors=['#727e6c','#35483d','#b4ac95'];return Promise.all(colors.map(async(color,i)=>{
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#e5e7dd"/><ellipse cx="400" cy="850" rx="210" ry="30" fill="#d0d3c8"/><path d="M290 190L210 250 110 510 205 550 270 400 260 820 540 820 530 400 595 550 690 510 590 250 510 190 450 220 350 220Z" fill="${color}"/><path d="M350 220L400 340 450 220M400 340V820" fill="none" stroke="#d6dacd" stroke-width="5"/><path d="M285 540H370V650H285M430 540H515V650H430" fill="none" stroke="#d6dacd" stroke-width="3"/><text x="400" y="930" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#647063">BUYEST / SAMPLE ${i+1}</text></svg>`;
    const b=await sharp(Buffer.from(svg)).jpeg().toBuffer();return {data:`data:image/jpeg;base64,${b.toString('base64')}`};
  }));
}
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.mp4':'video/mp4','.zip':'application/zip','.woff2':'font/woff2'};
async function sendFile(req,res,file,download=false){
  const info=await stat(file),type=MIME[path.extname(file)]||'application/octet-stream';
  const bytes=await readFile(file);const headers={'Content-Type':type,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store',...(download?{'Content-Disposition':`attachment; filename="${path.basename(file)}"`}:{})};
  const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
  if(range){const start=Number(range[1]),end=range[2]?Math.min(Number(range[2]),info.size-1):info.size-1;if(start>end||start>=info.size){res.writeHead(416,{'Content-Range':`bytes */${info.size}`});return res.end();}res.writeHead(206,{...headers,'Content-Range':`bytes ${start}-${end}/${info.size}`,'Accept-Ranges':'bytes','Content-Length':end-start+1});return res.end(bytes.subarray(start,end+1));}
  res.writeHead(200,{...headers,'Content-Length':bytes.length,'Accept-Ranges':'bytes'});res.end(bytes);
}
const server=http.createServer(async(req,res)=>{
  try {
    // Local prototype: never listen on a public interface; block cross-site writes and DNS rebinding.
    const allowedHosts=[`127.0.0.1:${port}`,`localhost:${port}`];
    if(!allowedHosts.includes(req.headers.host)){return json(res,{error:'허용되지 않은 호스트입니다.'},403);}
    if(req.headers.origin&&!allowedHosts.some(h=>req.headers.origin===`http://${h}`))return json(res,{error:'다른 사이트에서 요청할 수 없습니다.'},403);
    if(req.headers['sec-fetch-site']==='cross-site'&&req.method!=='GET')return json(res,{error:'외부 사이트 요청은 허용하지 않습니다.'},403);
    const url=new URL(req.url,`http://127.0.0.1:${port}`),route=url.pathname;
    if(route==='/api/config'&&req.method==='GET')return json(res,{local:true,renderer,services:{planner:!!process.env.GEMINI_API_KEY,video:!!process.env.HF_API_KEY,voice:!!(process.env.ELEVENLABS_API_KEY&&process.env.ELEVENLABS_VOICE_ID)},cloudRenderer:!!process.env.CREATOMATE_API_KEY});
    if(route==='/api/projects'&&req.method==='GET')return json(res,[...jobs.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(expose));
    if(route==='/api/projects'&&req.method==='POST')return json(res,expose(await create(await body(req))),201);
    if(route==='/api/sample'&&req.method==='POST'){
      const job=await create({brand:'buyest',output:'both',brief:'',facts:'샘플 일러스트. 실제 상품 정보가 아닙니다.',images:await sampleImages()},true);job.plan=await providers(job).plan(job);job.status='ready';job.stage='ready';await save(job);return json(res,expose(job),201);
    }
    const fileMatch=/^\/files\/([a-f0-9-]{36})\/(photo-\d+\.jpg|card-\d+\.png|reel\.mp4|cards\.zip)$/.exec(route);
    if(fileMatch&&req.method==='GET'){if(!jobs.has(fileMatch[1]))return json(res,{error:'작업을 찾지 못했습니다.'},404);return await sendFile(req,res,path.join(dataRoot,fileMatch[1],fileMatch[2]),url.searchParams.has('download'));}
    const match=/^\/api\/projects\/([a-f0-9-]{36})(?:\/(plan|quote|render))?$/.exec(route);
    if(match){const job=jobs.get(match[1]);if(!job)return json(res,{error:'작업을 찾지 못했습니다.'},404);const action=match[2];
      if(!action&&req.method==='GET')return json(res,expose(job));
      if(req.method!=='POST')return json(res,{error:'지원하지 않는 요청입니다.'},405);
      if(job.running||job.busy)return json(res,{error:'이 작업은 이미 진행 중입니다.'},409);
      const input=await body(req);job.busy=true;
      try {
        if(action==='plan'){
          if(job.plan)throw Error('기획이 이미 저장돼 있습니다. 사진이나 요청을 바꾸려면 새 작업을 만들어 주세요.');
          job.status='planning';await save(job);
          try{job.plan=await providers(job).plan(job);job.status='ready';job.stage='ready';await save(job);}catch(e){job.status='failed';job.error=e.message;await save(job);throw e;}
          return json(res,expose(job));
        }
        if(action==='quote'){
          if(!job.plan)throw Error('먼저 사진으로 기획을 만들어 주세요.');
          job.quote=await providers(job).quote(job,Number(input.limit));await save(job);return json(res,job.quote);
        }
        if(action==='render'){
          if(job.status==='completed')return json(res,expose(job));
          if(!job.plan)throw Error('기획이 필요합니다.');if(!renderer)throw Error('FFmpeg 연결이 필요합니다.');
          if(!job.demo && (input.approved!==true||!job.quote||Date.now()-job.quote.at>10*60000||Number(input.limit)!==job.quote.limit))throw Error('최신 비용과 한도를 확인한 후 제작을 시작해 주세요.');
          const task=produce(job,providers(job));task.catch(()=>{});return json(res,expose(job),202);
        }
      }finally{job.busy=false;}
    }
    if(req.method==='GET'&&(route==='/'||route==='/studio-next/'||route==='/studio-next/index.html'))return await sendFile(req,res,path.join(web,'index.html'));
    const asset=/^\/studio-next\/(app\.js|style\.css)$/.exec(route);if(asset&&req.method==='GET')return await sendFile(req,res,path.join(web,asset[1]));
    if(route==='/favicon.ico'){res.writeHead(204);return res.end();}
    return json(res,{error:'페이지를 찾지 못했습니다.'},404);
  }catch(error){if(!res.headersSent)json(res,{error:error.message},400);else res.end();}
});
server.listen(port,'127.0.0.1',()=>console.log(`BUYEST Studio: http://127.0.0.1:${port}/studio-next/`));
