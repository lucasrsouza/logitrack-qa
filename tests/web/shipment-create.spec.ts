import { test, expect } from '../../src/fixtures';
import { buildShipment } from '../../src/data/shipment.factory';
import { knownBug } from '../../src/support/known-bugs';

test.describe('Web: cadastro de embarque', () => {
  test.beforeEach(async ({ loggedInPage, formPage }) => {
    void loggedInPage;
    await formPage.goto();
    await expect(formPage.heading).toBeVisible();
  });

  test('cadastro válido mostra sucesso, volta para a listagem e persiste via API', async ({ page, formPage, analystApi }) => {
    const data = buildShipment({ incoterm: 'CIF', valueUsd: 5000 });

    const response = await formPage.create(data);

    expect(response.status()).toBe(201);
    await expect(formPage.toast).toHaveText('Embarque criado com sucesso.');
    await expect(page).toHaveURL(/#\/shipments$/);
    const created = (await analystApi.list({ q: data.reference })).body.data;
    expect(created).toEqual([expect.objectContaining({ ...data, status: 'CREATED' })]);
  });

  test('envio vazio destaca todos os campos obrigatórios', async ({ page, formPage }) => {
    const response = await formPage.submit();

    expect(response.status()).toBe(400);
    await expect(formPage.toast).toHaveText('Corrija os campos destacados.');
    for (const field of ['reference', 'customer', 'origin', 'destination', 'incoterm', 'weightKg', 'valueUsd'] as const) {
      await expect.soft(formPage.fieldError(field), field).not.toBeEmpty();
    }
    await expect(page).toHaveURL(/#\/shipments\/new$/);
  });

  const invalid = [
    { field: 'reference', value: 'LT2026-1', message: 'Formato esperado: LT-AAAA-NNNN' },
    { field: 'customer', value: 'A', message: 'Cliente deve ter entre 2 e 80 caracteres' },
    { field: 'weightKg', value: 30001, message: 'Peso deve ser maior que 0 e no máximo 30000 kg' },
    { field: 'valueUsd', value: -1, message: 'Valor deve ser maior que 0 e no máximo 10.000.000' },
  ] as const;
  for (const { field, value, message } of invalid) {
    test(`campo ${field} inválido mostra a mensagem só nele`, async ({ formPage }) => {
      await formPage.fill({ ...buildShipment(), [field]: value });

      await formPage.submit();

      await expect(formPage.fieldError(field)).toHaveText(message);
      const others = (['reference', 'customer', 'origin', 'destination', 'incoterm', 'weightKg', 'valueUsd'] as const).filter((f) => f !== field);
      for (const other of others) await expect.soft(formPage.fieldError(other), other).toBeEmpty();
    });
  }

  test('cancelar volta para a listagem sem criar nada', async ({ page, formPage, db }) => {
    const data = buildShipment();
    await formPage.fill(data);

    await formPage.cancelButton.click();

    await expect(page).toHaveURL(/#\/shipments$/);
    expect(db.named('shipment_by_reference', { reference: data.reference })).toHaveLength(0);
  });

  test.fail('referência duplicada mostra erro, e não mensagem de sucesso', knownBug('BUG-20', 'BUG-10'), async ({ page, formPage }) => {
    await formPage.create(buildShipment({ reference: 'LT-2026-0001' }));

    await expect(formPage.toast).not.toHaveText('Embarque criado com sucesso.');
    await expect(formPage.toast).toHaveClass(/err/);
    await expect(page).toHaveURL(/#\/shipments\/new$/);
  });

  test.fail('embarque recém-criado aparece no topo da listagem', knownBug('BUG-19'), async ({ formPage, listPage }) => {
    // Fluxo real do usuário: abre a listagem primeiro e depois cadastra.
    await listPage.goto();
    await listPage.header.newShipmentLink.click();
    const data = buildShipment();

    await formPage.create(data);
    await expect(formPage.toast).toHaveText('Embarque criado com sucesso.');

    await listPage.waitForTable();
    await expect(listPage.rowByReference(data.reference)).toBeVisible();
  });
});
