import { test, expect, type Page } from "@playwright/test";
import {
  fixtures,
  login,
  noOverflow,
  rid,
  oid,
  did,
  eid,
  timestamp,
} from "./app.fixture";
import { today } from "../../shared/models";
async function mapsFixture(page: Page, role: "admin" | "driver", distantRoute = false, stopCount = 2) {
  await fixtures(page, role);
  let version = timestamp;
  let ids = Array.from({length:stopCount},(_,i)=> i===0 ? oid : i===1 ? "00000000-0000-4000-8000-000000000007" : `10000000-0000-4000-8000-${String(i).padStart(12,'0')}`);
  let mutations = 0;
  let calculations = 0;
  const stops = ids.map((id, i) => ({
    order_id: id,
    establishment_id: eid,
    name: `Cliente mapa ${i + 1}`,
    address: "Rua teste, Goiânia",
    latitude: -16.68 + i * 0.002,
    longitude: -49.26 + i * 0.002,
    location_status: "confirmed",
    position: i + 1,
  }));
  const origin = {
    name: "Base teste",
    address: "Rua de Teste, Goiânia",
    notes: "",
    latitude: -16.67,
    longitude: -49.25,
    updated_at: timestamp,
  };
  const context = () => ({
    route_id: rid,
    driver_id: did,
    status: "released",
    updated_at: version,
    fingerprint: ids.join("-"),
    origin,
    stops: ids.map((id, i) => ({
      ...stops.find((s) => s.order_id === id)!,
      position: i + 1,
    })),
  });
  const result = (optimized = false) => ({
    id: "00000000-0000-4000-8000-000000000099",
    fingerprint: context().fingerprint,
    kind: optimized ? "optimize" : "routing",
    result: {
      order_ids: optimized ? [...ids].reverse() : ids,
      distance: optimized ? 1500 : 2000,
      duration: optimized ? 200 : 300,
      legs: [
        { distance: 1000, duration: 100 },
        { distance: 1000, duration: 200 },
      ],
      geometry: {
        type: "LineString",
        coordinates: [
          [-49.25, -16.67],
          [-49.26, -16.68],
          [-49.258, -16.678],
        ],
      },
    },
  });
  await page.route("https://maps.geoapify.com/**", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        version: 8,
        sources: {},
        layers: [
          {
            id: "test-background",
            type: "background",
            paint: { "background-color": "#e6eee0" },
          },
        ],
      }),
    }),
  );
  await page.route("**/rest/v1/rpc/map_context", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(context()),
    }),
  );
  await page.route("**/rest/v1/operation_base?**", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(origin),
    }),
  );
  await page.route("**/rest/v1/routes?**", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        ...(distantRoute ? [{
          id: "00000000-0000-4000-8000-000000000088",
          driver_id: "00000000-0000-4000-8000-000000000089",
          route_date: today(), status: "released", updated_at: version,
          profiles: { name: "Outro motorista" },
          route_stops: [{ id: "far", order_id: "far", position: 1,
            orders: { establishments: { id: eid, name: "Outro destino", latitude: -23.55, longitude: -46.63, location_status: "confirmed" }, order_items: [] } }],
        }] : []),
        {
          id: rid,
          driver_id: did,
          route_date: today(),
          status: "released",
          updated_at: version,
          profiles: { name: "Motorista Teste" },
          route_stops: stops.map((s) => ({
            id: s.order_id,
            order_id: s.order_id,
            position: s.position,
            orders: { establishments: { ...s, id: eid }, order_items: [] },
          })),
        },
      ]),
    }),
  );
  await page.route("**/api/maps/**", async (r) => {
    const p = r.request().postDataJSON();
    let data: unknown = null;
    const path = new URL(r.request().url()).pathname;
    if (path.endsWith("/route")) {
      if (p.action !== "cached") {
        calculations++;
        data = result(p.action === "optimize");
      }
    }
    if (path.endsWith("/reorder")) {
      ids = p.order_ids;
      version = "2026-11-11T11:00:00+00:00";
      mutations++;
      data = rid;
    }
    if (path.endsWith("/apply")) {
      ids = [...ids].reverse();
      version = "2026-11-11T12:00:00+00:00";
      mutations++;
      data = rid;
    }
    if (path.endsWith("/geocode"))
      data = [
        {
          latitude: -16.68,
          longitude: -49.26,
          label: "Centro de Goiânia (teste aproximado)",
          confidence: 0.2,
          precision: "city",
          approximate: true,
        },
      ];
    await r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data }),
    });
  });
  return { mutations: () => mutations, calculations: () => calculations };
}

