import { expect, type Page } from "@playwright/test";
import { today } from "../../shared/models";
export const aid = "00000000-0000-4000-8000-000000000001",
  did = "00000000-0000-4000-8000-000000000002",
  eid = "00000000-0000-4000-8000-000000000003",
  pid = "00000000-0000-4000-8000-000000000004",
  oid = "00000000-0000-4000-8000-000000000005",
  rid = "00000000-0000-4000-8000-000000000006";
export const timestamp = "2026-11-11T10:00:00+00:00";
export async function fixtures(page: Page, role: "admin" | "driver") {
  // Only intercepted test browser traffic. Never inserts demo records into Supabase.
  const user = {
    id: role === "admin" ? aid : did,
    email: "isolado@example.test",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: {},
    user_metadata: {},
    created_at: timestamp,
  };
  const profile = {
    ...user,
    name: role === "admin" ? "Admin Teste" : "Motorista Teste",
    role,
    active: true,
    updated_at: timestamp,
  };
  const driver = {
    id: did,
    name: "Motorista Teste",
    email: "motorista@example.test",
    role: "driver",
    active: true,
    updated_at: timestamp,
  };
  const establishment = {
    id: eid,
    name: "Estabelecimento Teste",
    trade_name: "",
    phone: "62999999999",
    contact_name: "Responsável Teste",
    postal_code: "74000000",
    street: "Rua de Teste",
    number: "10",
    complement: "",
    district: "Centro",
    city: "Goiânia",
    state: "GO",
    full_address: "Rua de Teste, 10 — Centro, Goiânia/GO",
    latitude: null,
    longitude: null,
    notes: "Entrada lateral de teste",
    receiving_hours: "8h às 12h",
    active: true,
    updated_at: timestamp,
  };
  const product = {
    id: pid,
    name: "Tomate Teste",
    unit: "kg",
    category_id: "category-test",
    active: true,
    updated_at: timestamp,
  };
  const item = {
    id: pid,
    product_id: pid,
    name: "Tomate Teste",
    quantity: 2,
    unit: "kg",
    unit_price: 5,
    subtotal: 10,
    notes: "",
  };
  const order = {
    id: oid,
    establishment_id: eid,
    establishments: establishment,
    delivery_date: today(),
    status: "open",
    total: 10,
    notes: "Pedido de teste isolado",
    created_by: aid,
    updated_at: timestamp,
    order_items: [item],
    route_stops:
      role === "driver" ? [{ route_id: rid }] : ([] as { route_id: string }[]),
  };
  const routes =
    role === "driver"
      ? [
          {
            id: rid,
            driver_id: did,
            route_date: today(),
            status: "released",
            notes: "Rota de teste isolado",
            updated_at: timestamp,
            profiles: driver,
            route_stops: [
              {
                id: pid,
                route_id: rid,
                order_id: oid,
                position: 1,
                status: "pending",
                orders: order,
              },
            ],
          },
        ]
      : ([] as Record<string, unknown>[]);
  const requests: unknown[] = [];
  await page.route("**/*.supabase.co/**", async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname;
    const json = (
      data: unknown,
      status = 200,
      headers: Record<string, string> = {},
    ) =>
      route.fulfill({
        status,
        contentType: "application/json",
        headers: {
          "access-control-expose-headers": "content-range",
          ...headers,
        },
        body: JSON.stringify(data),
      });
    if (path.startsWith("/auth/v1/token")) {
      const token = [
        { alg: "HS256", typ: "JWT" },
        {
          sub: user.id,
          role: "authenticated",
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        "test",
      ]
        .map((v) =>
          typeof v === "string"
            ? v
            : Buffer.from(JSON.stringify(v)).toString("base64url"),
        )
        .join(".");
      await json({
        access_token: token,
        refresh_token: "test-refresh",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: "bearer",
        user,
      });
      return;
    }
    if (path.startsWith("/auth/v1/user")) {
      await json(user);
      return;
    }
    if (path.startsWith("/auth/v1/logout")) {
      await route.fulfill({ status: 204 });
      return;
    }
    if (path.startsWith("/auth/v1/recover")) {
      await json({});
      return;
    }
    if (path.startsWith("/rest/v1/profiles")) {
      await json(url.searchParams.has("id") ? profile : [driver]);
      return;
    }
    if (path.startsWith("/rest/v1/establishments")) {
      if (route.request().method() === "HEAD") {
        await route.fulfill({
          status: 200,
          headers: {
            "content-range": "0-0/1",
            "access-control-expose-headers": "content-range",
          },
        });
        return;
      }
      if (
        route.request().method() === "POST" ||
        route.request().method() === "PATCH"
      ) {
        requests.push(route.request().postDataJSON());
        await json({ id: eid });
        return;
      }
      await json([establishment], 200, { "content-range": "0-0/1" });
      return;
    }
    if (path.startsWith("/rest/v1/product_categories")) { await json([{id:'category-test',name:'Legumes'}]); return; }
    if (path.startsWith("/rest/v1/measurement_units")) { await json([{id:'unit-kg',name:'Quilograma',abbreviation:'kg'},{id:'unit-cx',name:'Caixa',abbreviation:'cx'}]); return; }
    if (path.startsWith("/rest/v1/products")) {
      if (
        route.request().method() === "POST" ||
        route.request().method() === "PATCH"
      ) {
        requests.push(route.request().postDataJSON());
        await json({ id: pid });
        return;
      }
      await json([product]);
      return;
    }
    if (path.startsWith("/rest/v1/orders")) {
      await json(url.searchParams.has("id") ? order : [order]);
      return;
    }
    if (path.startsWith("/rest/v1/routes")) {
      await json(routes);
      return;
    }
    await json([]);
  });
  await page.route("**/api/**", async (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    if (route.request().url().includes("/api/routes")) {
      const ids = body.order_ids as string[];
      routes.splice(0, routes.length, {
        ...body,
        id: rid,
        updated_at: timestamp,
        profiles: driver,
        route_stops: ids.map((id, i) => ({
          id: pid,
          route_id: rid,
          order_id: id,
          position: i + 1,
          status: "pending",
          orders: order,
        })),
      });
      order.route_stops = ids.length ? [{ route_id: rid }] : [];
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: route.request().url().includes("/routes") ? rid : oid,
      }),
    });
  });
  return requests;
}
export async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill("isolado@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("Teste123456789");
  await page.getByRole("button", { name: "Entrar na minha conta" }).click();
}
export async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}
