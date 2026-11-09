import { test, expect } from '../../src/fixtures';
import { buildShipment } from '../../src/data/shipment.factory';

/** Fluxos de ponta a ponta que cruzam as camadas: API ↔ tela ↔ banco. */
test.describe('Web + API + SQL: ponta a ponta', () => {
  test.beforeEach(async ({ loggedInPage }) => {
    void loggedInPage;
  });

  test('embarque criado pela API aparece na busca da tela e no detalhe', async ({ analystApi, listPage, detailPage }) => {
    const shipment = await analystApi.createValid({ customer: 'Integração API', origin: 'Manaus, BR', destination: 'Lisboa, PT' });

    await listPage.goto();
    await listPage.filter({ q: shipment.reference });

    await expect(listPage.rows).toHaveCount(1);
    expect((await listPage.readRows())[0]).toMatchObject({
      reference: shipment.reference,
      customer: 'Integração API',
      route: 'Manaus, BR → Lisboa, PT',
      status: 'Criado',
    });
    await listPage.openShipment(shipment.reference);
    await expect(detailPage.reference).toHaveText(shipment.reference);
  });

  test('embarque cadastrado pela tela é gravado no banco e devolvido pela API', async ({ formPage, analystApi, db }) => {
    const data = buildShipment({ customer: 'Integração Tela', incoterm: 'DAP', weightKg: 742.5, valueUsd: 18000 });
    await formPage.goto();

    const response = await formPage.create(data);
    const created = await response.json();

    const [row] = db.named('shipment_by_reference', { reference: data.reference });
    expect(row).toMatchObject({
      id: created.id,
      customer: 'Integração Tela',
      incoterm: 'DAP',
      weight_kg: 742.5,
      value_usd: 18000,
      status: 'CREATED',
    });
    expect((await analystApi.get(created.id)).body).toMatchObject({ ...data, status: 'CREATED' });
    expect(db.named('events_by_reference', { reference: data.reference })).toEqual([
      expect.objectContaining({ from_status: null, to_status: 'CREATED' }),
    ]);
  });

  test('mudança de status feita na tela gera evento no banco e na API', async ({ analystApi, detailPage, db }) => {
    const shipment = await analystApi.createValid();
    await detailPage.goto(shipment.id);

    await detailPage.changeStatus('Iniciar trânsito');
    await expect(detailPage.status).toHaveText('Em trânsito');

    expect(db.named('shipment_by_reference', { reference: shipment.reference })[0].status).toBe('IN_TRANSIT');
    expect(db.named('events_by_reference', { reference: shipment.reference }).map((e) => e.to_status)).toEqual(['CREATED', 'IN_TRANSIT']);
    expect((await analystApi.events(shipment.id)).body.at(-1)).toMatchObject({ from: 'CREATED', to: 'IN_TRANSIT' });
  });
});
