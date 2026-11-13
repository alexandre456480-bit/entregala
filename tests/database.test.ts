import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// Isolated PostgreSQL engine. Supabase auth schema/roles are reproduced; no remote data.
test("PostgreSQL: fluxo operacional, integridade e RLS", async (t) => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth,public to authenticated,anon,service_role; grant execute on function auth.uid() to authenticated,anon,service_role;`);
  await db.exec(
    readFileSync("supabase/migrations/20261111133155_phase1_core.sql", "utf8"),
  );
  const admin = "00000000-0000-4000-8000-000000000001",
    a = "00000000-0000-4000-8000-000000000002",
    b = "00000000-0000-4000-8000-000000000003";
  await db.exec(
    `insert into auth.users(id,email,email_confirmed_at) values('${admin}','admin@example.test',now()),('${a}','a@example.test',now()),('${b}','b@example.test',now());`,
  );
  await t.test(
    "SQL manual do primeiro administrador e conferência são executáveis",
    async () => {
      const setup = readFileSync(
        "supabase/setup/02_primeiro_administrador.sql",
        "utf8",
      );
      await assert.rejects(db.exec(setup), /Substitua/);
      await db.exec("rollback");
      await db.exec(
        setup
          .replaceAll("'SUBSTITUA_PELO_SEU_EMAIL'", "'admin@example.test'")
          .replaceAll("'SUBSTITUA_PELO_SEU_NOME'", "'Admin Teste'"),
      );
      await db.exec(
        readFileSync("supabase/setup/03_conferir_instalacao.sql", "utf8"),
      );
      await assert.rejects(
        db.exec(
          setup
            .replaceAll("'SUBSTITUA_PELO_SEU_EMAIL'", "'admin@example.test'")
            .replaceAll("'SUBSTITUA_PELO_SEU_NOME'", "'Admin Teste'"),
        ),
        /Já existe administrador/,
      );
      await db.exec("rollback");
    },
  );
  await db.exec(
    `insert into public.profiles(id,name,email,role) values('${a}','Motorista A Teste','a@example.test','driver'),('${b}','Motorista B Teste','b@example.test','driver');`,
  );
  const uid = async (id: string, role = "authenticated") => {
    await db.exec(
      `reset role; select set_config('request.jwt.claim.sub','${id}',false); set role ${role};`,
    );
  };
  const scalar = async <T>(sql: string, params: unknown[] = []) => {
    const r = await db.query<{ value: T }>(sql, params);
    return r.rows[0]?.value;
  };
  const rpc = async (name: string, payload: unknown) =>
    scalar<string>(`select public.${name}($1::jsonb) as value`, [
      JSON.stringify(payload),
    ]);
  let est = "",
    est2 = "",
    product = "",
    order1 = "",
    order2 = "",
    route1 = "",
    route2 = "";
  const date = "2026-11-11";
  const orderPayload = (establishment_id: string) => ({
    id: null,
    establishment_id,
    delivery_date: date,
    notes: "Teste isolado",
    status: "open",
    expected_updated_at: null,
    route_id: null,
    items: [
      {
        product_id: product,
        name: "Tomate teste",
        quantity: 2.125,
        unit: "kg",
        unit_price: 4.5,
        notes: "",
      },
      {
        product_id: null,
        name: "Alface teste",
        quantity: 2,
        unit: "unidade",
        unit_price: null,
        notes: "",
      },
    ],
  });
  const routePayload = (driver_id: string, order_ids: string[]) => ({
    id: null,
    driver_id,
    route_date: date,
    status: "draft",
    notes: "",
    expected_updated_at: null,
    order_ids,
  });
  await t.test("anônimo não acessa dados ou funções", async () => {
    await uid("", "anon");
    await assert.rejects(
      db.query("select * from public.orders"),
      /permission denied/,
    );
    await assert.rejects(rpc("save_order", {}), /permission denied/);
  });
  await t.test("administrador cadastra cliente e catálogo", async () => {
    await uid(admin);
    est = await scalar<string>(
      `insert into public.establishments(name,phone,postal_code,street,number,district,city,state) values('Cliente Teste A','62999999999','74000000','Rua Teste','10','Centro','Goiânia','GO') returning id as value`,
    );
    est2 = await scalar<string>(
      `insert into public.establishments(name,phone,postal_code,street,number,district,city,state) values('Cliente Teste B','62999999999','74000000','Rua Teste','20','Centro','Goiânia','GO') returning id as value`,
    );
    product = await scalar<string>(
      `insert into public.products(name,unit) values('Tomate teste','kg') returning id as value`,
    );
    assert.ok(est && product);
  });
  await t.test("pedido transacional calcula dinheiro no servidor", async () => {
    order1 = await rpc("save_order", orderPayload(est));
    order2 = await rpc("save_order", orderPayload(est2));
    assert.equal(
      await scalar<string>(
        "select total::text as value from public.orders where id=$1",
        [order1],
      ),
      "9.56",
    );
    assert.equal(
      await scalar<number>(
        "select count(*)::int as value from public.order_items where order_id=$1",
        [order1],
      ),
      2,
    );
  });
  await t.test(
    "edição mantém histórico do nome e recalcula total",
    async () => {
      await db.query(
        `update public.products set name='Tomate renomeado' where id=$1`,
        [product],
      );
      assert.equal(
        await scalar<string>(
          "select name as value from public.order_items where order_id=$1 and product_id=$2",
          [order1, product],
        ),
        "Tomate teste",
      );
      const timestamp = await scalar<string>(
        "select updated_at::text as value from public.orders where id=$1",
        [order1],
      );
      await rpc("save_order", {
        ...orderPayload(est),
        id: order1,
        expected_updated_at: timestamp,
        items: [
          {
            product_id: product,
            name: "Tomate teste",
            quantity: 3,
            unit: "kg",
            unit_price: 5,
            notes: "",
          },
        ],
      });
      assert.equal(
        await scalar<string>(
          "select total::text as value from public.orders where id=$1",
          [order1],
        ),
        "15.00",
      );
    },
  );
  await t.test(
    "falha em item desfaz pedido inteiro e edição anterior",
    async () => {
      const count = await scalar<number>(
        "select count(*)::int as value from public.orders",
      );
      await assert.rejects(
        rpc("save_order", {
          ...orderPayload(est),
          items: [{ ...orderPayload(est).items[0], quantity: -2 }],
        }),
      );
      assert.equal(
        await scalar<number>(
          "select count(*)::int as value from public.orders",
        ),
        count,
      );
      const timestamp = await scalar<string>(
        "select updated_at::text as value from public.orders where id=$1",
        [order1],
      );
      await assert.rejects(
        rpc("save_order", {
          ...orderPayload(est),
          id: order1,
          expected_updated_at: timestamp,
          items: [{ ...orderPayload(est).items[0], unit_price: -1 }],
        }),
      );
      assert.equal(
        await scalar<string>(
          "select total::text as value from public.orders where id=$1",
          [order1],
        ),
        "15.00",
      );
    },
  );
  await t.test(
    "totais, campos extras, precisão e edição obsoleta recusados",
    async () => {
      await assert.rejects(
        rpc("save_order", { ...orderPayload(est), total: 0 }),
        /Invalid fields/,
      );
      await assert.rejects(
        rpc("save_order", {
          ...orderPayload(est),
          items: [{ ...orderPayload(est).items[0], quantity: 1.0001 }],
        }),
        /Precision invalid/,
      );
      await assert.rejects(
        rpc("save_order", {
          ...orderPayload(est),
          id: order1,
          expected_updated_at: null,
        }),
        /Stale order/,
      );
    },
  );
  await t.test("rotas em rascunho não aparecem para motorista", async () => {
    route1 = await rpc("save_route", routePayload(a, [order1]));
    route2 = await rpc("save_route", routePayload(b, [order2]));
    await uid(a);
    assert.equal(
      await scalar<number>("select count(*)::int as value from public.routes"),
      0,
    );
    assert.equal(
      await scalar<number>("select count(*)::int as value from public.orders"),
      0,
    );
    await uid(admin);
  });
  await t.test("atribuição dupla e data incompatível bloqueadas", async () => {
    await assert.rejects(
      rpc("save_route", routePayload(b, [order1])),
      /already assigned/,
    );
    await assert.rejects(
      rpc("save_route", {
        ...routePayload(b, [order2]),
        route_date: "2026-11-12",
      }),
    );
  });
  await t.test(
    "cadastro no contexto da rota é atômico, reordenação e remoção funcionam",
    async () => {
      const direct = await rpc("save_order", {
        ...orderPayload(est),
        route_id: route1,
      });
      let timestamp = await scalar<string>(
        "select updated_at::text as value from public.routes where id=$1",
        [route1],
      );
      await rpc("save_route", {
        ...routePayload(a, [direct, order1]),
        id: route1,
        expected_updated_at: timestamp,
      });
      assert.equal(
        await scalar<string>(
          "select order_id::text as value from public.route_stops where route_id=$1 order by position limit 1",
          [route1],
        ),
        direct,
      );
      timestamp = await scalar<string>(
        "select updated_at::text as value from public.routes where id=$1",
        [route1],
      );
      await rpc("save_route", {
        ...routePayload(a, [order1]),
        id: route1,
        expected_updated_at: timestamp,
      });
      assert.equal(
        await scalar<number>(
          "select count(*)::int as value from public.orders where id=$1",
          [direct],
        ),
        1,
      );
      const before = await scalar<number>(
        "select count(*)::int as value from public.orders",
      );
      await assert.rejects(
        rpc("save_order", {
          ...orderPayload(est),
          route_id: "00000000-0000-4000-8000-000000000099",
        }),
      );
      assert.equal(
        await scalar<number>(
          "select count(*)::int as value from public.orders",
        ),
        before,
      );
    },
  );
  await t.test(
    "liberação registra auditoria e publica somente para seu motorista",
    async () => {
      for (const [id, driver, oid] of [
        [route1, a, order1],
        [route2, b, order2],
      ]) {
        const timestamp = await scalar<string>(
          "select updated_at::text as value from public.routes where id=$1",
          [id],
        );
        await rpc("save_route", {
          ...routePayload(driver, [oid]),
          id,
          expected_updated_at: timestamp,
          status: "released",
        });
      }
      assert.ok(
        await scalar<number>(
          `select count(*)::int as value from public.audit_events where entity='routes' and changes->'status'->>'after'='released'`,
        ),
      );
      await uid(a);
      assert.equal(
        await scalar<number>(
          "select count(*)::int as value from public.routes",
        ),
        1,
      );
      assert.equal(
        await scalar<number>(
          "select count(*)::int as value from public.orders",
        ),
        1,
      );
      assert.equal(
        await scalar<number>(
          "select count(*)::int as value from public.establishments",
        ),
        1,
      );
      assert.equal(
        await scalar<number>(
          "select count(*)::int as value from public.order_items",
        ),
        1,
      );
      assert.equal(
        await scalar<number>(
          "select count(*)::int as value from public.orders where id=$1",
          [order2],
        ),
        0,
      );
      assert.equal(
        await scalar<number>(
          "select count(*)::int as value from public.routes where id=$1",
          [route2],
        ),
        0,
      );
      await uid(b);
      assert.equal(
        await scalar<number>(
          "select count(*)::int as value from public.orders where id=$1",
          [order1],
        ),
        0,
      );
    },
  );
  await t.test(
    "motorista não altera privilégios, cadastro ou rotas por SQL/RPC",
    async () => {
      await uid(a);
      await assert.rejects(
        db.query(`update public.profiles set role='admin' where id=$1`, [a]),
        /permission denied/,
      );
      await assert.rejects(
        db.query(`update public.profiles set active=true where id=$1`, [a]),
        /permission denied/,
      );
      const blocked = await db.query(
        `update public.establishments set name='Ataque' where id=$1 returning id`,
        [est],
      );
      assert.equal(blocked.rows.length, 0);
      assert.equal(
        await scalar<string>(
          "select name as value from public.establishments where id=$1",
          [est],
        ),
        "Cliente Teste A",
      );
      await assert.rejects(
        rpc("save_route", routePayload(a, [order2])),
        /Administrator required/,
      );
      await assert.rejects(
        rpc("save_order", orderPayload(est)),
        /Administrator required/,
      );
      await assert.rejects(
        db.query("select public.set_driver_active($1,false)", [b]),
        /Administrator required/,
      );
    },
  );
  await t.test("bloqueio de conta vale para token já emitido", async () => {
    await uid(admin);
    await db.query("select public.set_driver_active($1,false)", [a]);
    await uid(a);
    assert.equal(
      await scalar<number>("select count(*)::int as value from public.orders"),
      0,
    );
    assert.equal(
      await scalar<number>("select count(*)::int as value from public.routes"),
      0,
    );
    assert.equal(
      await scalar<number>(
        "select count(*)::int as value from public.profiles",
      ),
      0,
    );
  });
  await t.test(
    "rota liberada, integridade referencial e gravação direta protegidas",
    async () => {
      await uid(admin);
      const timestamp = await scalar<string>(
        "select updated_at::text as value from public.routes where id=$1",
        [route2],
      );
      await assert.rejects(
        rpc("save_route", {
          ...routePayload(b, [order2]),
          id: route2,
          expected_updated_at: timestamp,
        }),
        /read-only/,
      );
      const orderTimestamp = await scalar<string>(
        "select updated_at::text as value from public.orders where id=$1",
        [order2],
      );
      await assert.rejects(
        rpc("save_order", {
          ...orderPayload(est2),
          id: order2,
          expected_updated_at: orderTimestamp,
        }),
        /Assigned order/,
      );
      await assert.rejects(
        db.query("delete from public.establishments where id=$1", [est]),
        /permission denied/,
      );
      await assert.rejects(
        db.query("update public.orders set total=0 where id=$1", [order2]),
        /permission denied/,
      );
      await db.exec("reset role");
      await assert.rejects(
        db.query("delete from public.establishments where id=$1", [est]),
        /foreign key/,
      );
    },
  );
  await t.test("rate limit persistente e RLS em todas as tabelas", async () => {
    await uid(admin);
    for (let i = 0; i < 12; i++)
      await db.query("select public.claim_driver_provision()");
    await assert.rejects(
      db.query("select public.claim_driver_provision()"),
      /rate limit/,
    );
    await db.exec("reset role");
    assert.equal(
      await scalar<number>(
        `select count(*)::int as value from pg_tables where schemaname='public' and not rowsecurity`,
      ),
      0,
    );
    assert.equal(
      await scalar<number>(
        `select count(*)::int as value from public.audit_events where changes::text like '%example.test%'`,
      ),
      0,
    );
  });
  await db.close();
});
