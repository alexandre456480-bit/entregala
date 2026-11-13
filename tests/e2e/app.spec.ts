import { test, expect } from "@playwright/test";
import { fixtures, login, noOverflow, eid, did } from "./app.fixture";
test("login responsivo, recuperação e proteção sem sessão", async ({
  page,
}, info) => {
  await fixtures(page, "admin");
  await page.goto("/admin/rotas");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole("button", { name: "Esqueci minha senha" }).click();
  await page.getByLabel("E-mail", { exact: true }).fill("isolado@example.test");
  await page
    .getByRole("button", { name: "Enviar link de recuperação" })
    .click();
  await expect(page.getByRole("status")).toContainText("Se houver uma conta");
  await noOverflow(page);
  await page.getByRole("button", { name: "Voltar para o login" }).click();
  await page.screenshot({
    path: `artifacts/screenshots/login-${info.project.name}.png`,
    fullPage: true,
  });
});

test("admin: dashboard, validação de cliente, produto e cadastro rápido", async ({
  page,
}, info) => {
  const requests = await fixtures(page, "admin");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: /Olá, Admin/ })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: `artifacts/screenshots/dashboard-${info.project.name}.png`,
    fullPage: true,
  });
  await page.goto("/admin/estabelecimentos");
  await page.getByRole("button", { name: "Novo estabelecimento" }).click();
  await page.getByLabel("Nome do estabelecimento").fill("Cliente Teste Novo");
  await page.getByLabel("Telefone", { exact: false }).fill("62999999999");
  await page.getByLabel("CEP", { exact: false }).fill("74000000");
  await page.getByLabel("Rua / avenida").fill("Rua de Teste");
  await page.getByLabel("Número").fill("20");
  await page.getByLabel("Bairro").fill("Centro");
  await page.getByLabel("Cidade").fill("Goiânia");
  await page.getByRole("button", { name: "Salvar estabelecimento" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    requests.some(
      (r) => (r as { name?: string }).name === "Cliente Teste Novo",
    ),
  ).toBe(true);
  await page.goto("/admin/produtos");
  await page.getByRole("button", { name: "Novo produto", exact: true }).click();
  await page.getByLabel("Nome *", { exact: true }).fill("Batata Teste");
  await page.getByLabel("Categoria *", { exact: true }).fill("Legumes");
  await page.getByRole("button", { name: "Salvar produto" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/admin/pedidos/novo");
  await page
    .getByRole("combobox", { name: "Estabelecimento *", exact: true })
    .selectOption(eid);
  await page.getByLabel("Produto *", { exact: true }).fill("Tomate Teste");
  await page.getByLabel("Produto *", { exact: true }).press("Tab");
  await page.getByLabel("Quantidade *", { exact: true }).fill("3");
  await page.getByLabel("Preço unit. (R$)", { exact: true }).fill("5.50");
  await expect(page.locator(".order-total>strong")).toContainText("16,50");
  await page.getByRole("button", { name: "Adicionar produto" }).click();
  await expect(page.getByLabel("Produto *", { exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: "Remover item" }).last().click();
  await noOverflow(page);
  await page.screenshot({
    path: `artifacts/screenshots/order-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Salvar e cadastrar outro" }).click();
  await expect(page.getByRole("status")).toContainText("Pedido salvo");
  await expect(page.getByLabel("Produto *", { exact: true })).toHaveValue("");
  expect(
    requests.some((r) => Array.isArray((r as { items?: unknown[] }).items)),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("planejamento manual e liberação com confirmação", async ({
  page,
}, info) => {
  await fixtures(page, "admin");
  await login(page);
  await page.goto("/admin/rotas");
  await page.getByRole("button", { name: "Nova rota", exact: true }).click();
  await page.getByLabel("Motorista responsável").selectOption(did);
  await page.getByRole("button", { name: "Adicionar pedido à rota" }).click();
  await expect(page.locator(".stop-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(page.getByRole("status")).toContainText("Planejamento salvo");
  await expect(
    page.getByRole("link", { name: "Cadastrar pedido nesta rota" }),
  ).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: `artifacts/screenshots/planner-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Liberar rota", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Liberar rota", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Rota liberada");
  await expect(
    page.getByRole("button", { name: "Salvar rascunho" }),
  ).toHaveCount(0);
});

test("motorista: entregas, detalhes somente consulta e bloqueio do admin", async ({
  page,
}, info) => {
  await fixtures(page, "driver");
  await login(page);
  await expect(page).toHaveURL(/\/motorista$/);
  await expect(
    page.getByRole("heading", { name: /Olá, Motorista/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Estabelecimento Teste/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("Tomate Teste");
  await expect(page.getByRole("dialog")).toContainText(
    "Entrada lateral de teste",
  );
  await expect(page.getByRole("dialog").locator("input")).toHaveCount(0);
  await noOverflow(page);
  await page.screenshot({
    path: `artifacts/screenshots/driver-detail-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Voltar às minhas entregas" }).click();
  await page.screenshot({
    path: `artifacts/screenshots/driver-${info.project.name}.png`,
    fullPage: true,
  });
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/motorista$/);
  if (['mobile','iphone','landscape'].includes(info.project.name)) await page.getByRole('button',{name:'Abrir menu'}).click();
  await page.getByRole("button", { name: "Minha conta", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Minha conta." }),
  ).toBeVisible();
  await noOverflow(page);
});
