import { test, expect } from "@playwright/test";
import { fixtures, login, noOverflow, did, oid, rid, timestamp } from "./app.fixture";

test("admin confirms or cancels deletion of orders and routes", async ({ page }) => {
  await fixtures(page, "admin");
  let orderDeleted = false, routeDeleted = false;
  const sent: {path:string;body:any}[] = [];
  await page.route("**/api/**", async route => {
    if (route.request().method() !== "PATCH") return route.fallback();
    const path = new URL(route.request().url()).pathname;
    sent.push({path,body:route.request().postDataJSON()});
    if(path.endsWith('/orders')) orderDeleted=true; else routeDeleted=true;
    await route.fulfill({status:200,json:{data:path.endsWith('/orders')?oid:rid}});
  });
  await page.route("**/*.supabase.co/rest/v1/**", async route => {
    const path=new URL(route.request().url()).pathname;
    if ((path.endsWith('/orders') && orderDeleted) || (path.endsWith('/routes') && routeDeleted))
      return route.fulfill({status:200,json:[]});
    return route.fallback();
  });
  await login(page);
  await page.goto('/admin/rotas');
  await page.getByRole('button',{name:'Nova rota',exact:true}).click();
  await page.getByLabel('Motorista respons\u00e1vel').selectOption(did);
  await page.getByRole('button',{name:'Salvar rascunho'}).click();
  await page.getByRole('button',{name:'Excluir rota',exact:true}).click();
  await page.getByRole('alertdialog').getByRole('button',{name:'Cancelar'}).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(sent).toHaveLength(0);
  await page.getByRole('button',{name:'Excluir rota',exact:true}).click();
  await page.getByRole('alertdialog').getByRole('button',{name:'Excluir rota'}).click();
  await expect(page.getByRole('status')).toContainText('Rota exclu\u00edda');
  expect(sent[0]).toEqual({path:'/api/routes',body:{id:rid,expected_updated_at:timestamp}});
  await page.goto('/admin/pedidos');
  await noOverflow(page);
  await page.getByRole('button',{name:'Excluir pedido de Estabelecimento Teste'}).click();
  await page.getByRole('alertdialog').getByRole('button',{name:'Excluir pedido'}).click();
  await expect(page.getByRole('status')).toContainText('Pedido exclu\u00eddo');
  expect(sent[1]).toEqual({path:'/api/orders',body:{id:oid,expected_updated_at:timestamp,expected_route_id:null}});
});
