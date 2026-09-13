import test from 'node:test';
import assert from 'node:assert/strict';
import {runMimiAgent} from '../src/lib/mimi/agent';
import {ADMIN_TIERS,resolveAdminTier} from '../src/lib/mimi/admin-tiers';
const input={userText:'มิมิ แล้ว App Capcut ละ',siteId:'main',audience:'admin' as const};
const tool={candidates:[{content:{role:'model',parts:[{functionCall:{name:'search_products',args:{query:'Capcut'},id:'capcut'},thoughtSignature:'signed'}]}}]};
const answer={candidates:[{content:{role:'model',parts:[{text:'ป๊า CapCut 30 วัน ราคา 99 บาท เหลือ 7 สิทธิ์งับ'}]}}]};
test('transient synthesis failure retries same signed model without repeating database work',async()=>{
 let executions=0;const requests:unknown[]=[];const urls:string[]=[];
 const r=await runMimiAgent(input,{apiKey:'test',model:'test-model',declarations:()=>[{name:'search_products'}],execute:async()=>{executions++;return {status:'ok',data:{name:'Capcut',price:99,stock:7}};},fetch:(async(url,init)=>{urls.push(String(url));requests.push(JSON.parse(String(init?.body)));return urls.length===2?new Response('',{status:503}):Response.json(urls.length===1?tool:answer);}) as typeof fetch});
 assert.equal(r.status,'answered');assert.equal(executions,1);assert.equal(urls.length,3);assert.equal(urls[1],urls[2]);assert.deepEqual(requests[1],requests[2]);
});
test('persistent provider failure in staff group does not ask staff to contact admin',async()=>{
 const r=await runMimiAgent(input,{apiKey:'test',model:'test',declarations:()=>[],execute:async()=>({}),fetch:(async()=>new Response('',{status:503})) as typeof fetch});
 assert.equal(r.status,'unavailable');assert.doesNotMatch(r.replyText,/ติดต่อแอดมิน/);
});
test('every registered UID supplies its own communication profile without legacy finance instructions',async()=>{
 for(const profile of Object.values(ADMIN_TIERS)){
  const resolved=resolveAdminTier(profile.userId,'spoofed display name');assert.equal(resolved,profile);
  let prompt='';
  await runMimiAgent({...input,speakerTier:resolved.tier,speakerProfile:resolved},{apiKey:'test',model:'test',declarations:()=>[],execute:async()=>({}),fetch:(async(_url,init)=>{prompt=JSON.parse(String(init?.body)).systemInstruction.parts[0].text;return Response.json(answer);}) as typeof fetch});
  assert.ok(prompt.includes(profile.conversationStyle));assert.ok(prompt.includes(profile.callName));assert.ok(!prompt.includes(profile.userId!));assert.doesNotMatch(prompt,/เปิดเผยข้อมูลเชิงลึกทั้งหมดได้/);
 }
 assert.equal(resolveAdminTier('unknown','ป๊า').tier,'E');
});
import {getMimiCatalogSnapshot} from '../src/lib/mimi/agent-tools';

test('catalog preload is public scoped and omits private inventory and free text',async()=>{
 const r=await getMimiCatalogSnapshot('main',{query:async(sql,params)=>{
  assert.match(sql,/is_published = 1/);assert.ok(params.includes('main'));
  return [{id:'cap',name:'Capcut',selling_price:129,stock:8,account_password:'private',details:'private instructions'}];
 }});
 assert.equal(r.status,'ok');assert.match(JSON.stringify(r),/Capcut/);assert.doesNotMatch(JSON.stringify(r),/private|account_password|details/);
});

test('fresh catalog supports a one-call answer without tool execution',async()=>{
 let calls=0;
 const r=await runMimiAgent({...input,catalogSnapshot:{status:'ok',data:{items:[{name:'Capcut',sellingPrice:99,stock:7}],hasMore:false}}},{
 apiKey:'test',model:'test',declarations:()=>[{name:'search_products'}],execute:async()=>{throw new Error('unexpected duplicate retrieval');},fetch:(async(_url,init)=>{
  calls++;const request=JSON.parse(String(init?.body));assert.match(JSON.stringify(request.contents),/sellingPrice/);return Response.json(answer);
 }) as typeof fetch});
 assert.equal(r.status,'answered');assert.equal(calls,1);assert.deepEqual(r.toolNames,[]);
});
