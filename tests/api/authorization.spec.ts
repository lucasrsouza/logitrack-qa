import { test, expect } from '../../src/fixtures';
import { knownBug } from '../../src/support/known-bugs';

/** Regra 9: somente o perfil admin pode remover embarques. */
test.describe('Autorização por perfil', () => {
  test('admin remove embarque: 204, e o registro e o histórico deixam de existir', async ({ adminApi, db }) => {
    const shipment = await adminApi.createValid();

    const res = await adminApi.remove(shipment.id);

    expect(res.status).toBe(204);
    expect(res.body).toBeNull();
    expect((await adminApi.events(shipment.id)).status).toBe(404);
    expect(db.named('shipment_by_reference', { reference: shipment.reference })).toHaveLength(0);
    expect(db.named('orphan_events')).toHaveLength(0);
  });

  test.fail('analista não pode remover embarque: 403 FORBIDDEN e o registro permanece', knownBug('BUG-04'), async ({ analystApi, db }) => {
    const shipment = await analystApi.createValid();

    const res = await analystApi.remove(shipment.id);

    // Verifica primeiro o efeito colateral: mesmo que o status mude, o dado não pode sumir.
    expect.soft(db.named('shipment_by_reference', { reference: shipment.reference }), 'embarque ainda deve existir no banco').toHaveLength(1);
    expect(res.status).toBe(403);
    expect(res.body).toEqual(expect.objectContaining({ error: 'FORBIDDEN' }));
  });

  test('analista pode executar as demais operações (criar, editar, mudar status)', async ({ analystApi }) => {
    const shipment = await analystApi.createValid();

    const updated = await analystApi.update(shipment.id, { ...shipment, customer: 'Cliente Editado' });
    const moved = await analystApi.changeStatus(shipment.id, 'IN_TRANSIT');

    expect(updated.status).toBe(200);
    expect(moved.status).toBe(200);
  });

  test('admin recebe 404 ao remover embarque inexistente', async ({ adminApi }) => {
    const res = await adminApi.remove(999999);

    expect(res.status).toBe(404);
    expect(res.body).toEqual(expect.objectContaining({ error: 'NOT_FOUND' }));
  });
});
