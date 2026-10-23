import {generateBackground} from './image-background.mjs';
import { readFile, writeFile, access, rename } from 'node:fs/promises';
import path from 'node:path';
import { planningPrompt, validatePlan, captionsFromAlignment, checkBudget } from './core.mjs';
import { cardPng, renderReel, sampleClip, silentWav, normalizeClip, zipFiles } from './media.mjs';

const HF='https://api.higgsfield.ai';
export function estimateCost(data,duration,resolution){
  if(typeof data.usd==='number'&&Number.isFinite(data.usd)&&data.usd>=0)return {usd:data.usd,basis:'quote'};
  const rates=/\$(\d+(?:\.\d+)?) per second of generated video at 480p, \$(\d+(?:\.\d+)?) at 720p, and \$(\d+(?:\.\d+)?) at 1080p/.exec(data.pricing_description||'');
  if(data.type!=='description'||!rates||!['480p','720p','1080p'].includes(resolution))throw Error('예상 비용을 확인하지 못해 제작을 중단했습니다.');
  // The service describes landscape rates. Reserve 10% extra for portrait token rounding.
  return {usd:Number(rates[['480p','720p','1080p'].indexOf(resolution)+1])*duration*1.1,basis:'rate'};
}
export async function requestJson(url,options={},timeout=120000) {
  let response;
  try { response=await fetch(url,{...options,signal:AbortSignal.timeout(timeout)}); }
  catch(error) { throw Error(error.name==='TimeoutError'?'외부 서비스 응답이 제한 시간을 넘었습니다. 잠시 뒤 다시 시도해 주세요.':'외부 서비스에 연결하지 못했습니다. 네트워크를 확인해 주세요.'); }
  const data=await response.json().catch(()=>({}));
  if(!response.ok&&new URL(url).hostname==='api.higgsfield.ai'&&data.detail==='not_enough_credits')throw Error('Higgsfield API 크레딧이 부족합니다. API 콘솔에서 충전한 뒤 같은 작업을 이어서 실행해 주세요.');
  if(!response.ok) throw Error(`외부 서비스 요청 실패 (${new URL(url).hostname}, HTTP ${response.status}). 연결·잔액을 확인해 주세요.`);
  return data;
}
const exists=async file=>{try{await access(file);return true;}catch{return false;}};
export function createProviders(env,dir,save) {
  const ffmpeg=env.FFMPEG_PATH||'ffmpeg';
  const hf=(route,body,extra={})=>requestJson(HF+'/'+route,{method:body?'POST':'GET',headers:{Authorization:`Key ${env.HF_API_KEY}`,'Content-Type':'application/json',...extra},...(body?{body:JSON.stringify(body)}:{})});
  const videoBody=(scene,urls,duration=10,resolution='720p')=>({image_urls:urls,prompt:`${scene.prompt}\nPreserve the photographed product, colour, shape and logos. No text, subtitles, speech or new products. Vertical cinematic product shot.`,duration,resolution,aspect_ratio:'9:16',generate_audio:false,bitrate_mode:'high'});
  async function uploadArtifact(file,type){
    const u=await hf('files/generate-upload-url',{content_type:type});
    if(!u.upload_url?.startsWith('https://')||!u.public_url?.startsWith('https://'))throw Error('합성용 업로드 주소가 올바르지 않습니다.');
    const r=await fetch(u.upload_url,{method:'PUT',headers:u.upload_headers||{'Content-Type':type},body:await readFile(path.isAbsolute(file)?file:path.join(dir,file)),signal:AbortSignal.timeout(120000)});
    if(!r.ok)throw Error('합성용 파일 업로드에 실패했습니다.');return u.public_url;
  }
  return {
    save,stage:async()=>{},
    async plan(job) {
      if(job.demo) return validatePlan({title:'가볍게 만나는 새로운 계절',description:'사진 속 디테일부터 오늘의 스타일 제안까지. BUYEST에서 만나보세요. #BUYEST #스타일',scenes:job.images.slice(0,3).map((_,i)=>({imageIds:[i],title:['새로운 시선','가까이 보는 디테일','당신의 일상에'][i],narration:['새로운 계절, 나만의 스타일을 만나보세요.','가까이 볼수록 눈길이 가는 디테일.','BUYEST에서 당신의 취향을 찾아보세요.'][i],prompt:'Slow cinematic push-in on the product, soft daylight, preserve shape and colour.'})),cards:Array.from({length:5},(_,i)=>({imageId:i%job.images.length,title:['가볍게 만나는 새로운 계절','시선을 사로잡는 실루엣','가까이 보는 디테일','일상에 더하는 포인트','취향을 발견하는 곳'][i],body:['사진 속 상품으로 구성한 샘플 카드뉴스입니다.','원본 사진의 형태와 색을 그대로 보여줍니다.','상품 정보는 확인된 내용만 사용합니다.','한 장의 사진에서 시작되는 새로운 스타일.','BUYEST에서 더 많은 상품을 만나보세요.'][i]}))},job.images.length);
      if(!env.GEMINI_API_KEY)throw Error('사진 분석용 Gemini 연결이 필요합니다. 서버 .env를 설정해 주세요.');
      const parts=[{type:'text',text:planningPrompt(job)},...await Promise.all(job.images.map(async image=>({type:'image',mime_type:'image/jpeg',data:(await readFile(path.join(dir,image.file))).toString('base64')})))];
      const schema={type:'OBJECT',properties:{title:{type:'STRING'},description:{type:'STRING'},scenes:{type:'ARRAY',items:{type:'OBJECT',properties:{imageIds:{type:'ARRAY',items:{type:'INTEGER',minimum:0,maximum:job.images.length-1}},title:{type:'STRING'},narration:{type:'STRING'},prompt:{type:'STRING'}},required:['imageIds','title','narration','prompt']}},cards:{type:'ARRAY',items:{type:'OBJECT',properties:{imageId:{type:'INTEGER',minimum:0,maximum:job.images.length-1},title:{type:'STRING'},body:{type:'STRING'},kicker:{type:'STRING'},tagline:{type:'STRING'},points:{type:'ARRAY',items:{type:'STRING'}},meta:{type:'STRING'},price:{type:'STRING'},collection:{type:'STRING'}},required:['imageId','title','body','kicker','tagline','points','meta','price','collection']}}},required:['title','description','scenes','cards']};
      schema.properties.cards.maxItems=7; schema.properties.scenes.maxItems=4;
      const limitStrings=node=>{if(node.type==='STRING')node.maxLength=2000;if(node.properties)for(const [key,value] of Object.entries(node.properties)){limitStrings(value);if(value.type==='STRING'&&['title','body','meta','price','tagline','kicker','collection'].includes(key))value.maxLength=key==='body'?180:60;}if(node.items)limitStrings(node.items);};limitStrings(schema);
      const model=env.GEMINI_MODEL||'gemini-3.8-flash';
      const responseSchema=JSON.parse(JSON.stringify(schema).replace(/"type":"(\w+)"/g,(_,type)=>`"type":"${type.toLowerCase()}"`));
      const data=await requestJson('https://generativelanguage.googleapis.com/v1beta/interactions',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':env.GEMINI_API_KEY},body:JSON.stringify({model,input:parts,store:false,response_format:{type:'text',mime_type:'application/json',schema:responseSchema},generation_config:{max_output_tokens:5000,...(!model.includes('lite')?{thinking_level:'low'}:{})}})});
      const text=(data.steps||[]).filter(s=>s.type==='model_output').flatMap(s=>s.content||[]).filter(p=>p.type==='text').map(p=>p.text||'').join('').replaceAll('바이에스트','바이스트');
      if(!text) throw Error('기획 결과가 비어 있습니다. 사진과 요청 내용을 확인해 주세요.');
      let plan;try{plan=JSON.parse(text);}catch{throw Error('AI 기획 응답이 중간에 끊겼습니다. 다시 기획해 주세요.');}return validatePlan(plan,job.images.length);
    },
    async upload(job) {
      if(job.uploads?.length===job.images.length)return job.uploads;
      job.uploads||=[];
      for(let i=0;i<job.images.length;i++) if(!job.uploads[i]) {
        const u=await hf('files/generate-upload-url',{content_type:'image/jpeg'});
        if(!u.upload_url?.startsWith('https://')||!u.public_url?.startsWith('https://'))throw Error('사진 업로드 주소를 받지 못했습니다.');
        const r=await fetch(u.upload_url,{method:'PUT',headers:u.upload_headers||{'Content-Type':'image/jpeg'},body:await readFile(path.join(dir,job.images[i].file)),signal:AbortSignal.timeout(120000)});
        if(!r.ok)throw Error('영상용 사진 업로드가 실패했습니다.');job.uploads[i]=u.public_url;await save(job);
      }return job.uploads;
    },
    async quote(job,limit) {
      if(job.demo||job.output==='cards')return {videoUsd:0,limit,at:Date.now()};
      if(!env.HF_API_KEY||!env.ELEVENLABS_API_KEY||!env.ELEVENLABS_VOICE_ID)throw Error('Higgsfield와 ElevenLabs 음성 연결이 필요합니다.');
      const urls=await this.upload(job),costs=[],bases=[];const resolution=job.resolution||'720p';
      for(const scene of job.plan.scenes){const duration=Math.min(10,Math.max(4,Math.ceil(scene.narration.length/4.5)+1));const d=await hf('estimate/bytedance/seedance-2.5/reference-to-video',videoBody(scene,scene.imageIds.map(i=>urls[i]),duration,resolution));const c=estimateCost(d,duration,resolution);costs.push(c.usd);bases.push(c.basis);}
      const total=checkBudget(costs,limit);return {videoUsd:total,limit,at:Date.now(),resolution,basis:bases.includes('rate')?'rate':'quote'};
    },
    async voice(job) {
      const segments=[],captions=[];let offset=0;
      for(let i=0;i<job.plan.scenes.length;i++) {
        const scene=job.plan.scenes[i],meta=path.join(dir,`voice-${i}.json`);let result;
        if(await exists(meta))result=JSON.parse(await readFile(meta,'utf8'));
        else if(job.demo){const duration=4,file=`voice-${i}.wav`;await silentWav(dir,file,duration,ffmpeg);result={file,duration,captions:[{start:0,end:duration,text:scene.narration}]};}
        else {
          const d=await requestJson(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(env.ELEVENLABS_VOICE_ID)}/with-timestamps?output_format=mp3_44100_128`,{method:'POST',headers:{'xi-api-key':env.ELEVENLABS_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({text:scene.narration,model_id:env.ELEVENLABS_MODEL||'eleven_multilingual_v2'})});
          const caps=captionsFromAlignment(d.alignment||d.normalized_alignment),end=caps.at(-1).end;
          if(end>9.5)throw Error(`${i+1}번 장면의 음성이 너무 깁니다. 기획의 내레이션을 줄여 다시 시작해 주세요.`);
          if(!d.audio_base64)throw Error('음성 파일을 받지 못했습니다.');const file=`voice-${i}.mp3`;await writeFile(path.join(dir,file),Buffer.from(d.audio_base64,'base64'));result={file,duration:Math.max(4,Math.ceil(end+.4)),captions:caps};
        }
        await writeFile(meta,JSON.stringify(result));segments.push({file:result.file,duration:result.duration});
        captions.push(...result.captions.map(c=>({...c,start:c.start+offset,end:c.end+offset})));offset+=result.duration;
      }return {segments,captions,duration:offset};
    },
    async clip(scene,i,job) {
      const duration=job.completed.voice.segments[i].duration,file=`clip-${i}.mp4`;
      if(await exists(path.join(dir,file)))return {file,duration};
      if(job.demo){await sampleClip(dir,job.images[scene.imageIds[0]].file,`pending-${file}`,duration,ffmpeg);await rename(path.join(dir,`pending-${file}`),path.join(dir,file));return {file,duration};}
      const stateFile=path.join(dir,`clip-${i}.json`);let handle;
      if(await exists(stateFile))handle=JSON.parse(await readFile(stateFile,'utf8'));
      else {
        job.videoReservations||={};
        if(job.videoReservations[i]===undefined){
          const estimate=await hf('estimate/bytedance/seedance-2.5/reference-to-video',videoBody(scene,scene.imageIds.map(j=>job.uploads[j]),duration,job.resolution||'720p'));
          const c=estimateCost(estimate,duration,job.resolution||'720p');checkBudget([...Object.values(job.videoReservations),c.usd],job.quote.limit);job.videoReservations[i]=c.usd;await save(job);
        }
        handle=await hf('bytedance/seedance-2.5/reference-to-video',videoBody(scene,scene.imageIds.map(j=>job.uploads[j]),duration,job.resolution||'720p'),{'Idempotency-Key':`${job.id}-scene-${i}`});
        if(!/^[\w-]{16,64}$/.test(handle.request_id||''))throw Error('영상 생성 번호를 받지 못했습니다. 재시도 전에 외부 작업을 확인해 주세요.');
        await writeFile(stateFile,JSON.stringify(handle));
      }
      let data;
      for(let n=0;n<360;n++) {
        data=await hf(`requests/${encodeURIComponent(handle.request_id)}/status`);
        if(data.status==='completed')break;
        if(['failed','canceled','nsfw'].includes(data.status))throw Error(`${i+1}번 장면 생성이 ${data.status} 상태입니다. 외부 콘솔에서 확인해 주세요.`);
        await new Promise(r=>setTimeout(r,5000));
      }
      if(!data?.video?.url?.startsWith('https://'))throw Error('아직 영상이 완료되지 않았습니다. 같은 작업을 다시 열어 이어서 확인할 수 있습니다.');
      const r=await fetch(data.video.url,{signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error('영상 다운로드가 실패했습니다.');
      const raw=`raw-${i}.mp4`;await writeFile(path.join(dir,raw),Buffer.from(await r.arrayBuffer()));await normalizeClip(dir,raw,`pending-${file}`,duration,ffmpeg);await rename(path.join(dir,`pending-${file}`),path.join(dir,file));return {file,duration};
    },
    async reel(job) {
      if(!env.CREATOMATE_API_KEY||job.demo)return renderReel(dir,job,ffmpeg);
      // Creatomate is optional. Persist the render ID; do not blindly repeat an ambiguous paid submission.
      const stateFile=path.join(dir,'cloud-render.json');let handle;
      const cloud=(route,body)=>requestJson(`https://api.creatomate.com/v2/renders${route}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${env.CREATOMATE_API_KEY}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
      if(await exists(stateFile)){handle=JSON.parse(await readFile(stateFile,'utf8'));if(!handle.id)throw Error('클라우드 합성 요청의 결과가 불확실합니다. Creatomate 콘솔에서 확인 후 담당자가 복구해야 합니다.');}
      else {
        const elements=[];let time=0;
        for(let i=0;i<job.completed.clips.length;i++){
          const clip=job.completed.clips[i],audio=job.completed.voice.segments[i];
          elements.push({type:'video',source:await uploadArtifact(clip.file,'video/mp4'),time,duration:clip.duration,volume:'0%'});
          elements.push({type:'audio',source:await uploadArtifact(audio.file,'audio/mpeg'),time,duration:clip.duration});time+=clip.duration;
        }
        elements.push(...job.completed.voice.captions.map(c=>({type:'text',text:c.text,time:c.start,duration:c.end-c.start,x:'50%',y:'80%',width:'84%',height:'15%',font_family:'Noto Sans KR',font_size:'5.5 vmin',fill_color:'#ffffff',stroke_color:'#202020',stroke_width:'0.35 vmin',x_alignment:'50%',y_alignment:'50%'})));
        if(job.music)elements.push({type:'audio',source:await uploadArtifact(job.music,'audio/mpeg'),time:0,duration:time,volume:'10%'});
        await writeFile(stateFile,JSON.stringify({status:'submitting'}));
        const d=await cloud('',{output_format:'mp4',width:720,height:1280,frame_rate:24,elements});handle=d[0];
        if(!handle?.id)throw Error('클라우드 합성 번호를 받지 못했습니다. 콘솔에서 확인해 주세요.');await writeFile(stateFile,JSON.stringify(handle));
      }
      let rendered;
      for(let i=0;i<240;i++){rendered=await cloud('/'+encodeURIComponent(handle.id));if(rendered.status==='succeeded')break;if(rendered.status==='failed')throw Error('클라우드 합성에 실패했습니다. Creatomate 콘솔에서 확인해 주세요.');await new Promise(r=>setTimeout(r,5000));}
      if(rendered?.status!=='succeeded'||!rendered.url?.startsWith('https://'))throw Error('클라우드 합성이 아직 완료되지 않았습니다. 다시 열어 확인해 주세요.');
      const response=await fetch(rendered.url,{signal:AbortSignal.timeout(120000)});if(!response.ok)throw Error('합성 영상 다운로드에 실패했습니다.');await writeFile(path.join(dir,'reel.mp4'),Buffer.from(await response.arrayBuffer()));return {file:'reel.mp4',renderer:'creatomate'};
    },
    async cards(job) {
      let background;
      if(job.aiBackground&&!job.demo){try{background=await readFile(path.join(dir,'cover-background.png'));}catch{background=await generateBackground(env,job.brief);await writeFile(path.join(dir,'cover-background.png'),background);}}

      const cards=[];
      for(let i=0;i<job.plan.cards.length;i++) {const original=job.plan.cards[i],source=job.images[original.imageId].product;const card=source?{...original,meta:source.name.match(/[A-Z0-9][A-Z0-9 ]{8,}$/i)?.[0]||source.name.slice(0,45),price:source.price?`${Number(source.price).toLocaleString('ko-KR')} ${source.currency==='KRW'?'원':source.currency}`:'',collection:source.brand}:original,file=`card-${String(i+1).padStart(2,'0')}.png`;await writeFile(path.join(dir,file),await cardPng(await readFile(path.join(dir,job.images[card.imageId].file)),card,job.brand,i,job.plan.cards.length,job.demo,background));cards.push({file});}
      await writeFile(path.join(dir,'cards.zip'),await zipFiles(await Promise.all(cards.map(async c=>({name:c.file,data:await readFile(path.join(dir,c.file))})))));
      return cards;
    }
  };
}
