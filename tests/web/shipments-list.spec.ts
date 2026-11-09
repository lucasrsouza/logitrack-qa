import { test, expect } from '../../src/fixtures';
import { STATUS_LABEL } from '../../src/data/shipment.factory';
import { knownBug } from '../../src/support/known-bugs';

test.describe('Web: listagem de embarques', () => {
  test.beforeEach(async ({ loggedInPage, listPage }) => {
    void loggedInPage;
    await listPage.goto();
  });

  test('primeira página mostra 10 embarques, total e paginação coerentes com o banco', async ({ listPage, db }) => {
    const total = db.query('SELECT COUNT(*) AS total FROM shipments')[0].total as number;

    await expect(listPage.rows).toHaveCount(10);
    await expect(listPage.total).toHaveText(`${total} embarques`);
    await expect(listPage.pageInfo).toHaveText(`Página 1 de ${Math.ceil(total / 10)}`);
    await expect(listPage.prevButton).toBeDisabled();
    const rows = await listPage.readRows();
    expect(rows[0].reference).toBe(db.query('SELECT reference FROM shipments ORDER BY created_at DESC LIMIT 1')[0].reference);
  });

  test('navegar para a próxima página e voltar', async ({ listPage }) => {
    const firstPage = (await listPage.readRows()).map((r) => r.reference);

    await listPage.goToNextPage();
    await expect(listPage.pageInfo).toHaveText(/^Página 2 de/);
    await expect(listPage.prevButton).toBeEnabled();
    const secondPage = (await listPage.readRows()).map((r) => r.reference);
    expect(secondPage.some((ref) => firstPage.includes(ref))).toBe(false);

    await listPage.prevButton.click();
    await expect(listPage.pageInfo).toHaveText(/^Página 1 de/);
    expect((await listPage.readRows()).map((r) => r.reference)).toEqual(firstPage);
  });

  test.fail('percorrer as páginas na tela exibe todos os embarques', knownBug('BUG-24'), async ({ listPage, db }) => {
    const expected = db.query('SELECT reference FROM shipments ORDER BY created_at DESC').map((r) => r.reference as string);
    const seen: string[] = (await listPage.readRows()).map((r) => r.reference);

    while (seen.length < expected.length && (await listPage.rows.count()) > 0) {
      await listPage.goToNextPage();
      seen.push(...(await listPage.readRows()).map((r) => r.reference));
    }

    expect(expected.filter((ref) => !seen.includes(ref)), 'embarques que nunca aparecem na tela').toEqual([]);
  });

  test.fail('botão "Próxima" fica desabilitado na última página', knownBug('BUG-21'), async ({ listPage }) => {
    const totalPages = Number((await listPage.pageInfo.textContent())!.match(/de (\d+)/)![1]);
    for (let p = 1; p < totalPages; p++) await listPage.goToNextPage();
    await expect(listPage.pageInfo).toHaveText(`Página ${totalPages} de ${totalPages}`);

    await expect(listPage.nextButton).toBeDisabled();
  });

  test('busca por referência exibe somente o embarque correspondente', async ({ listPage }) => {
    await listPage.filter({ q: 'lt-2026-0005' });

    await expect(listPage.rows).toHaveCount(1);
    expect((await listPage.readRows())[0]).toMatchObject({ reference: 'LT-2026-0005', customer: 'Eco Pack Embalagens' });
  });

  test('busca sem resultado exibe a tabela vazia', async ({ listPage }) => {
    await listPage.filter({ q: 'nada-encontrado' });

    await expect(listPage.rows).toHaveCount(0);
  });

  for (const status of ['CREATED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'] as const) {
    test(`filtro "${STATUS_LABEL[status]}" exibe apenas embarques desse status`, async ({ listPage, db }) => {
      const expected = db.named('count_with_status', { status })[0].total as number;

      await listPage.filter({ status });

      await expect(listPage.rows).toHaveCount(Math.min(expected, 10));
      const statuses = new Set((await listPage.readRows()).map((r) => r.status));
      expect([...statuses]).toEqual([STATUS_LABEL[status]]);
    });
  }

  test.fail('filtro "Desembaraço" exibe apenas embarques em desembaraço', knownBug('BUG-17'), async ({ listPage, db }) => {
    const expected = db.named('count_with_status', { status: 'CUSTOMS' })[0].total as number;

    await listPage.filter({ status: 'CUSTOMS' });

    const statuses = (await listPage.readRows()).map((r) => r.status);
    expect(statuses).toHaveLength(expected);
    expect(new Set(statuses)).toEqual(new Set([STATUS_LABEL.CUSTOMS]));
  });

  test.fail('total e paginação refletem o filtro aplicado', knownBug('BUG-05'), async ({ listPage, db }) => {
    const expected = db.named('count_with_status', { status: 'DELIVERED' })[0].total as number;

    await listPage.filter({ status: 'DELIVERED' });

    await expect(listPage.total).toHaveText(`${expected} embarques`);
    await expect(listPage.pageInfo).toHaveText(`Página 1 de ${Math.ceil(expected / 10)}`);
  });

  test.fail('data de criação é exibida no padrão brasileiro DD/MM/AAAA', knownBug('BUG-15'), async ({ listPage, db }) => {
    const [row] = db.named('shipment_by_reference', { reference: 'LT-2026-0001' });
    const [y, m, d] = String(row.created_at).slice(0, 10).split('-');
    await listPage.filter({ q: 'LT-2026-0001' });

    expect((await listPage.readRows())[0].createdAt).toBe(`${d}/${m}/${y}`);
  });

  test('clicar na linha abre o detalhe do embarque', async ({ page, listPage, detailPage, db }) => {
    const [first] = await listPage.readRows();
    const [row] = db.named('shipment_by_reference', { reference: first.reference });

    await listPage.openShipment(first.reference);

    await expect(page).toHaveURL(new RegExp(`#/shipments/${row.id}$`));
    await expect(detailPage.reference).toHaveText(first.reference);
    await expect(detailPage.customer).toHaveText(first.customer);
  });
});
