import {test,expect} from '@playwright/test';
import {fixtures,login,noOverflow,did} from './app.fixture';

test('sidebar desktop agrupa, recolhe e preserva destaque por URL',async({page},info)=>{
 test.skip(['mobile','iphone','landscape'].includes(info.project.name),'Menu móvel é verificado separadamente');
 await fixtures(page,'admin');await login(page);await page.goto('/admin/pedidos');
 const nav=page.getByRole('navigation',{name:'Principal'});
 await expect(nav.getByRole('button',{name:'Operação'})).toHaveAttribute('aria-expanded','true');
 await expect(nav.getByRole('link',{name:'Pedidos'})).toHaveAttribute('aria-current','page');
 await nav.getByRole('button',{name:'Cadastros'}).click();
 await expect(nav.getByRole('link',{name:'Produtos'})).toBeVisible();
 await expect(nav.getByRole('button',{name:'Operação'})).toHaveAttribute('aria-expanded','false');
 await page.getByRole('button',{name:'Recolher menu'}).click();
 await expect(page.locator('.admin-app')).toHaveClass(/nav-collapsed/);
 await page.screenshot({path:`artifacts/screenshots/sidebar-collapsed-${info.project.name}.png`});
 await page.reload(); await expect(page.locator('.admin-app')).toHaveClass(/nav-collapsed/);
 await nav.getByRole('button',{name:'Cadastros'}).click();
 await expect(nav.getByRole('link',{name:'Estabelecimentos'})).toBeVisible();
 await noOverflow(page);
});

test('menu móvel e barra inferior acessíveis',async({page},info)=>{
 test.skip(!['mobile','iphone','landscape'].includes(info.project.name),'Menu desktop é verificado separadamente');
 await fixtures(page,'admin');await login(page);
 const bottom=page.getByRole('navigation',{name:'Navegação rápida'});
 await expect(bottom.getByRole('link',{name:'Pedidos'})).toBeVisible();
 await bottom.getByRole('link',{name:'Pedidos'}).click();
 await expect(bottom.getByRole('link',{name:'Pedidos'})).toHaveAttribute('aria-current','page');
 await page.getByRole('button',{name:'Abrir menu'}).click();
 const drawer=page.getByRole('dialog',{name:'Menu de navegação'});
 await expect(drawer).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>document.body.style.overflow)).toBe('hidden');
 await drawer.getByRole('button',{name:'Cadastros'}).click();
 await expect(drawer.getByRole('link',{name:'Produtos'})).toBeVisible();
 await page.screenshot({path:`artifacts/screenshots/sidebar-drawer-${info.project.name}.png`});
 await page.keyboard.press('Escape'); await expect(drawer).toBeHidden();
 await expect(page.getByRole('button',{name:'Abrir menu'})).toBeFocused();
 await expect.poll(()=>page.evaluate(()=>document.body.style.overflow)).not.toBe('hidden');
 await page.getByRole('button',{name:'Abrir menu'}).click();
 await page.getByRole('dialog',{name:'Menu de navegação'}).getByRole('link',{name:'Minha conta'}).click();
 await expect(page).toHaveURL(/\/admin\/conta/);await expect(drawer).toBeHidden();
 await noOverflow(page);
});

test('abas preservam rota e data e protegem alterações não salvas',async({page})=>{
 await fixtures(page,'admin');await login(page);await page.goto('/admin/rotas?data=2026-11-11');
 await page.getByRole('button',{name:'Nova rota',exact:true}).click();
 await page.getByLabel('Motorista responsável').selectOption(did);
 await page.getByRole('navigation',{name:'Rotas e mapa'}).getByRole('link',{name:'Mapa'}).click();
 const dialog=page.getByRole('alertdialog');await expect(dialog).toContainText('alterações não salvas');
 await dialog.getByRole('button',{name:'Cancelar'}).click();await expect(page).toHaveURL(/\/admin\/rotas/);
 await page.getByRole('navigation',{name:'Rotas e mapa'}).getByRole('link',{name:'Mapa'}).click();
 await dialog.getByRole('button',{name:'Descartar'}).click();await expect(page).toHaveURL(/\/admin\/mapa\?data=2026-11-11/);
 await expect(page.getByRole('navigation',{name:'Rotas e mapa'}).getByRole('link',{name:'Mapa'})).toHaveAttribute('aria-current','page');
 await page.goto('/admin/rotas?data=2026-11-11&rota=00000000-0000-4000-8000-000000000006');
 await expect(page.getByRole('navigation',{name:'Rotas e mapa'}).getByRole('link',{name:'Planejamento'})).toHaveAttribute('aria-current','page');
});
