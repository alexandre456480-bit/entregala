// Isolated PostgreSQL behind the real UI. No records are sent to the hosted project.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import type { Page } from "@playwright/test";
import { fixtures, aid, did, eid, pid, rid } from "./app.fixture";
import { today } from "../../shared/models";
import { operationSchema } from "../../server/validation/operations";
export async function operationDatabase(count = 12) {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;`,
  );
  for (const f of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
  await db.query("insert into auth.users values($1),($2)", [aid, did]);
  await db.query(
    `insert into public.profiles(id,name,email,role)values($1,'Admin Teste','admin@test','admin'),($2,'Motorista Teste','driver@test','driver')`,
    [aid, did],
  );
  await db.query(
    `insert into public.establishments(id,name,phone,postal_code,street,number,district,city,state)values($1,'Cliente operacional','62999999999','74000000','Rua teste','10','Bueno','Goiânia','GO')`,
    [eid],
  );
  await db.query(
    `insert into public.products(id,name,unit)values($1,'Tomate operacional','kg')`,
    [pid],
  );
  await db.query(
    `insert into public.routes(id,driver_id,route_date,status)values($1,$2,$3,'draft')`,
    [rid, did, today()],
  );
  for (let n = 0; n < count; n++) {
    const o = (
      await db.query<{ id: string }>(
        `insert into public.orders(establishment_id,delivery_date,created_by)values($1,$2,$3)returning id`,
        [eid, today(), aid],
      )
    ).rows[0].id;
    await db.query(
      `insert into public.order_items(order_id,product_id,name,quantity,unit,unit_price)values($1,$2,'Tomate operacional',10,'kg',2)`,
      [o, pid],
    );
    await db.query(
      `insert into public.route_stops(route_id,order_id,position)values($1,$2,$3)`,
      [rid, o, n + 1],
    );
  }
  await db.query(`update public.routes set status='released' where id=$1`, [
    rid,
  ]);
  let failNext = false;
  let loseResponse = false;
  const requests: Record<string, unknown>[] = [];
  async function attach(page: Page, role: "driver" | "admin") {
    await fixtures(page, role);
    await page.routeWebSocket("**/realtime/**", (ws) => ws.close());
    await page.route("**/rest/v1/routes?**", async (route) => {
      const data = await db.transaction(async (tx) => {
        await tx.query(`select set_config('request.jwt.claim.sub',$1,true)`, [
          role === "admin" ? aid : did,
        ]);
        await tx.exec("set local role authenticated");
        const rows = (
          await tx.query<{ v: any }>(
            "select public.operation_context(id) as v from public.routes",
          )
        ).rows.map((r) => r.v);
        return rows
          .filter(
            (c) =>
              !new URL(route.request().url()).searchParams.has("status") ||
              c.status === "in_progress",
          )
          .map((c) => ({
            ...c,
            profiles: { id: did, name: "Motorista Teste" },
            route_stops: c.stops.map((s: any) => ({
              ...s,
              orders: {
                ...s.order,
                establishments: s.establishment,
                order_items: s.original_items,
              },
            })),
          }));
      });
      await route.fulfill({ json: data });
    });
    await page.route("**/rest/v1/rpc/operation_context", async (route) => {
      const p = route.request().postDataJSON();
      const result = await db.transaction(async (tx) => {
        await tx.query(`select set_config('request.jwt.claim.sub',$1,true)`, [
          role === "admin" ? aid : did,
        ]);
        await tx.exec("set local role authenticated");
        return (
          await tx.query<{ v: any }>(
            "select public.operation_context($1) as v",
            [p.target],
          )
        ).rows[0].v;
      });
      await route.fulfill({ json: result });
    });
    await page.route("**/api/operations", async (route) => {
      if (failNext) {
        failNext = false;
        await route.abort("failed");
        return;
      }
      const p = operationSchema.parse(route.request().postDataJSON());
      requests.push(p);
      try {
        const result = await db.transaction(async (tx) => {
          await tx.query(`select set_config('request.jwt.claim.sub',$1,true)`, [
            role === "admin" ? aid : did,
          ]);
          await tx.exec("set local role authenticated");
          return (
            await tx.query<{ v: number }>(
              "select public.operation_command($1::jsonb) as v",
              [JSON.stringify(p)],
            )
          ).rows[0].v;
        });
        if (loseResponse) {
          loseResponse = false;
          await route.abort("failed");
          return;
        }
        await route.fulfill({ json: { data: result } });
      } catch {
        await route.fulfill({
          status: 422,
          json: {
            error: { message: "Revise a conferência e a situação da jornada." },
          },
        });
      }
    });
  }
  return {
    db,
    attach,
    requests,
    fail: () => {
      failNext = true;
    },
    lose: () => {
      loseResponse = true;
    },
    close: () => db.close(),
  };
}
