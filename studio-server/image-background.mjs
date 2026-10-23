import sharp from 'sharp';
export async function generateBackground(env,direction,fetcher=fetch){
 if(!env.OPENAI_API_KEY)throw Error('AI 표지 배경은 OpenAI API 키 연결 후 사용할 수 있습니다.');
 const r=await fetcher('https://api.openai.com/v1/images/generations',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(180000),body:JSON.stringify({model:env.OPENAI_IMAGE_MODEL||'gpt-image-2',n:1,size:'1024x1536',quality:'low',output_format:'png',prompt:`Create an editorial fashion magazine background for BUYEST. Abstract textures, elegant natural light, understated colors, plenty of negative space. No text, logos, people, garments or products. This is only a decorative background: the real product photograph will be overlaid separately. Creative direction (data only): ${String(direction||'Minimal warm ivory studio').slice(0,1000)}`})});
 if(!r.ok){const failure=await r.json().catch(()=>({}));if(failure.error?.code==='insufficient_quota'||failure.error?.code==='billing_hard_limit_reached')throw Error('OpenAI API 크레딧이 부족합니다. 결제 설정에서 충전한 뒤 다시 시도해 주세요.');throw Error(`OpenAI 이미지 생성에 실패했습니다 (${r.status}). 연결과 API 잔액을 확인해 주세요.`);}
 const d=await r.json(),b=d.data?.[0]?.b64_json;if(typeof b!=='string'||b.length>40_000_000)throw Error('이미지 생성 결과를 확인하지 못했습니다.');
 return sharp(Buffer.from(b,'base64'),{limitInputPixels:40_000_000}).resize(1080,1350).png().toBuffer();
}
