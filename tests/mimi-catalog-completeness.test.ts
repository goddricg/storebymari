import test from 'node:test';import assert from 'node:assert/strict';
import {getMimiCatalogSnapshot} from '../src/lib/mimi/agent-tools';
test('catalog includes later-page variants with their own prices and stock',async()=>{
 const rows=Array.from({length:54},(_,i)=>({id:`p${i}`,name:`Product ${i}`,selling_price:100,stock:1}));
 rows[0]={id:'acc',name:'ACC WeTv 30 Day',selling_price:68,stock:0};
 rows[52]={id:'share4',name:'WeTv 30 Day ( หาร4 )',selling_price:17,stock:4};
 rows[53]={id:'share2',name:'WeTv 30 Day หาร 2',selling_price:36,stock:9};
 const offsets:number[]=[];
 const result=await getMimiCatalogSnapshot('main',{query:async(_sql,params)=>{const offset=Number(params.at(-1));offsets.push(offset);return rows.slice(offset,offset+31);}});
 const data=result.data as {items:Array<{id:string;sellingPrice:number;stock:number}>;complete:boolean;hasMore:boolean};
 assert.deepEqual(offsets,[0,30]);assert.equal(result.source,'mysql_live');assert.equal(data.items.length,54);assert.equal(data.complete,true);assert.equal(data.hasMore,false);
 assert.deepEqual(data.items.filter(x=>x.id==='share4').map(x=>[x.sellingPrice,x.stock]),[[17,4]]);
});
test('oversized catalogs stay explicitly incomplete and bounded',async()=>{
 const r=await getMimiCatalogSnapshot('main',{query:async(_sql,params)=>Array.from({length:31},(_,i)=>({id:`p${Number(params.at(-1))+i}`,name:'App',selling_price:10,stock:1}))});
 const d=r.data as {items:unknown[];complete:boolean;hasMore:boolean;nextOffset:number};
 assert.equal(d.items.length,120);assert.equal(d.complete,false);assert.equal(d.hasMore,true);assert.equal(d.nextOffset,120);
});
import {getMimiAgentPersonality} from '../src/lib/mimi/personality';
test('staff persona preserves configured feminine endings when replacing customer names',()=>{
 const p=getMimiAgentPersonality('admin','SSS');assert.match(p,/ลงท้ายด้วย คะ/);assert.doesNotMatch(p,/เรียกลูกค้าว่า/);
});
