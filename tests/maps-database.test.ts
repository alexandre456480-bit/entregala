import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
test("Fase 2 PostgreSQL: permissões, versão, confirmação, cache e orçamento", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;`,
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/20261111133155_phase1_core.sql",
        "utf8",
      ),
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/20261111143409_phase2_maps.sql",
        "utf8",
      ),
    );
    const admin = "00000000-0000-4000-8000-000000000001",
      a = "00000000-0000-4000-8000-000000000002",
      b = "00000000-0000-4000-8000-000000000003";
    await db.exec(
      `insert into auth.users values('${admin}'),('${a}'),('${b}');insert into public.profiles(id,name,email,role)values('${admin}','Admin Teste','admin@test.test','admin'),('${a}','Driver A','a@test.test','driver'),('${b}','Driver B','b@test.test','driver');`,
    );
    const uid = async (id: string, role = "authenticated") =>
      db.exec(
        `reset role;select set_config('request.jwt.claim.sub','${id}',false);set role ${role};`,
      );
    const value = async <T>(sql: string, p: unknown[] = []) => {
      const r = await db.query<{ v: T }>(sql, p);
      return r.rows[0]?.v;
    };
    const rpc = async <T = string>(name: string, p: unknown) =>
      value<T>(`select public.${name}($1::jsonb) as v`, [JSON.stringify(p)]);
    await uid(admin);
    const est = await value<string>(
      `insert into public.establishments(name,phone,postal_code,street,number,district,city,state,latitude,longitude)values('Cliente teste','62999999999','74000000','Rua teste','10','Centro','Goiânia','GO',-16.67,-49.25)returning id as v`,
    );
    await t.test(
      "coordenada digitada não é automaticamente confirmada",
      async () => {
        assert.equal(
          await value<string>(
            "select location_status as v from public.establishments where id=$1",
            [est],
          ),
          "review",
        );
        await assert.rejects(
          db.query(
            "update public.establishments set location_status='confirmed' where id=$1",
            [est],
          ),
          /permission denied/,
        );
        const ts = await value<string>(
          "select updated_at::text as v from public.establishments where id=$1",
          [est],
        );
        await db.query("select public.confirm_location($1,-16.67,-49.25,$2)", [
          est,
          ts,
        ]);
        assert.equal(
          await value<string>(
            "select location_status as v from public.establishments where id=$1",
            [est],
          ),
          "confirmed",
        );
      },
    );
    const base = {
      name: "Base teste",
      address: "Rua de teste, Goiânia",
      latitude: -16.66,
      longitude: -49.24,
      notes: "",
      expected_updated_at: null,
    };
    await rpc("save_base", base);
    const order = () =>
      rpc("save_order", {
        id: null,
        establishment_id: est,
        delivery_date: "2026-11-11",
        notes: "",
        status: "open",
        expected_updated_at: null,
        route_id: null,
        items: [
          {
            product_id: null,
            name: "Teste produto",
            quantity: 1,
            unit: "kg",
            unit_price: 1,
            notes: "",
          },
        ],
      });
    const o1 = await order(),
      o2 = await order();
    const r = await rpc("save_route", {
      id: null,
      driver_id: a,
      route_date: "2026-11-11",
      notes: "",
      status: "released",
      expected_updated_at: null,
      order_ids: [o1, o2],
    });
    await t.test(
      "motorista A consulta apenas sua rota; B e anônimo são negados",
      async () => {
        await uid(a);
        assert.ok(await value("select public.map_context($1) as v", [r]));
        await uid(b);
        await assert.rejects(
          db.query("select public.map_context($1)", [r]),
          /forbidden/,
        );
        await uid("", "anon");
        await assert.rejects(
          db.query("select public.map_context($1)", [r]),
          /permission denied/,
        );
      },
    );
    await t.test(
      "motorista não altera base/coordenadas ou conjunto de pedidos",
      async () => {
        await uid(a);
        await assert.rejects(rpc("save_base", base), /Administrator/);
        await assert.rejects(
          db.query("select public.confirm_location($1,-16,-49,now())", [est]),
          /Administrator/,
        );
        const ts = await value<string>(
          "select updated_at::text as v from public.routes where id=$1",
          [r],
        );
        await assert.rejects(
          db.query("select public.reorder_route($1,$2,$3)", [r, [o1], ts]),
          /preserve/,
        );
        await assert.rejects(
          db.query("select public.reorder_route($1,$2,$3)", [r, [o1, o1], ts]),
          /preserve/,
        );
        await assert.rejects(
          db.query(
            "update public.route_stops set order_id=$1 where route_id=$2",
            [o1, r],
          ),
          /permission denied/,
        );
      },
    );
    await t.test(
      "reordenação própria é transacional, auditada, preserva motorista e rejeita versão antiga",
      async () => {
        await uid(a);
        const ts = await value<string>(
          "select updated_at::text as v from public.routes where id=$1",
          [r],
        );
        await db.query("select public.reorder_route($1,$2,$3)", [
          r,
          [o2, o1],
          ts,
        ]);
        assert.equal(
          await value<string>(
            "select order_id::text as v from public.route_stops where route_id=$1 and position=1",
            [r],
          ),
          o2,
        );
        assert.equal(
          await value<string>(
            "select driver_id::text as v from public.routes where id=$1",
            [r],
          ),
          a,
        );
        await assert.rejects(
          db.query("select public.reorder_route($1,$2,$3)", [r, [o1, o2], ts]),
          /Stale/,
        );
        await uid(admin);
        assert.equal(
          await value<number>(
            `select count(*)::int as v from public.audit_events where entity_id=$1 and operation='MANUAL_REORDER'`,
            [r],
          ),
          1,
        );
      },
    );
    let proposal = "";
    let fp = "";
    const result = {
      order_ids: [o1, o2],
      distance: 1000,
      duration: 120,
      geometry: {
        type: "LineString",
        coordinates: [
          [-49.24, -16.66],
          [-49.25, -16.67],
        ],
      },
      legs: [],
    };
    await t.test(
      "somente servidor armazena resultado; proposta não muda sequência até confirmação",
      async () => {
        await uid(a);
        const c = await value<{ fingerprint: string }>(
          "select public.map_context($1) as v",
          [r],
        );
        fp = c.fingerprint;
        await assert.rejects(
          db.query("select public.store_map_result($1,$2,$3,$4)", [
            r,
            fp,
            "optimize",
            JSON.stringify(result),
          ]),
          /permission denied/,
        );
        await uid("", "service_role");
        proposal = await value<string>(
          "select public.store_map_result($1,$2,$3,$4) as v",
          [r, fp, "optimize", JSON.stringify(result)],
        );
        await uid(a);
        assert.equal(
          await value<string>(
            "select order_id::text as v from public.route_stops where route_id=$1 and position=1",
            [r],
          ),
          o2,
        );
        assert.ok(
          await value("select public.cached_map($1,$2) as v", [r, "optimize"]),
        );
      },
    );
    await t.test(
      "aplicar otimização preserva IDs, reutiliza geometria e recusa proposta obsoleta",
      async () => {
        const ts = await value<string>(
          "select updated_at::text as v from public.routes where id=$1",
          [r],
        );
        await db.query("select public.apply_map_proposal($1,$2,$3)", [
          r,
          proposal,
          ts,
        ]);
        assert.equal(
          await value<string>(
            "select order_id::text as v from public.route_stops where route_id=$1 and position=1",
            [r],
          ),
          o1,
        );
        assert.ok(
          await value("select public.cached_map($1,$2) as v", [r, "routing"]),
        );
        await assert.rejects(
          db.query("select public.apply_map_proposal($1,$2,$3)", [
            r,
            proposal,
            ts,
          ]),
          /Stale/,
        );
      },
    );
    await t.test(
      "alterar endereço invalida ponto e cache; origem e coordenadas exigem revisão",
      async () => {
        await uid(admin);
        await db.query(
          "update public.establishments set number='20' where id=$1",
          [est],
        );
        assert.equal(
          await value<string>(
            "select location_status as v from public.establishments where id=$1",
            [est],
          ),
          "review",
        );
        assert.equal(
          await value("select public.cached_map($1,$2) as v", [r, "routing"]),
          null,
        );
      },
    );
    await t.test(
      "lease persistente impede duplicação e limites por usuário/rota são aplicados",
      async () => {
        await uid(a);
        const request = await value<string>(
          "select public.claim_map_request('optimize','scope-test',$1) as v",
          [r],
        );
        await assert.rejects(
          db.query(
            "select public.claim_map_request('optimize','scope-test',$1)",
            [r],
          ),
          /progress/,
        );
        await db.query("select public.finish_map_request($1)", [request]);
        for (let i = 0; i < 3; i++) {
          const id = await value<string>(
            "select public.claim_map_request('optimize',$1,$2) as v",
            ["scope-" + i, r],
          );
          await db.query("select public.finish_map_request($1)", [id]);
        }
        await assert.rejects(
          db.query(
            "select public.claim_map_request('optimize','scope-limit',$1)",
            [r],
          ),
          /limit/,
        );
      },
    );
    await t.test('orçamento diário persistente bloqueia novas chamadas sem exceder o limite',async()=>{
      await db.exec('reset role');await db.exec("insert into private.map_budget(day,credits) values((now() at time zone 'UTC')::date,1799) on conflict(day) do update set credits=1799");await uid(admin);await db.query("select public.claim_map_request('geocode','budget-first')");await assert.rejects(db.query("select public.claim_map_request('geocode','budget-blocked')"),/budget/);await db.exec('reset role');assert.equal(await value<number>("select credits as v from private.map_budget where day=(now() at time zone 'UTC')::date"),1800);
    });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e)
      throw new Error(
        `${e instanceof Error ? e.message : String(e)} [${String(e.code)}]`,
      );
    throw e;
  } finally {
    await db.close();
  }
});
