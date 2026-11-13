import { test, expect } from '@playwright/test';
import { fixtures, login, eid, noOverflow } from './app.fixture';

test('seleciona o mesmo produto com unidades diferentes', async ({page})=>{
 const requests=await fixtures(page,'admin'); await login(page);
 await page.goto('/admin/pedidos/novo');
 await page.getByRole('combobox',{name:'Estabelecimento *'}).selectOption(eid);
 await page.getByText('Legumes', {exact:false}).first().click();
 await page.getByRole('button',{name:'Tomate Teste'}).click();
 await page.getByRole('button',{name:'Tomate Teste'}).click();
 await expect(page.getByLabel('Produto *',{exact:true})).toHaveCount(2);
 await page.getByRole('combobox',{name:'Unidade *',exact:true}).nth(0).selectOption('kg');
 await page.getByRole('combobox',{name:'Unidade *',exact:true}).nth(1).selectOption('cx');
 await page.getByLabel('Quantidade *',{exact:true}).nth(0).fill('10');
 await page.getByLabel('Quantidade *',{exact:true}).nth(1).fill('2');
 await noOverflow(page); await page.getByRole('button',{name:'Salvar pedido',exact:true}).click();
 await expect.poll(()=>requests.some((r:any)=>r.items?.length===2&&r.items[0].unit==='kg'&&r.items[1].unit==='cx')).toBe(true);
});
