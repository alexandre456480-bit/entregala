import { test, expect } from "@playwright/test";
import { operationDatabase } from "./operations.fixture";
import { login, noOverflow, rid } from "./app.fixture";
test("jornada persistente de 12 entregas: carga parcial, entrega integral/parcial/não realizada e encerramento", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const fixture = await operationDatabase();
  try {
    await fixture.attach(page, "driver");
    await login(page);
    await page
      .getByRole("button", { name: "Conferir carregamento", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Iniciar conferência de carregamento" })
      .click();
    const load = page.getByRole("region", {
      name: "Lista geral de carregamento",
    });
    await expect(
      page.getByRole("button", { name: "Iniciar entregas", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Ajustar", exact: true })
      .first()
      .click();
    const edit = page.getByRole("dialog");
    await edit.getByLabel("Quantidade carregada").fill("8");
    await edit
      .getByLabel("Motivo ou observação")
      .fill("Mercadoria insuficiente");
    await edit.getByRole("button", { name: "Salvar conferência" }).click();
    await expect(edit).toHaveCount(0);
    await page
      .getByRole("button", { name: "Por produto", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirmar produto conferido" })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Confirmar produto", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Iniciar entregas", exact: true }),
    ).toBeEnabled();
    await page.reload();
    await page
      .getByRole("button", { name: "Conferir carregamento", exact: true })
      .click();
    await expect(page.locator(".operation-header")).toContainText(
      "Em carregamento",
    );
    await page
      .getByRole("button", { name: "Iniciar entregas", exact: true })
      .click();
    await expect(page.getByRole("alertdialog")).toContainText("divergências");
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Iniciar entregas", exact: true })
      .click();
    await page.getByRole('button',{name:'Registrar problema na jornada',exact:true}).click();
    const issue=page.getByRole('dialog');
    await issue.getByLabel('Categoria').selectOption('other');
    await issue.getByLabel('Justificativa / observação').fill('Observação geral da jornada');
    await issue.getByRole('button',{name:'Salvar registro',exact:true}).click();
    await expect(issue).toHaveCount(0);
    const issueRow=(await fixture.db.query<{stop_id:string|null;phase:string}>("select stop_id,phase from public.operation_issues where description=$1",['Observação geral da jornada'])).rows[0];
    expect(issueRow.stop_id).toBeNull();expect(issueRow.phase).toBe('journey');
    for (let n = 0; n < 12; n++) {
      await expect(
        page.getByRole("region", { name: "Checklist da entrega" }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Conferir entrega", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog
        .getByLabel("Quantidade entregue")
        .fill(n === 0 ? "8" : n === 1 ? "5" : n === 2 ? "0" : "10");
      if (n < 3)
        await dialog
          .getByLabel("Motivo ou observação")
          .fill(
            n === 2 ? "Estabelecimento fechado" : "Quantidade insuficiente",
          );
      await dialog.getByRole("button", { name: "Salvar conferência" }).click();
      await expect(dialog).toHaveCount(0);
      await page.getByRole("button", { name: /^Finalizar entrega ·/ }).click();
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Finalizar entrega", exact: true })
        .click();
      if (n < 3) {
        const reason = page.getByRole("dialog", {
          name: "Justificativa do resultado",
        });
        await reason
          .getByLabel("Motivo", { exact: true })
          .fill(
            n === 2
              ? "Estabelecimento fechado"
              : "Mercadoria entregue parcialmente",
          );
        await reason
          .getByRole("button", { name: "Confirmar resultado e avançar" })
          .click();
        await expect(reason).toHaveCount(0);
      }
    }
    await expect(page.locator(".operation-progress-heading")).toContainText(
      "12 de 12",
    );
    await expect(page.locator(".operation-progress-legend")).toContainText(
      "9 integrais",
    );
    await expect(page.locator(".operation-progress-legend")).toContainText(
      "2 parciais",
    );
    await page
      .getByRole("button", { name: "Finalizar jornada", exact: true })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Finalizar jornada", exact: true })
      .click();
    await expect(page.locator(".operation-header")).toContainText("Finalizada");
    await noOverflow(page);
    await page.screenshot({
      path: `artifacts/screenshots/operations-${info.project.name}.png`,
      fullPage: true,
    });
    const r = (
      await fixture.db.query<{ status: string }>(
        "select status from public.routes where id=$1",
        [rid],
      )
    ).rows[0];
    expect(r.status).toBe("completed");
  } finally {
    await fixture.close();
  }
});
test("falha mantém formulário, reenvio é único e administração consulta resultados persistidos", async ({
  page,
  browser,
}, info) => {
  const fixture = await operationDatabase(1);
  try {
    await fixture.attach(page, "driver");
    await login(page);
    await page
      .getByRole("button", { name: "Conferir carregamento", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Iniciar conferência de carregamento" })
      .click();
    await page.getByRole("button", { name: "Ajustar", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Quantidade carregada").fill("8");
    await dialog
      .getByLabel("Motivo ou observação")
      .fill("Falta física da mercadoria");
    fixture.fail();
    await dialog.getByRole("button", { name: "Salvar conferência" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Falha de conexão");
    await expect(dialog.getByLabel("Quantidade carregada")).toHaveValue("8");
    fixture.lose();
    await dialog.getByRole("button", { name: "Salvar conferência" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Falha de conexão");
    await dialog.getByRole("button", { name: "Salvar conferência" }).click();
    await expect(dialog).toHaveCount(0);
    const saved = await fixture.db.query<{ n: number }>(
      "select count(*)::int as n from public.audit_events where operation='OP_LOAD_ITEM'",
    );
    expect(saved.rows[0].n).toBe(1);
    const admin = await browser.newContext({
      viewport: info.project.use.viewport,
    });
    const tab = await admin.newPage();
    try {
      await fixture.attach(tab, "admin");
      await login(tab);
      await tab.goto("/admin/operacao");
      await expect(tab.locator(".operation-kpis")).toContainText("Ocorrências");
      await tab
        .getByRole("button", { name: "Consultar operação", exact: true })
        .click();
      await tab.getByRole("button", { name: "Carga", exact: true }).click();
      await expect(
        tab.getByRole("region", { name: "Lista geral de carregamento" }),
      ).toContainText("Carregado: 8");
      await page.getByRole("button", { name: "Ajustar", exact: true }).click();
      await dialog.getByLabel("Quantidade carregada").fill("7");
      await dialog
        .getByLabel("Motivo ou observação")
        .fill("Quantidade física revisada");
      await dialog.getByRole("button", { name: "Salvar conferência" }).click();
      await expect(dialog).toHaveCount(0);
      await tab.bringToFront();
      await tab.evaluate(() => window.dispatchEvent(new Event("online")));
      await expect(
        tab.getByRole("region", { name: "Lista geral de carregamento" }),
      ).toContainText("Carregado: 7", { timeout: 25000 });
      await noOverflow(tab);
    } finally {
      await admin.close();
    }
  } finally {
    await fixture.close();
  }
});
