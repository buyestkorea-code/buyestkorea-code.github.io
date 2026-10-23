import { test,before,after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const cwd=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let child,dir,base,port;
const start=async()=>{child=spawn(process.execPath,['server.mjs'],{cwd,windowsHide:true,env:{...process.env,PORT:String(port),STUDIO_DATA_DIR:dir,GEMINI_API_KEY:'',HF_API_KEY:'',ELEVENLABS_API_KEY:'',CREATOMATE_API_KEY:''},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('서버 시작 시간 초과')),10000);child.stdout.on('data',d=>{if(String(d).includes('BUYEST Studio:')){clearTimeout(t);resolve();}});child.on('exit',c=>{clearTimeout(t);reject(Error('서버 종료 '+c));});});};
const stop=()=>new Promise(resolve=>{if(!child||child.exitCode!==null)return resolve();child.once('exit',resolve);child.kill();});
const call=(route,body,headers={})=>fetch(base+route,{...(body?{method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json',...headers}}:{headers})});
before(async()=>{dir=await mkdtemp(path.join(os.tmpdir(),'buyest-studio-test-'));port=45000+Math.floor(Math.random()*10000);base=`http://127.0.0.1:${port}`;await start();});
after(stop);
test('첫 화면을 제공하고 키 값을 노출하지 않는다',async()=>{
  assert.equal((await call('/studio-next/')).status,200);const c=await (await call('/api/config')).json();assert.equal(c.services.planner,false);assert.equal(c.services.video,false);assert.equal(JSON.stringify(c).includes('API_KEY'),false);
});
test('다른 사이트의 쓰기와 잘못된 Host를 거절한다',async()=>{
  assert.equal((await call('/api/sample',{}, {Origin:'https://unrelated.example'})).status,403);
  assert.equal((await call('/api/sample',{}, {'Sec-Fetch-Site':'cross-site'})).status,403);
  const status=await new Promise((resolve,reject)=>{http.get(base+'/api/config',{headers:{Host:'attacker.example'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject);});assert.equal(status,403);
});
test('비밀 설정과 Git 파일을 정적 파일로 제공하지 않는다',async()=>{
  for(const route of ['/studio-server/.env','/.git/config','/studio-next/../.git/config'])assert.equal((await call(route)).status,404);
});
test('사진이 없는 요청과 실제 이미지가 아닌 파일을 거절한다',async()=>{
  assert.equal((await call('/api/projects',{brand:'buyest',output:'both',images:[]})).status,400);
  assert.equal((await call('/api/projects',{brand:'buyest',output:'cards',images:[{data:'data:image/jpeg;base64,YWJj'}]})).status,400);
});
test('샘플을 명시적으로 구분하고 실제 AI 없이 기획을 보관한다',async()=>{
  const response=await call('/api/sample',{});assert.equal(response.status,201);const j=await response.json();assert.equal(j.demo,true);assert.equal(j.status,'ready');assert.equal(j.plan.cards.length,5);assert.equal(j.plan.scenes.length,3);
  const file=await call(`/files/${j.id}/${j.images[0].file}`);assert.equal(file.status,200);assert.equal(file.headers.get('content-type'),'image/jpeg');
});
test('서버 재시작 후 프로젝트와 샘플 기획을 복구한다',async()=>{
  const before=await (await call('/api/projects')).json();await stop();await start();const restored=await (await call('/api/projects')).json();assert.equal(restored.length,before.length);assert.equal(restored[0].id,before[0].id);assert.equal(restored[0].busy,false);
});
test('실제 AI 키가 없으면 샘플 사진이라도 일반 제작을 거절한다',async()=>{
  const [sample]=await (await call('/api/projects')).json();const bytes=Buffer.from(await (await call(`/files/${sample.id}/${sample.images[0].file}`)).arrayBuffer());
  const job=await (await call('/api/projects',{brand:'kids',output:'cards',images:[{data:'data:image/jpeg;base64,'+bytes.toString('base64')}]})).json();
  const response=await call(`/api/projects/${job.id}/plan`,{});assert.equal(response.status,400);assert.match((await response.json()).error,/Gemini/);
  assert.equal((await call(`/api/projects/${job.id}/render`,{approved:true,limit:5})).status,400);
});
test('없는 프로젝트와 허용하지 않은 아티팩트를 차단한다',async()=>{
  assert.equal((await call('/api/projects/00000000-0000-0000-0000-000000000000')).status,404);
  const [job]=await (await call('/api/projects')).json();assert.equal((await call(`/files/${job.id}/project.json`)).status,404);
});
