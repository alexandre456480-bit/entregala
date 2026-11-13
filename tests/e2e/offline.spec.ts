import {test,expect} from '@playwright/test';
import {operationDatabase} from './operations.fixture';
import {login,rid} from './app.fixture';

test('conferência offline é guardada e sincronizada uma vez',async({page,context})=>{
 test.setTimeout(90000);const fixture=await operationDatabase(1);
 try{
  await fixture.attach(page,'driver');await login(page);
  await page.getByRole('navigation',{name:'Navegação do motorista'}).getByRole('button',{name:'Carga'}).click();
  await page.getByRole('button',{name:'Iniciar conferência de carregamento'}).click();
  const load=page.getByRole('region',{name:'Lista geral de carregamento'});
  await expect(load.getByRole('button',{name:/Confirmar carregamento de Tomate operacional/})).toBeVisible();
  await context.setOffline(true);
  await load.getByRole('button',{name:/Confirmar carregamento de Tomate operacional/}).click();
  await expect(page.getByText(/1 alteração aguardando sincronização/)).toBeVisible();
  await context.setOffline(false);
  await page.getByRole('button',{name:'Tentar sincronizar'}).click();
  await expect(page.getByText(/1 alteração aguardando sincronização/)).toHaveCount(0);
  await expect(load.getByRole('button',{name:/Desmarcar carregamento de Tomate operacional/})).toBeVisible();
  fixture.lose();
  await load.getByRole('button',{name:/Desmarcar carregamento de Tomate operacional/}).click();
  await expect(page.getByText(/1 alteração aguardando sincronização/)).toBeVisible();
  await page.getByRole('button',{name:'Tentar sincronizar'}).click();
  await expect(page.getByText(/1 alteração aguardando sincronização/)).toHaveCount(0);
  const sent=fixture.requests.filter(x=>x.action==='uncheck_load');
  expect(sent).toHaveLength(2);expect(sent[0].request_id).toBe(sent[1].request_id);
  await context.setOffline(true);
  await load.getByRole('button',{name:/Confirmar carregamento de Tomate operacional/}).click();
  await expect(page.getByText(/1 alteração aguardando sincronização/)).toBeVisible();
  await fixture.db.query('update public.routes set operation_version=operation_version+1 where id=$1',[rid]);
  await context.setOffline(false);
  await page.getByRole('button',{name:'Tentar sincronizar'}).click();
  await expect(page.getByText(/possível conflito/)).toBeVisible();
  await expect(page.getByText(/1 alteração aguardando sincronização/)).toBeVisible();
 }finally{await context.setOffline(false);await fixture.close();}
});
