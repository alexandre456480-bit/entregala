import {test,expect} from '@playwright/test';
import {operationDatabase} from './operations.fixture';
import {login,noOverflow} from './app.fixture';

test('separação por produto e estabelecimento compartilha conferência',async({page},info)=>{
 test.setTimeout(90000);
 const fixture=await operationDatabase(2);
 try{
  await fixture.attach(page,'driver');await login(page);
  if(info.project.name==='mobile') await page.getByRole('navigation',{name:'Navegação do motorista'}).getByRole('button',{name:'Carga'}).click();
  else await page.getByRole('navigation',{name:'Navegação do entregador'}).getByRole('button',{name:'Separação geral'}).click();
  await page.getByRole('button',{name:'Iniciar conferência de carregamento'}).click();
  const load=page.getByRole('region',{name:'Lista geral de carregamento'});
  const confirm=load.getByRole('button',{name:/Confirmar carregamento de Tomate operacional/}).first();
  await confirm.click();
  await expect(load.getByRole('button',{name:/Desmarcar carregamento de Tomate operacional/})).toHaveCount(1);
  await load.getByRole('button',{name:'Por estabelecimento'}).click();
  const undo=load.getByRole('button',{name:/Desmarcar carregamento de Tomate operacional/});
  await expect(undo).toHaveCount(1);await undo.click();
  await expect(load.getByRole('button',{name:/Desmarcar carregamento de Tomate operacional/})).toHaveCount(0);
  await load.getByRole('button',{name:'Por produto'}).click();
  await expect(load.getByRole('button',{name:/Confirmar carregamento de Tomate operacional/})).toHaveCount(2);
  await noOverflow(page);
 } finally {await fixture.close();}
});
