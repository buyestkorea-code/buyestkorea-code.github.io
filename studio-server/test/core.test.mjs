import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateInput, validatePlan, planningPrompt, captionsFromAlignment, checkBudget, produce } from '../core.mjs';

const input = () => ({ brand: 'buyest', output: 'both', brief: '', facts: '상품명: 테스트 가방', images: [{data:'data:image/jpeg;base64,/9j/'}] });
const plan = () => ({ title: '오늘의 셀렉션', description: '사진 속 상품을 소개합니다.', scenes: [{ imageIds:[0], narration:'디테일을 만나보세요.', prompt:'Slow product push-in', title:'오늘의 셀렉션' }], cards: [{ imageId:0, title:'오늘의 셀렉션', body:'사진 속 상품을 만나보세요.' }] });

test('사진 없는 요청은 제작 전에 거절한다', () => assert.throws(() => validateInput({...input(), images:[]}), /사진/));
test('한 번에 8장을 넘는 사진과 과도한 입력을 거절한다', () => {
  assert.throws(() => validateInput({...input(), images:Array(9).fill(input().images[0])}), /8/);
  assert.throws(() => validateInput({...input(), facts:'가'.repeat(4001)}), /길/);
});
test('허용하지 않은 출력과 파일 형식은 거절한다', () => {
  assert.throws(() => validateInput({...input(), output:'publish'}), /출력/);
  assert.throws(() => validateInput({...input(), images:[{data:'data:text/html;base64,aaaa'}]}), /사진/);
});
test('기획서 없이 사진만 입력해도 기획 요청을 만들 수 있다', () => {
  const result=validateInput(input()); assert.equal(result.brand,'buyest'); assert.equal(result.brief,'');
  const prompt=planningPrompt(result); assert.match(prompt,/가격/); assert.match(prompt,/서로 다른 상품/); assert.match(prompt,/imageIds/);
});
test('AI가 존재하지 않는 사진을 참조하면 거절한다', () => {
  const p=plan(); p.scenes[0].imageIds=[1]; assert.throws(() => validatePlan(p,1), /사진/);
  const c=plan(); c.cards[0].imageId=-1; assert.throws(() => validatePlan(c,1), /사진/);
});
test('음성 없는 장면과 빈 카드뉴스를 거절한다', () => {
  const p=plan(); p.scenes[0].narration=''; assert.throws(() => validatePlan(p,1), /음성/);
  const c=plan(); c.cards=[]; assert.throws(() => validatePlan(c,1), /카드/);
});
test('유효한 기획을 보존한다', () => assert.deepEqual(validatePlan(plan(),1),plan()));
test('자막 시각은 실제 음성 정렬값을 사용한다', () => {
  const a={characters:['가','방',' ','디','테','일'],character_start_times_seconds:[0,.1,.2,1,1.2,1.4],character_end_times_seconds:[.1,.2,.3,1.2,1.4,1.7]};
  const c=captionsFromAlignment(a,3); assert.equal(c[0].start,0); assert.equal(c.at(-1).end,1.7); assert.match(c.map(x=>x.text).join(''),/디테일/);
});
test('누락되거나 잘못된 음성 정렬값은 조용히 추정하지 않는다', () => {
  assert.throws(() => captionsFromAlignment(null),/타이밍/);
  assert.throws(() => captionsFromAlignment({characters:['가'],character_start_times_seconds:[2],character_end_times_seconds:[1]}),/타이밍/);
});
test('예상 비용 누락·음수·NaN·예산 초과를 모두 거절한다', () => {
  for(const cost of [null, -1, NaN, 6]) assert.throws(() => checkBudget([cost],5), /비용|한도/);
  assert.equal(checkBudget([.5,.5],2),1);
  assert.throws(() => checkBudget([1],0), /한도/);
});

function fixture(output='both') {
  const calls=[]; const job={id:'test',output,plan:plan(),completed:{},status:'ready'};
  const services={
    save:async()=>{}, stage:async s=>calls.push(s),
    voice:async()=>({file:'voice.mp3',captions:[{start:0,end:1,text:'테스트'}],duration:1.2}),
    clip:async(s,i)=>({file:`clip${i}.mp4`}),
    reel:async()=>({file:'reel.mp4'}), cards:async()=>[{file:'card1.png'}]
  }; return {job,services,calls};
}
test('릴스와 카드뉴스를 한 기획으로 생성하고 완료한다', async () => {
  const {job,services,calls}=fixture(); await produce(job,services);
  assert.equal(job.status,'completed'); assert.equal(job.result.reel.file,'reel.mp4'); assert.equal(job.result.cards.length,1);
  assert.deepEqual(calls,['voice','clips','reel','cards','completed']);
});
test('카드뉴스만 선택하면 음성과 유료 영상을 호출하지 않는다', async () => {
  const {job,services,calls}=fixture('cards'); services.voice=services.clip=services.reel=()=>{throw Error('불필요한 유료 호출');};
  await produce(job,services); assert.equal(job.status,'completed'); assert.deepEqual(calls,['cards','completed']);
});
test('릴스만 선택하면 카드 렌더를 실행하지 않는다', async () => {
  const {job,services}=fixture('reel'); services.cards=()=>{throw Error('카드 호출');}; await produce(job,services); assert.deepEqual(job.result.cards,[]);
});
test('실패한 단계를 재시도할 때 이미 만든 음성과 장면은 재사용한다', async () => {
  const {job,services}=fixture(); services.reel=async()=>{throw Error('렌더 실패');};
  await assert.rejects(produce(job,services),/렌더 실패/); assert.equal(job.status,'failed');
  services.voice=services.clip=()=>{throw Error('중복 과금');}; services.reel=async()=>({file:'reel.mp4'});
  await produce(job,services); assert.equal(job.status,'completed');
});
test('동시에 같은 프로젝트를 실행하지 않는다', async () => {
  const {job,services}=fixture(); job.running=true; await assert.rejects(produce(job,services),/진행/);
});