test('mapa mantém 70 paradas e seleção sem cálculo extra', async ({page}, info) => {
 const state=await mapsFixture(page,'admin',false,70); await login(page);
 const start=Date.now(); await page.goto(`/admin/mapa?rota=${rid}`);
 const markers=page.locator('.delivery-marker:not(.origin-marker)');
 await expect(markers).toHaveCount(70);
 const initial=Date.now()-start;
 await page.evaluate(()=>{(window as any).__mapMutations=0;new MutationObserver(m=>{(window as any).__mapMutations+=m.length}).observe(document.querySelector('.route-map-canvas')!,{attributes:true,childList:true,subtree:true,characterData:true});});
 const selections=Date.now();
 for(let i=0;i<5;i++){if(info.project.name!=='desktop') await markers.nth(i).dispatchEvent('click'); else await markers.nth(i).click();await expect(markers.nth(i)).toHaveAttribute('aria-pressed','true');}
 const result=await page.evaluate(()=>({mutations:(window as any).__mapMutations,heap:(performance as any).memory?.usedJSHeapSize||null}));
 console.log('MAP_BENCH',JSON.stringify({initial,selectionMs:Date.now()-selections,...result}));
 expect(state.calculations()).toBe(0);
});

test('mapa apresenta 30 paradas mantendo interação', async ({page}) => {
 const state=await mapsFixture(page,'admin',false,30); await login(page); await page.goto(`/admin/mapa?rota=${rid}`);
 const markers=page.locator('.delivery-marker:not(.origin-marker)');
 await expect(markers).toHaveCount(30);
 await markers.nth(15).dispatchEvent('click');
 await expect(markers.nth(15)).toHaveAttribute('aria-pressed','true');
 expect(state.calculations()).toBe(0);
});

