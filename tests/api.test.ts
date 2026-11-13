import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import handler, { MAX_BODY } from "../server/handler";
import { driverSchema, orderSchema, routeSchema } from "../shared/validation";
import { requireAdmin } from "../server/auth";
import { subtotal } from "../shared/models";
import { publicConfig } from "../shared/public-config.mjs";
test("configuração normaliza painel, ignora placeholder e nunca exporta chave privada", () => {
  const id = "abcdefghijklmnopqrst";
  const key = "sb_publishable_isolated_test_key_not_real";
  const result = publicConfig({
    SUPABASE_ID: id,
    SUPABASE_URL: `https://supabase.com/dashboard/project/${id}`,
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_...",
    SUPABASE_PUBLISHABE_KEY: key,
    SUPABASE_SECRET_KEY: "sb_secret_test_only",
  });
  assert.deepEqual(result, { url: `https://${id}.supabase.co`, key });
  assert.throws(
    () =>
      publicConfig({
        SUPABASE_ID: id,
        SUPABASE_PUBLISHABLE_KEY: "sb_secret_test_only",
      }),
    /CONFIG_PUBLIC_KEY/,
  );
  assert.throws(
    () =>
      publicConfig({
        SUPABASE_ID: id,
        SUPABASE_URL: "https://attacker.example",
        SUPABASE_PUBLISHABLE_KEY: key,
      }),
    /CONFIG_URL/,
  );
  assert.throws(
    () =>
      publicConfig({
        SUPABASE_ID: id,
        SUPABASE_URL: "https://differentprojectrefaa.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: key,
      }),
    /CONFIG_PROJECT_MISMATCH/,
  );
});
test("prévia financeira corresponde ao arredondamento decimal do PostgreSQL", () => {
  assert.equal(subtotal({ quantity: 1.005, unit_price: 1 }), 1.01);
  assert.equal(subtotal({ quantity: 2.675, unit_price: 1 }), 2.68);
  assert.equal(subtotal({ quantity: 2.125, unit_price: 4.5 }), 9.56);
  assert.equal(subtotal({ quantity: 10, unit_price: null }), 0);
  assert.equal(subtotal({ quantity: 1e308, unit_price: 1 }), 0);
});
test("validações do contrato: IDs, campos extras, dinheiro, quantidade e privilégios", () => {
  assert.throws(() =>
    driverSchema.parse({ name: "Teste", email: "invalido", password: "curta" }),
  );
  assert.throws(() =>
    driverSchema.parse({
      name: "Teste",
      email: "t@example.test",
      password: "Senha123456789",
      role: "admin",
    }),
  );
  assert.throws(() => orderSchema.parse({ total: 100 }));
  assert.throws(() => routeSchema.parse({ id: "outro", order_ids: [] }));
  assert.throws(() => requireAdmin({ role: "driver", active: true }));
  assert.throws(() => requireAdmin({ role: "admin", active: false }));
});
test("API HTTP: autenticação, autorização, limites e erros sanitizados", async (t) => {
  const original = {
    url: process.env["SUPABASE_URL"],
    origin: process.env["APP_ORIGIN"],
    key: process.env["SUPABASE_PUBLISHABLE_KEY"],
    nodeEnv: process.env["NODE_ENV"],
  };
  let role = "driver";
  const supabase = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url?.startsWith("/auth/v1/user")) {
      res.end(
        JSON.stringify({
          id: "00000000-0000-4000-8000-000000000001",
          email: "test@example.test",
          aud: "authenticated",
          role: "authenticated",
        }),
      );
    } else if (req.url?.startsWith("/rest/v1/profiles")) {
      res.end(
        JSON.stringify({
          id: "00000000-0000-4000-8000-000000000001",
          name: "Teste isolado",
          email: "test@example.test",
          role,
          active: true,
        }),
      );
    } else {
      res.statusCode = 404;
      res.end("{}");
    }
  });
  await new Promise<void>((r) => supabase.listen(0, "127.0.0.1", r));
  process.env["SUPABASE_URL"] =
    `http://127.0.0.1:${(supabase.address() as AddressInfo).port}`;
  process.env["APP_ORIGIN"] = "http://localhost:4200";
  process.env["NODE_ENV"] = "test";
  process.env["SUPABASE_PUBLISHABLE_KEY"] =
    "sb_publishable_isolated_test_key_not_real";
  const api = createServer((req, res) => {
    void handler(req, res);
  });
  await new Promise<void>((r) => api.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  const post = (
    path = "/api/drivers",
    body = "{}",
    extra: Record<string, string> = {},
  ) =>
    fetch(url + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...extra },
      body,
    });
  try {
    await t.test("sem token recebe 401", async () => {
      const r = await post();
      assert.equal(r.status, 401);
      assert.equal(r.headers.get("cache-control"), "no-store");
      assert.equal((await post('/api/maps/route')).status,401);
      assert.equal((await post('/api/operations')).status,401);
    });
    await t.test(
      "motorista não chama nenhuma operação administrativa",
      async () => {
        for (const path of [
          "/api/drivers",
          "/api/orders",
          "/api/routes",
          "/api/maps/base",
          "/api/maps/location",
          "/api/maps/geocode",
        ])
          assert.equal(
            (await post(path, "{}", { Authorization: "Bearer test.token" }))
              .status,
            403,
          );
      },
    );
    await t.test("CORS nega origem externa", async () => {
      assert.equal(
        (
          await post("/api/orders", "{}", {
            Origin: "https://attacker.example",
          })
        ).status,
        403,
      );
    });
    await t.test('operação malformada e campos comerciais são recusados para motorista',async()=>{
      const r=await post('/api/operations',JSON.stringify({action:'deliver_item',unit_price:1,total:1}),{Authorization:'Bearer test.token'});
      assert.equal(r.status,422);
    });
    await t.test("método desconhecido recebe 405", async () => {
      assert.equal((await fetch(url + "/api/orders")).status, 405);
    });
    role = "admin";
    await t.test(
      "administrador com JSON ou payload malformado recebe 400/422",
      async () => {
        assert.equal(
          (
            await post("/api/orders", "{", {
              Authorization: "Bearer test.token",
            })
          ).status,
          400,
        );
        const r = await post("/api/orders", '{"total":0,"role":"admin"}', {
          Authorization: "Bearer test.token",
        });
        assert.equal(r.status, 422);
        const body = await r.text();
        assert.ok(!body.includes("sb_secret_"));
      },
    );
    await t.test("tamanho e content-type são limitados", async () => {
      assert.equal(
        (
          await post("/api/orders", "x".repeat(MAX_BODY + 1), {
            Authorization: "Bearer test.token",
          })
        ).status,
        413,
      );
      assert.equal(
        (
          await post("/api/orders", "{}", {
            Authorization: "Bearer test.token",
            "Content-Type": "text/plain",
          })
        ).status,
        415,
      );
    });
  } finally {
    await new Promise<void>((r) => api.close(() => r()));
    await new Promise<void>((r) => supabase.close(() => r()));
    if (original.url === undefined) delete process.env["SUPABASE_URL"];
    else process.env["SUPABASE_URL"] = original.url;
    if (original.origin === undefined) delete process.env["APP_ORIGIN"];
    else process.env["APP_ORIGIN"] = original.origin;
    if (original.key === undefined)
      delete process.env["SUPABASE_PUBLISHABLE_KEY"];
    else process.env["SUPABASE_PUBLISHABLE_KEY"] = original.key;
    if (original.nodeEnv === undefined) delete process.env["NODE_ENV"];
    else process.env["NODE_ENV"] = original.nodeEnv;
  }
});
