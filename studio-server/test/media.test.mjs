import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {mkdtemp,writeFile,stat} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {assDocument,cardPng,zipFiles,wrap,command,sampleClip,silentWav,normalizeClip,renderReel} from '../media.mjs';
test('자막의 ASS 명령 삽입을 제거하고 실제 시각을 유지한다',()=>{
  const text=assDocument([{start:1.25,end:2.57,text:'테스트 {\\pos(0,0)}'}]);assert.match(text,/0:00:01.25,0:00:02.57/);assert.equal(text.includes('{\\pos'),false);
});
test('한글 문구와 XML 문자를 포함한 카드뉴스를 PNG로 출력한다',async()=>{
  const image=await sharp({create:{width:30,height:30,channels:3,background:'#71826a'}}).png().toBuffer();
  const b=await cardPng(image,{title:'새로운 계절 & <스타일>',body:'사진에서 시작되는 이야기'},'kids',0,5,true);const m=await sharp(b).metadata();assert.equal(m.width,1080);assert.equal(m.height,1350);assert.equal(m.format,'png');
});
test('ZIP 엔트리와 파일 본문을 손상 없이 만든다',async()=>{
  const b=await zipFiles([{name:'card-01.png',data:Buffer.from('hello')}]);assert.equal(b.readUInt32LE(0),0x04034b50);assert.ok(b.includes(Buffer.from('hello')));assert.equal(b.readUInt32LE(b.length-22),0x06054b50);assert.deepEqual(wrap('가나다라마바사',3),['가나다','라마바','사']);
});
test('실제 FFmpeg로 장면·음성 트랙·한국어 자막을 합쳐 MP4를 만든다',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'buyest-render-test-'));
  await writeFile(path.join(dir,'photo.jpg'),await sharp({create:{width:400,height:500,channels:3,background:'#71826a'}}).jpeg().toBuffer());
  await sampleClip(dir,'photo.jpg','sample.mp4',1);
  await normalizeClip(dir,'sample.mp4','clip.mp4',1);
  await silentWav(dir,'voice.wav',1);
  const job={demo:true,completed:{clips:[{file:'clip.mp4'}],voice:{segments:[{file:'voice.wav',duration:1}],captions:[{start:0,end:1,text:'코덱스 렌더 테스트'}]}}};
  const result=await renderReel(dir,job);assert.equal(result.file,'reel.mp4');assert.ok((await stat(path.join(dir,result.file))).size>1000);
});
test('미디어 실행 실패와 파일 누락을 오류로 전달한다',async()=>{
  await assert.rejects(command('buyest-command-does-not-exist',[]),/찾지/);
  await assert.rejects(command(process.execPath,['-e','process.exit(1)']),/실패/);
});
