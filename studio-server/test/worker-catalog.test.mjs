import {test} from 'node:test';
import assert from 'node:assert/strict';
import {searchProducts,importProducts} from '../../studio-worker/catalog.mjs';
const fake=async(url,options)=>{assert.equal(url,'https://buyest.co.kr/product_card_api.php');const {lines}=JSON.parse(options.body);return Response.json({ok:true,results:lines.map(query=>({matches:[{pid:new URL(query).searchParams.get('pid'),name:'키즈 패딩',brand:'AI RIDERS',price:709000,image:'data:image/jpeg;base64,AAAA'}]}))});};
test('운영 상품 API는 카테고리를 포함한 상세 링크 세 개를 정확히 조회한다',async()=>{const ids=['85917','85936','85938'];const g=await searchProducts(ids.map(id=>`https://buyest.co.kr/product_detail.php?pid=${id}&category_id=10`).join('\n'),fake);assert.deepEqual(g.map(x=>x.candidates[0].pid),ids);assert.ok(g.every(x=>!x.error));const d=await importProducts(ids,fake);assert.equal(d.images.length,3);assert.ok(d.images.every(x=>x.data.startsWith('data:image/jpeg;base64,')));});
test('상품 API 장애를 상품 없음으로 표시하지 않는다',async()=>{await assert.rejects(searchProducts('ABC',async()=>new Response('',{status:403})),/403/);});
test('운영 조회는 외부 링크와 잘못된 상품 ID를 거절한다',async()=>{await assert.rejects(searchProducts('https://example.com/product_detail.php?pid=1',fake));await assert.rejects(importProducts(['1 OR 1=1'],fake));});
