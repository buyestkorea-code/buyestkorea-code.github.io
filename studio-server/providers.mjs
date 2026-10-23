import { readFile, writeFile, access, rename } from 'node:fs/promises';
import path from 'node:path';
import { planningPrompt, validatePlan, captionsFromAlignment, checkBudget } from './core.mjs';
import { cardPng, renderReel, sampleClip, silentWav, normalizeClip, zipFiles } from './media.mjs';

const HF='https://api.higgsfield.ai';
export async function requestJson(url,options={},timeout=120000) {
  const response=await fetch(url,{...options,signal:AbortSignal.timeout(timeout)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw Error(`외부 서비스 요청 실패 (${new URL(url).hostname}, HTTP ${response.status}). 연결·잔액을 확인해 주세요.`);
  return data;
}
const exists=async file=>{try{await access(file);return true;}catch{return false;}};
export function createProviders(env,dir,save) {
  const ffmpeg=env.FFMPEG_PATH||'ffmpeg';
  const hf=(route,body,extra={})=>requestJson(HF+'/'+route,{method:body?'POST':'GET',headers:{Authorization:`Key ${env.HF_API_KEY}`,'Content-Type':'application/json',...extra},...(body?{body:JSON.stringify(body)}:{})});
  const videoBody=(scene,urls,duration=10)=>({image_urls:urls,prompt:`${scene.prompt}\nPreserve the photographed product, colour, shape and logos. No text, subtitles, speech or new products. Vertical cinematic product shot.`,duration,resolution:'720p',aspect_ratio:'9:16',generate_audio:false,bitrate_mode:'high'});
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
      const parts=[{text:planningPrompt(job)},...await Promise.all(job.images.map(async image=>({inlineData:{mimeType:'image/jpeg',data:(await readFile(path.join(dir,image.file))).toString('base64')}})))];
      const schema={type:'OBJECT',properties:{title:{type:'STRING'},description:{type:'STRING'},scenes:{type:'ARRAY',items:{type:'OBJECT',properties:{imageIds:{type:'ARRAY',items:{type:'INTEGER'}},title:{type:'STRING'},narration:{type:'STRING'},prompt:{type:'STRING'}},required:['imageIds','title','narration','prompt']}},cards:{type:'ARRAY',items:{type:'OBJECT',properties:{imageId:{type:'INTEGER'},title:{type:'STRING'},body:{type:'STRING'}},required:['imageId','title','body']}}},required:['title','description','scenes','cards']};
      const data=await requestJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL||'gemini-3.8-flash')}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':env.GEMINI_API_KEY},body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:{responseMimeType:'application/json',responseSchema:schema,maxOutputTokens:5000}})});
      const text=data.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('');
      if(!text) throw Error('기획 결과가 비어 있습니다. 사진과 요청 내용을 확인해 주세요.');
      return validatePlan(JSON.parse(text),job.images.length);
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
      const urls=await this.upload(job),costs=[];
      for(const scene of job.plan.scenes){const d=await hf('estimate/bytedance/seedance-2.5/reference-to-video',videoBody(scene,scene.imageIds.map(i=>urls[i])));costs.push(d.usd);}
      const total=checkBudget(costs,limit);return {videoUsd:total,limit,at:Date.now(),maxDuration:10};
    },
    async voice(job) {
      const segments=[],captions=[];let offset=0;
      for(let i=0;i<job.plan.scenes.length;i++) {
        const scene=job.plan.scenes[i],meta=path.join(dir,`voice-${i}.json`);let result;
        if(await exists(meta))result=JSON.parse(await readFile(meta,'utf8'));
        else if(job.demo){const duration=4,file=`voice-${i}.wav`;await silentWav(dir,file,duration,ffmpeg);result={file,duration,captions:[{start:0,end:duration,text:scene.narration}]};}
        else {
          const d=await requestJson(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(env.ELEVENLABS_VOICE_ID)}/with-timestamps?output_format=mp3_44100_128`,{method:'POST',headers:{'xi-api-key':env.ELEVENLABS_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({text:scene.narration,model_id:env.ELEVENLABS_MODEL||'eleven_multilingual_v2'})});
          const caps=captionsFromAlignment(d.normalized_alignment||d.alignment),end=caps.at(-1).end;
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
          const estimate=await hf('estimate/bytedance/seedance-2.5/reference-to-video',videoBody(scene,scene.imageIds.map(j=>job.uploads[j]),duration));
          checkBudget([...Object.values(job.videoReservations),estimate.usd],job.quote.limit);job.videoReservations[i]=estimate.usd;await save(job);
        }
        handle=await hf('bytedance/seedance-2.5/reference-to-video',videoBody(scene,scene.imageIds.map(j=>job.uploads[j]),duration),{'Idempotency-Key':`${job.id}-scene-${i}`});
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
      const cards=[];
      for(let i=0;i<job.plan.cards.length;i++) {const card=job.plan.cards[i],file=`card-${String(i+1).padStart(2,'0')}.png`;await writeFile(path.join(dir,file),await cardPng(await readFile(path.join(dir,job.images[card.imageId].file)),card,job.brand,i,job.plan.cards.length,job.demo));cards.push({file});}
      await writeFile(path.join(dir,'cards.zip'),await zipFiles(await Promise.all(cards.map(async c=>({name:c.file,data:await readFile(path.join(dir,c.file))})))));
      return cards;
    }
  };
}
