// Optional local SQL verification: npm install --prefix .qa --no-save @electric-sql/pglite
// Run from repository root: node portfolio/verify-engagement-sql.mjs
import {PGlite} from '../.qa/node_modules/@electric-sql/pglite/dist/index.js';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();
const project='10000000-0000-4000-8000-000000000001',visitor='20000000-0000-4000-8000-000000000001',comment='30000000-0000-4000-8000-000000000001';
try{
  await db.exec(`create role anon;create role authenticated;
    create table public.projects(id uuid primary key);
    create function public.is_portfolio_admin() returns boolean language sql stable as $$ select coalesce(current_setting('test.is_admin',true),'false')='true' $$;
    insert into public.projects values('${project}');`);
  const sql=await readFile(new URL('./supabase-engagement.sql',import.meta.url),'utf8');
  await db.exec(sql);await db.exec(sql);
  await db.exec('set role anon');
  const setLike=()=>db.query('select public.portfolio_set_like($1,$2,true)',[project,visitor]);
  await setLike();await setLike();
  let result=await db.query('select * from public.portfolio_engagement($1,$2)',[[project],visitor]);
  assert.equal(Number(result.rows[0].likes),1);assert.equal(result.rows[0].liked,true);
  await db.query('select public.portfolio_set_like($1,$2,false)',[project,visitor]);
  result=await db.query('select * from public.portfolio_engagement($1,$2)',[[project],visitor]);assert.equal(Number(result.rows[0].likes),0);
  await assert.rejects(db.query('insert into public.project_likes values($1,$2,now())',[project,visitor]),/permission denied/);
  await assert.rejects(db.query('select visitor_id from public.project_comments'),/permission denied/);
  await assert.rejects(db.query('select public.portfolio_add_comment($1,$2,$3,$4,$5)',[comment,project,visitor,'Name','   ']),/Please enter/);
  await db.query('select public.portfolio_add_comment($1,$2,$3,$4,$5)',[comment,project,visitor,'Name','<script>alert(1)</script>']);
  await db.query('select public.portfolio_add_comment($1,$2,$3,$4,$5)',[comment,project,visitor,'Name','<script>alert(1)</script>']);
  result=await db.query('select * from public.portfolio_comments($1,0)',[project]);assert.equal(result.rows.length,1);assert.ok(!('visitor_id' in result.rows[0]));
  await assert.rejects(db.query('select public.portfolio_add_comment($1,$2,$3,$4,$5)',['30000000-0000-4000-8000-000000000002',project,visitor,'Name','Again']),/wait 30 seconds/);
  await assert.rejects(db.query('delete from public.project_comments where id=$1',[comment]),/permission denied/);
  await db.exec('reset role;set role authenticated');
  result=await db.query('delete from public.project_comments where id=$1 returning id',[comment]);assert.equal(result.rows.length,0);
  await db.exec("set test.is_admin='true'");
  result=await db.query('delete from public.project_comments where id=$1 returning id',[comment]);assert.equal(result.rows.length,1);
  await db.exec('reset role');
  await db.query('select public.portfolio_set_like($1,$2,true)',[project,visitor]);
  await db.query('delete from public.projects where id=$1',[project]);
  result=await db.query('select count(*) from public.project_likes');assert.equal(Number(result.rows[0].count),0);
  console.log('SQL verified: repeatable migration, like/unlike, idempotency, validation, throttling, private visitor IDs, admin-only deletion, cascade cleanup.');
}finally{await db.close();}
