import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

test('migração preserva unidades históricas e protege categorias e unidades', async () => {
 const db=new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth,public to authenticated,anon,service_role; grant execute on function auth.uid() to authenticated,anon,service_role;`);
  const files=readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort();
  for(const file of files.slice(0,-1))await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));
  const admin=randomUUID(),driver=randomUUID();
  await db.query(`insert into auth.users values($1),($2)`,[admin,driver]);
  await db.query(`insert into public.profiles(id,name,email,role) values($1,'Admin','a@test','admin'),($2,'Driver','d@test','driver')`,[admin,driver]);
  const p=await db.query<{id:string}>(`insert into public.products(name,unit) values('Tomate','kg') returning id`);
  const e=await db.query<{id:string}>(`insert into public.establishments(name,phone,postal_code,street,number,district,city,state) values('Cliente','62999999999','74000000','Rua teste','10','Centro','Goiania','GO') returning id`);
  const o=await db.query<{id:string}>(`insert into public.orders(establishment_id,delivery_date,created_by) values($1,'2026-11-13',$2) returning id`,[e.rows[0].id,admin]);
  await db.query(`insert into public.order_items(order_id,product_id,name,quantity,unit) values($1,$2,'Tomate',10,'kg'),($1,$2,'Tomate',2,'cx')`,[o.rows[0].id,p.rows[0].id]);
  await db.exec(readFileSync('supabase/migrations/'+files[files.length-1],'utf8'));
  assert.deepEqual((await db.query(`select unit,quantity::text from public.order_items order by unit`)).rows,[{unit:'cx',quantity:'2.000'},{unit:'kg',quantity:'10.000'}]);
  assert.deepEqual((await db.query<{abbreviation:string}>(`select abbreviation from public.measurement_units order by abbreviation`)).rows.map(x=>x.abbreviation),['cx','kg','un']);
  await assert.rejects(db.exec(`insert into public.measurement_units(name,abbreviation) values(' KG ','quilo')`),/unique/);
  await assert.rejects(db.exec(`delete from public.measurement_units where abbreviation='kg'`),/Unidade utilizada/);
  await assert.rejects(db.exec(`update public.measurement_units set abbreviation='quilo' where abbreviation='kg'`),/Unidade utilizada/);
  await assert.rejects(db.exec(`delete from public.product_categories where name='Sem categoria'`),/Categoria padrão/);
  await db.exec('set role authenticated');
  await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[driver]);
  await assert.rejects(db.exec(`insert into public.measurement_units(name,abbreviation) values('Litro','l')`),/row-level security/);
  await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[admin]);
  await db.exec(`insert into public.measurement_units(name,abbreviation) values('Litro','l')`);
 } finally {await db.close();}
});
