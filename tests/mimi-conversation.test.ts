import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runMimiAgent } from '../src/lib/mimi/agent';

test('live LINE handlers connect persona and allow group follow-ups without wake words', () => {
  const handler = readFileSync('src/lib/line/handler.ts', 'utf8');
  assert.doesNotMatch(handler, /if\s*\(!mentionsMimi\)/);
  assert.match(handler, /speakerTier: senderTier.tier/);
});

test('persona reaches provider for both channels without granting owner finance privileges', async () => {
  for (const audience of ['customer', 'admin'] as const) {
    let prompt = '';
    const result = await runMimiAgent({ userText: 'วันนี้เหนื่อยจัง', siteId: 'main', audience, speakerTier: 'SSS' }, {
      apiKey: 'test', model: 'test', declarations: () => [], execute: async () => ({}),
      fetch: (async (_url, init) => {
        prompt = JSON.parse(String(init?.body)).systemInstruction.parts[0].text;
        return Response.json({ candidates: [{ content: { role: 'model', parts: [{ text: 'พักสักนิดนะคะ' }] } }] });
      }) as typeof fetch,
    });
    assert.equal(result.status, 'answered');
    assert.match(prompt, /Mimi Persona Core/);
    assert.match(prompt, /คุยเล่นได้ตามปกติ/);
    assert.match(prompt, /ห้ามเปิดเผยการเงินภายในกับทุกคน/);
    assert.doesNotMatch(prompt, /สามารถรายงานได้เต็มรูปแบบ/);
    if (audience === 'admin') assert.match(prompt, /คุยกับปะป๊า/);
  }
});

test('fallback model owns subsequent signed tool turns', async () => {
  const urls: string[] = [];
  const result = await runMimiAgent({userText:'ราคา?', audience:'customer', siteId:'main'}, {
    apiKey:'test', model:'gemini-3.5-flash', declarations:()=>[{name:'search_products'}], execute:async()=>({status:'ok'}),
    fetch:(async (url) => {
      urls.push(String(url));
      if(urls.length===1) return new Response('',{status:429});
      if(urls.length===2) return Response.json({candidates:[{content:{role:'model',parts:[{functionCall:{name:'search_products',args:{}},thoughtSignature:'opaque'}]}}]});
      return Response.json({candidates:[{content:{role:'model',parts:[{text:'ยังไม่มีราคาค่ะ'}]}}]});
    }) as typeof fetch,
  });
  assert.equal(result.status,'answered');
  assert.equal(urls.length,3);
  assert.equal(urls[1],urls[2]);
});

test('network failure before model content can fall back without executing tools twice', async () => {
  let calls = 0;
  const result = await runMimiAgent({userText:'สวัสดี', audience:'customer', siteId:'main'}, {
    apiKey:'test', model:'gemini-3.1-flash-lite', declarations:()=>[], execute:async()=>({}),
    fetch:(async () => {
      if (++calls === 1) throw new Error('network');
      return Response.json({candidates:[{content:{role:'model',parts:[{text:'สวัสดีค่ะ'}]}}]});
    }) as typeof fetch,
  });
  assert.equal(result.status,'answered');
  assert.equal(calls,2);
});
