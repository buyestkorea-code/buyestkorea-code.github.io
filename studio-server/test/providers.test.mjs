import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createProviders,requestJson,estimateCost} from '../providers.mjs';
const fixture=async()=>{const dir=await mkdtemp(path.join(os.tmpdir(),'buyest-provider-test-'));await writeFile(path.join(dir,'photo-0.jpg'),Buffer.from('test-image'));return {dir,job:{id:'11111111-1111-1111-1111-111111111111',brand:'buyest',output:'both',images:[{file:'photo-0.jpg'}],facts:'',brief:'',plan:{title:'테스트',description:'테스트',scenes:[{imageIds:[0],narration:'테스트 상품',prompt:'Product shot',title:'테스트'}],cards:[{imageId:0,title:'테스트',body:'테스트'}]},quote:{limit:5},completed:{voice:{segments:[{duration:4}]}}}};};
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
test('Higgsfield 설명형 요율을 숫자 견적과 구분하고 보수적으로 계산한다',()=>{
  const data={type:'description',pricing_description:'For 16:9 video without video input, your request costs roughly $0.2056 per second of generated video at 480p, $0.4622 at 720p, and $1.1372 at 1080p.'};
  assert.equal(estimateCost({usd:.5},4,'720p').usd,.5);
  assert.ok(estimateCost(data,4,'480p').usd>.8224);assert.equal(estimateCost(data,4,'480p').basis,'rate');
  assert.throws(()=>estimateCost({type:'description',pricing_description:'unknown'},4,'480p'),/비용/);
});
test('기획은 실제 사진을 보내고 구조화 JSON을 검증한다',async t=>{
  const {dir,job}=await fixture();let seen;
  t.mock.method(globalThis,'fetch',async(url,opts)=>{assert.match(String(url),/\/interactions$/);seen=JSON.parse(opts.body);return response({status:'completed',steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify(job.plan)}]}]});});
  const p=createProviders({GEMINI_API_KEY:'test'},dir,async()=>{});assert.equal((await p.plan(job)).title,'테스트');assert.equal(seen.input[1].mime_type,'image/jpeg');assert.equal(seen.response_format.mime_type,'application/json');assert.equal(seen.store,false);
});
test('빈 기획과 잘못된 AI 사진 참조는 결과로 인정하지 않는다',async t=>{
  const {dir,job}=await fixture();const p=createProviders({GEMINI_API_KEY:'test'},dir,async()=>{});
  const mock=t.mock.method(globalThis,'fetch',async()=>response({}));await assert.rejects(p.plan(job),/비어/);
  job.plan.scenes[0].imageIds=[99];mock.mock.mockImplementation(async()=>response({steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify(job.plan)}]}]}));await assert.rejects(p.plan(job),/사진/);
});
test('서버 키가 없을 때 실제 기획과 영상을 호출하지 않는다',async()=>{
  const {dir,job}=await fixture();const p=createProviders({},dir,async()=>{});await assert.rejects(p.plan(job),/Gemini/);await assert.rejects(p.quote(job,5),/연결/);
  job.output='cards';assert.equal((await p.quote(job,5)).videoUsd,0);
});
test('동일 사진을 다시 업로드하지 않고 한도 내 견적만 허용한다',async t=>{
  const {dir,job}=await fixture();let uploads=0;
  t.mock.method(globalThis,'fetch',async(url,opts)=>{
    if(String(url).includes('generate-upload-url')){uploads++;return response({upload_url:'https://upload.example/test',public_url:'https://media.example/photo.jpg'});}
    if(String(url).includes('upload.example'))return new Response('',{status:200});
    if(String(url).includes('/estimate/'))return response({usd:1.25});throw Error('unexpected request');
  });
  const p=createProviders({HF_API_KEY:'test',ELEVENLABS_API_KEY:'test',ELEVENLABS_VOICE_ID:'test'},dir,async()=>{});
  assert.equal((await p.quote(job,5)).videoUsd,1.25);assert.equal((await p.quote(job,5)).videoUsd,1.25);assert.equal(uploads,1);await assert.rejects(p.quote(job,1),/한도/);
});
test('음성 정렬을 보존하고 이미 만든 음성은 다시 요청하지 않는다',async t=>{
  const {dir,job}=await fixture();let count=0;
  const mock=t.mock.method(globalThis,'fetch',async()=>{count++;return response({audio_base64:Buffer.from('test-audio').toString('base64'),alignment:{characters:['테','스','트'],character_start_times_seconds:[0,.2,.4],character_end_times_seconds:[.2,.4,.8]},normalized_alignment:{characters:['t','e','s'],character_start_times_seconds:[0,.2,.4],character_end_times_seconds:[.2,.4,.8]}});});
  const p=createProviders({ELEVENLABS_API_KEY:'test',ELEVENLABS_VOICE_ID:'test'},dir,async()=>{});const v=await p.voice(job);assert.equal(v.captions.at(-1).end,.8);assert.equal(v.captions[0].text,'테스트');assert.equal(v.segments[0].duration,4);await p.voice(job);assert.equal(count,1);assert.match(mock.mock.calls[0].arguments[0],/output_format=mp3/);
});
test('제작 직전 실제 견적이 한도를 넘으면 유료 생성을 제출하지 않는다',async t=>{
  const {dir,job}=await fixture();job.uploads=['https://media.example/photo.jpg'];let generated=false;
  t.mock.method(globalThis,'fetch',async url=>{if(String(url).includes('/estimate/'))return response({usd:8});generated=true;return response({});});
  const p=createProviders({HF_API_KEY:'test'},dir,async()=>{});await assert.rejects(p.clip(job.plan.scenes[0],0,job),/한도/);assert.equal(generated,false);
});
test('외부 오류에 API 키나 응답 원문을 포함하지 않는다',async t=>{
  t.mock.method(globalThis,'fetch',async()=>response({secret:'should-not-appear'},401));
  await assert.rejects(requestJson('https://api.example/test'),e=>e.message.includes('401')&&!e.message.includes('should-not-appear'));
});
test('Higgsfield API 크레딧 부족을 권한 오류와 구분해 안내한다',async t=>{
  t.mock.method(globalThis,'fetch',async()=>response({detail:'not_enough_credits'},403));
  await assert.rejects(requestJson('https://api.higgsfield.ai/test'),/크레딧.*부족/);
});
