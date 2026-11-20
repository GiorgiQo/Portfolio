import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window={PORTFOLIO_CONFIG:{supabaseUrl:'https://example.supabase.co',supabaseAnonKey:'test-public-key'}};
const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)};
const api=await import('./engagement-api.js');
test('Browser identifier persists and is a UUID',()=>{
  const id=api.visitorId();assert.match(id,/^[a-f0-9-]{36}$/);assert.equal(api.visitorId(),id);assert.equal(memory.get('portfolio-visitor'),id);
});
test('Likes send explicit state so a retry cannot toggle twice',async()=>{
  const calls=[];globalThis.fetch=async(url,options)=>{calls.push(JSON.parse(options.body));return new Response(null,{status:204});};
  await api.setLike('project',true);await api.setLike('project',true);
  assert.deepEqual(calls[0],calls[1]);assert.equal(calls[0].p_liked,true);
});
test('Whitespace-only comments are rejected without a network request',()=>{
  globalThis.fetch=()=>{throw Error('Unexpected fetch');};
  assert.throws(()=>api.addComment('project','Name','   ','submission'),/Enter your name/);
});
test('Comments preserve retry ID and trim text',async()=>{
  globalThis.fetch=async(url,options)=>{const body=JSON.parse(options.body);assert.equal(body.p_id,'retry-id');assert.equal(body.p_name,'Name');assert.equal(body.p_body,'Hello');return new Response('"retry-id"');};
  assert.equal(await api.addComment('project',' Name ',' Hello ','retry-id'),'retry-id');
});
test('Counts are fetched in bounded batches',async()=>{
  let sizes=[];globalThis.fetch=async(url,options)=>{sizes.push(JSON.parse(options.body).p_projects.length);return new Response('[]');};
  await api.getEngagement(Array.from({length:201},(_,i)=>String(i)));assert.deepEqual(sizes,[100,100,1]);
});
