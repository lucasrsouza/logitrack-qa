import { test, expect } from '../../src/fixtures';
import { buildShipment } from '../../src/data/shipment.factory';
import { knownBug } from '../../src/support/known-bugs';

/** C.5: o banco é a fonte da verdade para conferir o que a API respondeu. */
test.describe('SQL: a API grava o que informa', () => {
  test('embarque criado pela API está no banco com os mesmos dados e status CREATED', async ({ analystApi, db }) => {
    const input = buildShipment({ valueUsd: 2500, weightKg: 812.25 });

    const res = await analystApi.create(input);

    expect(res.status).toBe(201);
    const [row] = db.named('shipment_by_reference', { reference: input.reference });
    expect(row).toEqual({
      id: res.body.id,
      reference: input.reference,
      customer: input.customer,
      origin: input.origin,
      destination: input.destination,
      incoterm: input.incoterm,
      weight_kg: input.weightKg,
      value_usd: input.valueUsd,
      status: 'CREATED',
      created_at: res.body.createdAt,
      updated_at: res.body.updatedAt,
    });
  });

  test('cada mudança de status pela API gera exatamente um evento no banco', async ({ analystApi, db }) => {
    const shipment = await analystApi.createValid();
    const events = () => db.named('events_by_reference', { reference: shipment.reference });
    expect(events()).toHaveLength(1);

    await analystApi.changeStatus(shipment.id, 'IN_TRANSIT');
    await analystApi.changeStatus(shipment.id, 'CUSTOMS');
    await analystApi.changeStatus(shipment.id, 'CANCELLED'); // proibida: não pode gerar evento

    expect(events().map((e) => `${e.from_status ?? 'NULL'}>${e.to_status}`)).toEqual([
      'NULL>CREATED',
      'CREATED>IN_TRANSIT',
      'IN_TRANSIT>CUSTOMS',
    ]);
    const apiEvents = (await analystApi.events(shipment.id)).body;
    expect(apiEvents.map((e) => e.at)).toEqual(events().map((e) => e.created_at));
  });

  test.fail('valor com centavos informado na criação é persistido sem perda', knownBug('BUG-07'), async ({ analystApi, db }) => {
    const input = buildShipment({ valueUsd: 4321.09 });

    await analystApi.create(input);

    const [row] = db.named('shipment_by_reference', { reference: input.reference });
    expect(row.value_usd).toBe(4321.09);
  });
});