test("enquadramento permanece local na rota selecionada, inclusive ao reabrir o mapa", async ({ page }) => {
  await mapsFixture(page, "admin", true);
  await login(page);
  await page.goto(`/admin/mapa?rota=${rid}`);
  await expect(page.locator(".delivery-marker")).toHaveCount(4);
  const zoom = () => page.locator("app-route-map").evaluate((host) =>
    (window as any).ng.getComponent(host).map.getZoom() as number);
  await expect.poll(zoom).toBeGreaterThan(12);
  await page.getByRole("button", { name: "Lista de entregas", exact: true }).click();
  await page.getByRole("button", { name: "Mapa completo", exact: true }).click();
  await expect.poll(zoom).toBeGreaterThan(12);
  await noOverflow(page);
});
test("mapa: seleção sincronizada, ordem manual e prévia sem aplicar automaticamente", async ({
  page,
}, info) => {
  const state = await mapsFixture(page, "admin");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await page.goto("/admin/mapa");
  await expect(
    page.getByRole("heading", { name: /Cada motorista/ }),
  ).toBeVisible();
  await expect(page.locator(".delivery-marker")).toHaveCount(3);
  expect(state.calculations()).toBe(0);
  await page
    .getByRole("button", { name: "Parada 1: Cliente mapa 1", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Entrega selecionada" }),
  ).toBeVisible();
  const refreshed=page.waitForResponse(r=>r.url().includes('/rpc/map_context'));
  await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await refreshed;
  await expect(page.getByRole('region',{name:'Entrega selecionada'})).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Navegar até o estabelecimento" }),
  ).toHaveAttribute("href", /google\.com\/maps\/dir/);
  await page
    .getByRole("button", { name: "Calcular trajeto", exact: true })
    .click();
  await expect(page.locator(".route-metrics")).toContainText("2 km");
  expect(state.calculations()).toBe(1);
  await page
    .getByRole("button", { name: "Otimizar rota", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Prévia da otimização" }),
  ).toBeVisible();
  expect(state.mutations()).toBe(0);
  await page.getByRole("button", { name: "Manter minha rota" }).click();
  expect(state.mutations()).toBe(0);
  await page
    .getByRole("button", { name: "Lista de entregas", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Mover parada para baixo" })
    .first()
    .click();
  await page.getByRole("button", { name: "Salvar ordem das paradas" }).click();
  await expect(page.getByRole("status")).toContainText("Sequência salva");
  expect(state.mutations()).toBe(1);
  await page
    .getByRole("button", { name: "Mapa completo", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Otimizar rota", exact: true })
    .click();
  await noOverflow(page);
  await page.screenshot({
    path: `artifacts/screenshots/maps-${info.project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Aplicar rota otimizada", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Aplicar rota otimizada" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Rota otimizada aplicada",
  );
  expect(state.mutations()).toBe(2);
  expect(errors).toEqual([]);
});
test("geocodificação exige confirmação e revisão ao alterar endereço; motorista acessa próprio mapa", async ({
  page,
}) => {
  await mapsFixture(page, "admin");
  await login(page);
  await page.goto("/admin/base");
  await expect(
    page.getByRole("heading", { name: /Base da distribuidora/ }),
  ).toBeVisible();
  await page.getByLabel("Endereço completo").fill("Outro endereço em Goiânia");
  await page.getByRole("button", { name: "Localizar no mapa" }).click();
  await page
    .getByRole("button", { name: /Centro de Goiânia \(teste aproximado\)/ })
    .click();
  await expect(page.getByRole("alert")).toContainText("aproximada");
  await expect(
    page.getByRole("button", { name: "Confirmar localização", exact: true }),
  ).toBeDisabled();
  await page.getByRole("checkbox", { name: /Conferi/ }).check();
  await page
    .getByRole("button", { name: "Confirmar localização", exact: true })
    .click();
  await expect(page.locator(".location-editor>.badge")).toContainText(
    "confirmada",
  );
  await page.getByLabel("Endereço completo").fill("Mais um endereço");
  await expect(page.locator(".location-editor>.badge")).toContainText(
    "revisão",
  );
  await noOverflow(page);
});
test("motorista organiza a rota liberada e continua sem campos de escrita de produtos", async ({
  page,
}) => {
  const state = await mapsFixture(page, "driver");
  await login(page);
  await page
    .getByRole("button", { name: "Mapa e organização da rota" })
    .click();
  await expect(page.locator(".delivery-marker")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Lista de entregas", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Mover parada para baixo" })
    .first()
    .click();
  await page.getByRole("button", { name: "Salvar ordem das paradas" }).click();
  await expect(page.getByRole("status")).toContainText("Sequência salva");
  expect(state.mutations()).toBe(1);
  await expect(page.locator("app-route-workspace input")).toHaveCount(0);
  await noOverflow(page);
});

test('base: coordenadas manuais explicam erros, aceitam vírgula e invalidam confirmação ao editar',async({page})=>{
 await mapsFixture(page,'admin');await login(page);await page.goto('/admin/base');
 await page.getByLabel('Endereço completo').fill('Rua informada pelo administrador');
 await page.getByText('Informar ou ajustar coordenadas manualmente',{exact:true}).click();
 await page.getByLabel('Coordenadas (latitude, longitude)').fill('-16,62670140003006 -49204844770691174');
 await page.getByRole('button',{name:'Aplicar coordenadas ao mapa'}).click();
 await expect(page.getByRole('alert')).toContainText('Coordenadas inválidas');
 await expect(page.getByRole('button',{name:'Confirmar localização',exact:true})).toHaveCount(0);
 await page.getByLabel('Coordenadas (latitude, longitude)').fill('-16,62670140003006 -49,204844770691174');
 await page.getByRole('button',{name:'Aplicar coordenadas ao mapa'}).click();
 await expect(page.getByRole('alert')).toHaveCount(0);
 await expect(page.getByLabel('Coordenadas (latitude, longitude)')).toHaveValue('-16.6267014, -49.2048448');
 await page.getByRole('checkbox',{name:/Conferi/}).check();
 await page.getByRole('button',{name:'Confirmar localização',exact:true}).click();
 await expect(page.locator('.location-editor>.badge')).toContainText('confirmada');
 await page.getByLabel('Coordenadas (latitude, longitude)').fill('-16.63, -49.2048448');
 await expect(page.locator('.location-editor>.badge')).toContainText('revisão');
 await expect(page.getByRole('button',{name:'Confirmar localização',exact:true})).toHaveCount(0);
 await noOverflow(page);
});

test('estabelecimento: ponto manual confirmado segue com o cadastro e a versão salva',async({page})=>{
 await mapsFixture(page,'admin');let location:Record<string,unknown>|null=null;
 await page.route('**/rest/v1/establishments?**',async route=>{if(route.request().method()!=='POST'){await route.fallback();return;}await route.fulfill({json:{...route.request().postDataJSON(),id:eid,updated_at:timestamp}});});
 await page.route('**/api/maps/location',async route=>{location=route.request().postDataJSON();await route.fulfill({json:{data:eid}});});
 await login(page);await page.goto('/admin/estabelecimentos');await page.getByRole('button',{name:'Novo estabelecimento'}).click();
 await page.getByLabel('Nome do estabelecimento').fill('Cliente de teste');await page.getByLabel('Telefone',{exact:false}).fill('62999999999');await page.getByLabel('CEP',{exact:false}).fill('74000000');await page.getByLabel('Rua / avenida').fill('Rua de teste');await page.getByLabel('Número').fill('20');await page.getByLabel('Bairro').fill('Bueno');await page.getByLabel('Cidade').fill('Goiânia');
 await page.getByText('Informar ou ajustar coordenadas manualmente',{exact:true}).click();await page.getByLabel('Coordenadas (latitude, longitude)').fill('-16,68 -49,26');await page.getByRole('button',{name:'Aplicar coordenadas ao mapa'}).click();
 await page.getByRole('checkbox',{name:/Conferi/}).check();await page.getByRole('button',{name:'Confirmar localização',exact:true}).click();await page.getByRole('button',{name:'Salvar estabelecimento',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 expect(location).toEqual({id:eid,latitude:-16.68,longitude:-49.26,expected_updated_at:timestamp});
});

test.describe('endereço local recusado pelo provedor', () => {
 test.use({baseURL:'http://127.0.0.1:4201'});
 test('oferece abrir localhost quando a chave não autoriza 127.0.0.1', async ({page}) => {
  await mapsFixture(page,'admin');
  await page.route('https://maps.geoapify.com/**', route => route.fulfill({status:401,body:'Unauthorized'}));
  await login(page); await page.goto('/admin/base');
  await page.getByText('Informar ou ajustar coordenadas manualmente',{exact:true}).click();
  await page.getByLabel('Coordenadas (latitude, longitude)').fill('-16.68, -49.26');
  await page.getByRole('button',{name:'Aplicar coordenadas ao mapa'}).click();
  const link=page.getByRole('link',{name:'Abrir em localhost'});
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href','http://localhost:4201/admin/base');
 });
});
