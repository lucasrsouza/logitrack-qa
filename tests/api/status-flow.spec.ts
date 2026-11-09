import { test, expect } from '../../src/fixtures';
import type { ShipmentsApi } from '../../src/api/shipments.api';
import { STATUSES, type Status } from '../../src/data/shipment.factory';
import { eventsSchema, expectToMatchSchema } from '../../src/schemas';
import { knownBug } from '../../src/support/known-bugs';

/** Regra 6: matriz completa de transições. Tudo que não está aqui deve ser 422. */
const ALLOWED: Record<Status, Status[]> = {
  CREATED: ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['CUSTOMS', 'CANCELLED'],
  CUSTOMS: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

test.describe('Fluxo de status: transições permitidas', () => {
  for (const from of STATUSES) {
    for (const to of ALLOWED[from]) {
      test(`${from} → ${to} é aceita e registra o evento`, async ({ analystApi }) => {
        const shipment = await analystApi.createInStatus(from);
        const before = (await analystApi.events(shipment.id)).body;

        const res = await analystApi.changeStatus(shipment.id, to);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ id: shipment.id, status: to });
        const after = (await analystApi.events(shipment.id)).body;
        expect(after).toHaveLength(before.length + 1);
        expect(after.at(-1)).toMatchObject({ from, to });
        expect((await analystApi.get(shipment.id)).body.status).toBe(to);
      });
    }
  }
});

test.describe('Fluxo de status: transições proibidas', () => {
  for (const from of STATUSES) {
    const forbidden = STATUSES.filter((to) => !ALLOWED[from].includes(to));
    for (const to of forbidden) {
      // DELIVERED → CANCELLED hoje é aceita pela API: mesmo cenário, declarado como bug conhecido.
      const isBug = from === 'DELIVERED' && to === 'CANCELLED';
      const title = `${from} → ${to} é rejeitada com 422 e não altera nada`;
      const scenario = async ({ analystApi }: { analystApi: ShipmentsApi }) => {
        const shipment = await analystApi.createInStatus(from);
        const eventsBefore = (await analystApi.events(shipment.id)).body;

        const res = await analystApi.changeStatus(shipment.id, to);

        expect(res.status).toBe(422);
        expect(res.body).toMatchObject({ error: 'INVALID_TRANSITION' });
        expect((await analystApi.get(shipment.id)).body.status).toBe(from);
        expect((await analystApi.events(shipment.id)).body).toEqual(eventsBefore);
      };
      if (isBug) test.fail(title, knownBug('BUG-11'), scenario);
      else test(title, scenario);
    }
  }

  test('status inexistente ou ausente retorna 400 VALIDATION_ERROR', async ({ analystApi }) => {
    const shipment = await analystApi.createValid();

    for (const status of ['EXTRAVIADO', 'in_transit', '', undefined]) {
      const res = await analystApi.changeStatus(shipment.id, status);
      expect.soft(res.status, `status=${String(status)}`).toBe(400);
    }
    expect((await analystApi.get(shipment.id)).body.status).toBe('CREATED');
  });

  test('mudança de status em embarque inexistente retorna 404', async ({ analystApi }) => {
    const res = await analystApi.changeStatus(999999, 'IN_TRANSIT');

    expect(res.status).toBe(404);
  });
});

test.describe('Histórico', () => {
  test('fluxo completo até DELIVERED gera histórico encadeado e em ordem cronológica', async ({ analystApi }) => {
    const shipment = await analystApi.createInStatus('DELIVERED');

    const res = await analystApi.events(shipment.id);

    expect(res.status).toBe(200);
    expectToMatchSchema(res.body, eventsSchema);
    expect(res.body.map(({ from, to }) => ({ from, to }))).toEqual([
      { from: null, to: 'CREATED' },
      { from: 'CREATED', to: 'IN_TRANSIT' },
      { from: 'IN_TRANSIT', to: 'CUSTOMS' },
      { from: 'CUSTOMS', to: 'DELIVERED' },
    ]);
    const timestamps = res.body.map((e) => e.at);
    expect(timestamps).toEqual([...timestamps].sort());
    expect(res.body[0].at).toBe(shipment.createdAt);
    expect(res.body.at(-1)!.at).toBe(shipment.updatedAt);
  });

  test('histórico de embarque inexistente retorna 404', async ({ analystApi }) => {
    const res = await analystApi.events(999999);

    expect(res.status).toBe(404);
    expect(res.body).toEqual(expect.objectContaining({ error: 'NOT_FOUND' }));
  });
});
