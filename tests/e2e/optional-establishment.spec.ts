import { test, expect } from '@playwright/test';
import { fixtures, login } from './app.fixture';

test('cadastro permite campos vazios e coordenadas ficam no endereço', async ({ page }) => {
  const requests = await fixtures(page, 'admin');
  await login(page);
  await page.goto('/admin/estabelecimentos');
  await page.getByRole('button', {name:'Novo estabelecimento'}).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Nome fantasia')).toHaveCount(0);
  await expect(dialog.getByLabel('UF')).toHaveValue('');
  const order = await dialog.locator('h3, app-location-editor').evaluateAll(nodes => nodes.map(n => n.tagName === 'APP-LOCATION-EDITOR' ? 'location' : n.textContent?.trim()));
  expect(order.indexOf('location')).toBeLessThan(order.indexOf('Facilite a entrega'));
  await dialog.getByRole('button', {name:'Salvar estabelecimento'}).click();
  await expect(dialog).toHaveCount(0);
  expect(requests).toContainEqual(expect.objectContaining({name:'',phone:'',postal_code:'',street:'',number:'',district:'',city:'',state:''}));
});
