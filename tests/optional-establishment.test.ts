import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('cadastro vazio, validação de campos preenchidos e permissões', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,public to authenticated,anon,service_role; grant execute on function auth.uid() to authenticated,anon,service_role;`);
    for (const f of readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort())
      await db.exec(readFileSync('supabase/migrations/' + f, 'utf8'));
    await db.exec(`insert into auth.users values('00000000-0000-4000-8000-000000000001');
      insert into public.profiles(id,name,email,role) values('00000000-0000-4000-8000-000000000001','Admin','admin@test','admin');
      select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false); set role authenticated;`);
    const fields = `name,phone,postal_code,street,number,district,city,state`;
    const values = `'','','','','','','',''`;
    const result = await db.query<{id:string}>(`insert into public.establishments(${fields}) values(${values}) returning id`);
    const id = result.rows[0].id;
    await db.query(`update public.establishments set trade_name='Nome antigo' where id=$1`, [id]);
    await db.query(`update public.establishments set name='Cliente' where id=$1`, [id]);
    const saved = await db.query<{trade_name:string}>(`select trade_name from public.establishments where id=$1`, [id]);
    assert.equal(saved.rows[0].trade_name, 'Nome antigo');
    await assert.rejects(db.query(`update public.establishments set postal_code='123' where id=$1`, [id]), /check constraint/);
    await assert.rejects(db.query(`update public.establishments set state='XX' where id=$1`, [id]), /check constraint/);
    await db.exec('reset role; set role anon');
    await assert.rejects(db.exec(`insert into public.establishments(${fields}) values(${values})`), /permission denied/);
  } finally { await db.close(); }
});
