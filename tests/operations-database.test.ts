import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
test("Fase 3 PostgreSQL: jornada completa, invariantes, idempotência e isolamento", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;`,
    );
    for (const f of readdirSync("supabase/migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
    const admin = randomUUID(),
      a = randomUUID(),
      b = randomUUID();
    await db.query(`insert into auth.users values($1),($2),($3)`, [
      admin,
      a,
      b,
    ]);
    await db.query(
      `insert into public.profiles(id,name,email,role)values($1,'Admin','admin@test','admin'),($2,'Motorista A','a@test','driver'),($3,'Motorista B','b@test','driver')`,
      [admin, a, b],
    );
    const uid = async (id: string, role = "authenticated") => {
      await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [
        id,
      ]);
      await db.exec("set role " + role);
    };
    const value = async <T>(sql: string, args: unknown[] = []) =>
      (await db.query<{ v: T }>(sql, args)).rows[0]?.v;
    const rpc = async <T = string>(name: string, p: unknown) =>
      value<T>(`select public.${name}($1::jsonb) as v`, [JSON.stringify(p)]);
    const ctx = () =>
      value<any>("select public.operation_context($1) as v", [rid]);
    let version = 0;
    const command = async (
      action: string,
      extra: Record<string, unknown> = {},
      request_id = randomUUID(),
    ) => {
      const p = {
        route_id: rid,
        request_id,
        expected_version: version,
        action,
        ...extra,
      };
      const result = await rpc<number>("operation_command", p);
      version = Number(result);
      return p;
    };
    await uid(admin);
    await t.test('geocodificação continua reservando créditos depois da Fase 3',async()=>{
      const request=await value<string>("select public.claim_map_request('geocode','address-regression',null) as v");
      assert.ok(request);
      await assert.rejects(value("select public.claim_map_request('geocode','address-regression',null) as v"),/Request in progress/);
      await assert.rejects(value("select private.phase2_claim_map_request('geocode','direct-bypass',null) as v"),/permission denied/);
      await db.query('select public.finish_map_request($1)',[request]);
    });
    const est = await value<string>(
      `insert into public.establishments(name,phone,postal_code,street,number,district,city,state)values('Cliente','62999999999','74000000','Rua teste','10','Centro','Goiânia','GO')returning id as v`,
    );
    const product = await value<string>(
      `insert into public.products(name,unit)values('Tomate','kg')returning id as v`,
    );
    const ids: string[] = [];
    for (let n = 0; n < 12; n++)
      ids.push(
        await rpc("save_order", {
          id: null,
          establishment_id: est,
          delivery_date: "2026-11-11",
          notes: "",
          status: "open",
          expected_updated_at: null,
          route_id: null,
          items: [
            {
              product_id: product,
              name: "Tomate",
              quantity: 10,
              unit: "kg",
              unit_price: 2,
              notes: "",
            },
          ],
        }),
      );
    const rid = await rpc("save_route", {
      id: null,
      driver_id: a,
      route_date: "2026-11-11",
      notes: "",
      status: "released",
      expected_updated_at: null,
      order_ids: ids,
    });
    await t.test(
      "outro motorista e anônimo não consultam nem escrevem; RLS e grants",
      async () => {
        await db.exec("reset role");
        await uid(b);
        await assert.rejects(ctx(), /forbidden/);
        await assert.rejects(command("begin_loading"), /forbidden/);
        assert.equal(
          await value("select count(*)::int as v from public.operation_items"),
          0,
        );
        await db.exec("reset role");
        await uid("", "anon");
        await assert.rejects(ctx(), /permission denied/);
        await db.exec("reset role");
        await uid(a);
        await assert.rejects(
          db.exec("update public.routes set status='completed'"),
          /permission denied/,
        );
        await assert.rejects(
          db.exec("delete from public.operation_issues"),
          /permission denied/,
        );
      },
    );
    let first: any;
    await t.test(
      "carregamento persistido, retomada, parcial e versão obsoleta",
      async () => {
        await command("begin_loading");
        let c = await ctx();
        assert.equal(c.status, "loading");
        assert.equal(c.stops.length, 12);
        assert.equal(c.stops[0].items[0].loaded, null);
        first = c.stops[0];
        await assert.rejects(command("start"), /checklist/);
        await assert.rejects(
          command("load_item", {
            item_id: first.items[0].id,
            quantity: 8,
            reason: "",
          }),
          /Explain/,
        );
        await command("load_item", {
          item_id: first.items[0].id,
          quantity: 8,
          reason: "Mercadoria insuficiente",
        });
        c = await ctx();
        assert.equal(Number(c.stops[0].items[0].loaded), 8);
        assert.equal(Number(c.stops[0].original_items[0].quantity), 10);
        await db.exec('reset role'); await uid(b);
        await assert.rejects(command('uncheck_load',{item_id:first.items[0].id}),/forbidden/);
        await db.exec('reset role'); await uid(a);
        const undo = await command('uncheck_load', {item_id:first.items[0].id});
        assert.equal(await rpc('operation_command', undo), version);
        assert.equal((await ctx()).stops[0].items[0].loaded, null);
        await command('load_item', {item_id:first.items[0].id,quantity:8,reason:'Mercadoria insuficiente'});
        await assert.rejects(
          rpc("operation_command", {
            action: "load_item",
            route_id: rid,
            request_id: randomUUID(),
            expected_version: 0,
            item_id: first.items[0].id,
            quantity: 10,
            reason: "",
          }),
          /Stale/,
        );
        await command("load_group", {
          item_ids: c.stops.slice(1).map((s: any) => s.items[0].id),
          acknowledge: true,
        });
        await assert.rejects(command("start"), /Acknowledge/);
      },
    );
    await t.test(
      "início idempotente e uma única jornada por motorista",
      async () => {
        const p = await command("start", { acknowledge: true });
        assert.equal(await rpc("operation_command", p), version);
        let c = await ctx();
        assert.equal(c.status, "in_progress");
        await assert.rejects(command('uncheck_load',{item_id:first.items[0].id}),/Loading is not editable/);
        assert.ok(c.started_at);
        await assert.rejects(
          rpc("operation_command", { ...p, acknowledge: false }),
          /reused/,
        );
        await assert.rejects(
          command("start", { acknowledge: true }),
          /checklist/,
        );
        await db.exec("reset role");
        await uid(admin);
        await assert.rejects(
          db.query(
            `update public.routes set status='in_progress' where id=$1`,
            [rid],
          ),
          /permission denied/,
        );
        await db.exec("reset role");
        await db
          .query(
            `insert into public.routes(driver_id,route_date,status)values($1,'2026-11-11','in_progress')`,
            [a],
          )
          .then(
            () => assert.fail("unique active journey"),
            (e) => assert.match(e.message, /one_active_journey/),
          );
        await uid(a);
      },
    );
    await t.test(
      "12 paradas: integral, parcial, não realizada; pedido original preservado",
      async () => {
        let c = await ctx();
        await assert.rejects(command("finish"), /Pending/);
        for (let n = 0; n < c.stops.length; n++) {
          const s = c.stops[n];
          const quantity = n === 2 ? 0 : n === 0 ? 8 : 10;
          await command("deliver_item", {
            item_id: s.items[0].id,
            quantity,
            reason:
              n === 2
                ? "Estabelecimento fechado"
                : n === 0
                  ? "Falta no carregamento"
                  : "",
          });
          await command("finish_stop", {
            stop_id: s.id,
            reason:
              n === 2
                ? "Estabelecimento fechado"
                : n === 0
                  ? "Falta no carregamento"
                  : "",
          });
        }
        c = await ctx();
        assert.equal(
          c.stops.filter((s: any) => s.status === "delivered").length,
          10,
        );
        assert.equal(
          c.stops.filter((s: any) => s.status === "partial").length,
          1,
        );
        assert.equal(
          c.stops.filter((s: any) => s.status === "not_delivered").length,
          1,
        );
        assert.equal(Number(c.stops[0].order.total), 20);
        await assert.rejects(
          command("deliver_item", {
            item_id: first.items[0].id,
            quantity: 9,
            reason: "Tentativa posterior",
          }),
          /locked/,
        );
        const stamp = await value(
          "select updated_at::text as v from public.routes where id=$1",
          [rid],
        );
        await assert.rejects(
          db.query("select public.reorder_route($1,$2::uuid[],$3)", [
            rid,
            [...ids].reverse(),
            stamp,
          ]),
          /Only pending/,
        );
      },
    );
    await t.test(
      "correção administrativa auditada, isolamento de item e encerramento imutável",
      async () => {
        await assert.rejects(
          command("reopen_stop", {
            stop_id: first.id,
            reason: "Correção autorizada",
          }),
          /Administrator/,
        );
        await db.exec("reset role");
        await uid(admin);
        await command("reopen_stop", {
          stop_id: first.id,
          reason: "Revisão operacional autorizada",
        });
        await db.exec("reset role");
        await uid(a);
        await command("adjust_item", {
          item_id: first.items[0].id,
          quantity: 10,
          reason: "Complemento físico da mercadoria",
          allow_excess: false,
          name: "",
          unit: "",
        });
        await command("deliver_item", {
          item_id: first.items[0].id,
          quantity: 10,
          reason: "",
        });
        await command("finish_stop", { stop_id: first.id });
        const p = await command("finish");
        assert.equal(await rpc("operation_command", p), version);
        const c = await ctx();
        assert.equal(c.status, "completed");
        assert.ok(c.finished_at);
        assert.ok(c.history.some((h: any) => h.operation === "OP_REOPEN_STOP"));
        await assert.rejects(
          command("load_item", {
            item_id: first.items[0].id,
            quantity: 0,
            reason: "Alteração inválida",
          }),
          /not editable/,
        );
        await db.exec("reset role");
        await uid(admin);
        const before = await value(
          "select count(*)::int as v from public.audit_events",
        );
        await assert.rejects(
          rpc("save_route", {
            id: rid,
            driver_id: a,
            route_date: "2026-11-11",
            notes: "",
            status: "draft",
            expected_updated_at: c.updated_at,
            order_ids: ids,
          }),
          /locked/,
        );
        assert.equal(
          await value("select count(*)::int as v from public.audit_events"),
          before,
        );
      },
    );
    await t.test(
      "unités, substituição, item adicional, excesso explícito, rollback e IDOR",
      async () => {
        await db.exec("reset role");
        await uid(admin);
        const order = await rpc("save_order", {
          id: null,
          establishment_id: est,
          delivery_date: "2026-11-11",
          notes: "",
          status: "open",
          expected_updated_at: null,
          route_id: null,
          items: [
            {
              product_id: product,
              name: "Tomate",
              quantity: 10,
              unit: "kg",
              unit_price: 2,
              notes: "",
            },
            {
              product_id: product,
              name: "Tomate",
              quantity: 1,
              unit: "caixa",
              unit_price: 3,
              notes: "",
            },
          ],
        });
        const other = await rpc("save_route", {
          id: null,
          driver_id: b,
          route_date: "2026-11-11",
          notes: "",
          status: "released",
          expected_updated_at: null,
          order_ids: [order],
        });
        await db.exec("reset role");
        await uid(b);
        let v = 0;
        const send = async (
          action: string,
          extra: Record<string, unknown> = {},
        ) => {
          v = Number(
            await rpc("operation_command", {
              action,
              route_id: other,
              request_id: randomUUID(),
              expected_version: v,
              ...extra,
            }),
          );
        };
        const read = () =>
          value<any>("select public.operation_context($1) as v", [other]);
        await send("begin_loading");
        let c = await read();
        const s = c.stops[0],
          kg = s.items.find((i: any) => i.unit === "kg"),
          box = s.items.find((i: any) => i.unit === "caixa");
        await assert.rejects(
          send("load_group", {
            item_ids: s.items.map((i: any) => i.id),
            acknowledge: true,
          }),
          /Different/,
        );
        assert.ok(
          (await read()).stops[0].items.every((i: any) => i.loaded === null),
        );
        await assert.rejects(
          send("load_item", {
            item_id: first.items[0].id,
            quantity: 1,
            reason: "Item de outro motorista",
          }),
          /Invalid item/,
        );
        await assert.rejects(
          send("load_item", {
            item_id: kg.id,
            quantity: 10.1234,
            reason: "Precisão inválida",
          }),
          /Invalid quantity/,
        );
        await assert.rejects(
          send("load_item", {
            item_id: kg.id,
            quantity: 12,
            reason: "Complemento autorizado",
          }),
          /Explicit/,
        );
        await send("adjust_item", {
          item_id: kg.id,
          quantity: 12,
          reason: "Substituição e excesso conferidos",
          allow_excess: true,
          name: "Tomate cereja",
          unit: "kg",
        });
        await send("load_item", {
          item_id: box.id,
          quantity: 0,
          reason: "Mercadoria indisponível",
        });
        await send("add_item", {
          stop_id: s.id,
          quantity: 2,
          name: "Alface avulsa",
          unit: "un",
          reason: "Inclusão operacional autorizada",
        });
        await send("start", { acknowledge: true });
        await send("serve", { stop_id: s.id });
        await assert.rejects(
          send("deliver_item", {
            item_id: kg.id,
            quantity: 13,
            reason: "Acima da carga",
          }),
          /Correct loaded/,
        );
        c = await read();
        for (const i of c.stops[0].items)
          await send("deliver_item", {
            item_id: i.id,
            quantity: Number(i.loaded),
            reason: "Conferência com ajustes registrada",
          });
        await send("issue", {
          stop_id: s.id,
          item_id: kg.id,
          category: "substitution",
          phase: "delivery",
          reason: "Cliente ciente da substituição",
        });
        await send("finish_stop", {
          stop_id: s.id,
          reason: "Substituição e falta de caixa",
        });
        c = await read();
        assert.equal(c.stops[0].status, "partial");
        assert.equal(Number(c.stops[0].order.total), 23);
        assert.equal(c.stops[0].items.length, 3);
        assert.equal(c.stops[0].original_items.length, 2);
        await send("finish");
        await db.exec("reset role");
        await uid(admin);
        assert.ok((await read()).issues.length >= 4);
      },
    );
    await t.test('envios concorrentes usam versão e perfil inativo perde acesso',async()=>{
      await db.exec('reset role');await uid(admin);
      const order=await rpc('save_order',{id:null,establishment_id:est,delivery_date:'2026-11-11',notes:'',status:'open',expected_updated_at:null,route_id:null,items:[{product_id:product,name:'Tomate',quantity:10,unit:'kg',unit_price:2,notes:''}]});
      const route=await rpc('save_route',{id:null,driver_id:a,route_date:'2026-11-11',notes:'',status:'released',expected_updated_at:null,order_ids:[order]});
      await db.exec('reset role');await uid(a);
      await rpc('operation_command',{action:'begin_loading',route_id:route,request_id:randomUUID(),expected_version:0});
      const c=await value<any>('select public.operation_context($1) as v',[route]);
      const results=await Promise.allSettled([8,10].map(quantity=>rpc('operation_command',{action:'load_item',route_id:route,request_id:randomUUID(),expected_version:1,item_id:c.stops[0].items[0].id,quantity,reason:'Conferência física'})));
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
      assert.equal((await value<any>('select public.operation_context($1) as v',[route])).operation_version,2);
      await db.exec('reset role');await db.query('update public.profiles set active=false where id=$1',[a]);await uid(a);
      await assert.rejects(value('select public.operation_context($1) as v',[route]),/forbidden/);
      assert.equal(await value('select count(*)::int as v from public.route_signals'),0);
    });
  } finally {
    await db.close();
  }
});
