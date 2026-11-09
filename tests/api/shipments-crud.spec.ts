import { test, expect } from '../../src/fixtures';
import { buildShipment, type ShipmentInput } from '../../src/data/shipment.factory';
import { errorSchema, expectToMatchSchema, shipmentSchema } from '../../src/schemas';
import { knownBug } from '../../src/support/known-bugs';

test.describe('Criação de embarque', () => {
  test('criação válida retorna 201, segue o contrato, nasce CREATED e com evento inicial', async ({ analystApi }) => {
    const input = buildShipment({ valueUsd: 15430 });

    const res = await analystApi.create(input);

    expect(res.status).toBe(201);
    expectToMatchSchema(res.body, shipmentSchema);
    expect(res.body).toMatchObject({ ...input, status: 'CREATED' });
    expect(res.body.createdAt).toBe(res.body.updatedAt);

    const fetched = await analystApi.get(res.body.id);
    expect(fetched.body).toEqual(res.body);
    const events = await analystApi.events(res.body.id);
    expect(events.body).toEqual([{ from: null, to: 'CREATED', at: res.body.createdAt }]);
  });

  test('status enviado no corpo é ignorado: todo embarque nasce CREATED', async ({ analystApi }) => {
    const res = await analystApi.create({ ...buildShipment(), status: 'DELIVERED', id: 1 });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('CREATED');
    expect(res.body.id).not.toBe(1);
  });

  const validBoundaries: [string, Partial<ShipmentInput>][] = [
    ['cliente com 2 caracteres', { customer: 'AB' }],
    ['cliente com 80 caracteres', { customer: 'C'.repeat(80) }],
    ['peso de 0,001 kg', { weightKg: 0.001 }],
    ['peso de 30.000 kg', { weightKg: 30000 }],
    ['valor de 10.000.000 USD', { valueUsd: 10000000 }],
    ...(['FOB', 'CIF', 'EXW', 'DAP', 'DDP'] as const).map((incoterm): [string, Partial<ShipmentInput>] => [`incoterm ${incoterm}`, { incoterm }]),
  ];
  for (const [title, override] of validBoundaries) {
    test(`aceita limite válido: ${title}`, async ({ analystApi }) => {
      const res = await analystApi.create(buildShipment(override));

      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body).toMatchObject(override);
    });
  }

  const invalidInputs: [string, Record<string, unknown>, string][] = [
    ['referência fora do formato', { reference: 'LT-26-1' }, 'reference'],
    ['referência em minúsculas', { reference: 'lt-2026-0999' }, 'reference'],
    ['referência ausente', { reference: undefined }, 'reference'],
    ['cliente com 1 caractere', { customer: 'A' }, 'customer'],
    ['cliente com 81 caracteres', { customer: 'C'.repeat(81) }, 'customer'],
    ['cliente só com espaços', { customer: '   ' }, 'customer'],
    ['origem vazia', { origin: '' }, 'origin'],
    ['destino ausente', { destination: undefined }, 'destination'],
    ['incoterm fora da lista', { incoterm: 'FCA' }, 'incoterm'],
    ['incoterm em minúsculas', { incoterm: 'fob' }, 'incoterm'],
    ['peso negativo', { weightKg: -1 }, 'weightKg'],
    ['peso acima de 30.000', { weightKg: 30000.01 }, 'weightKg'],
    ['peso como texto', { weightKg: '100' }, 'weightKg'],
    ['valor zero', { valueUsd: 0 }, 'valueUsd'],
    ['valor negativo', { valueUsd: -10 }, 'valueUsd'],
    ['valor acima de 10.000.000', { valueUsd: 10000000.01 }, 'valueUsd'],
  ];
  for (const [title, override, field] of invalidInputs) {
    test(`rejeita ${title} com 400 apontando o campo ${field}`, async ({ analystApi }) => {
      const input = buildShipment(override);

      const res = await analystApi.create(input);

      expect(res.status).toBe(400);
      expectToMatchSchema(res.body, errorSchema);
      expect(res.body).toMatchObject({ error: 'VALIDATION_ERROR' });
      expect((res.body as unknown as { details: { field: string }[] }).details.map((d) => d.field)).toContain(field);
    });
  }

  test('payload vazio lista todos os campos obrigatórios', async ({ analystApi }) => {
    const res = await analystApi.create({});

    expect(res.status).toBe(400);
    const fields = (res.body as unknown as { details: { field: string }[] }).details.map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['reference', 'customer', 'origin', 'destination', 'incoterm', 'weightKg', 'valueUsd']));
  });

  test.fail('valor com centavos é persistido sem perda', knownBug('BUG-07'), async ({ analystApi, db }) => {
    const input = buildShipment({ valueUsd: 1234.56 });

    const res = await analystApi.create(input);

    expect.soft(db.named('shipment_by_reference', { reference: input.reference })[0]?.value_usd, 'valor no banco').toBe(1234.56);
    expect(res.body.valueUsd).toBe(1234.56);
  });

  test.fail('valor de 0,29 USD não pode virar 0 (viola valor > 0)', knownBug('BUG-07'), async ({ analystApi }) => {
    const res = await analystApi.create(buildShipment({ valueUsd: 0.29 }));

    expect(res.status).toBe(201);
    expect(res.body.valueUsd).toBe(0.29);
  });

  test.fail('peso igual a 0 é rejeitado (peso deve ser maior que 0)', knownBug('BUG-08'), async ({ analystApi }) => {
    const res = await analystApi.create(buildShipment({ weightKg: 0 }));

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'VALIDATION_ERROR', details: [{ field: 'weightKg' }] });
  });

  for (const destination of ['Santos, BR', 'SANTOS, BR']) {
    test.fail(`origem igual ao destino (${destination}) é rejeitada`, knownBug('BUG-09'), async ({ analystApi }) => {
      const res = await analystApi.create(buildShipment({ origin: 'Santos, BR', destination }));

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: 'VALIDATION_ERROR', details: [{ field: 'destination' }] });
    });
  }

  test.fail('referência duplicada retorna 409 DUPLICATE_REFERENCE', knownBug('BUG-10'), async ({ analystApi, db }) => {
    const res = await analystApi.create(buildShipment({ reference: 'LT-2026-0001' }));

    expect(db.named('shipment_by_reference', { reference: 'LT-2026-0001' }), 'não pode duplicar no banco').toHaveLength(1);
    expect(res.status).toBe(409);
    expect(res.body).toEqual(expect.objectContaining({ error: 'DUPLICATE_REFERENCE' }));
  });

  test.fail('JSON malformado retorna 400, e não erro interno', knownBug('BUG-13'), async ({ analystApi }) => {
    const res = await analystApi.createRaw('{"reference": "LT-2026-5555",');

    expect(res.status).toBe(400);
  });
});

test.describe('Consulta de embarque', () => {
  test('detalhe devolve o embarque completo segundo o contrato', async ({ analystApi }) => {
    const res = await analystApi.get(1);

    expect(res.status).toBe(200);
    expectToMatchSchema(res.body, shipmentSchema);
    expect(res.body).toMatchObject({ id: 1, reference: 'LT-2026-0001' });
  });

  test.fail('embarque inexistente retorna 404 NOT_FOUND', knownBug('BUG-12'), async ({ analystApi }) => {
    const res = await analystApi.get(999999);

    expect(res.status).toBe(404);
    expect(res.body).toEqual(expect.objectContaining({ error: 'NOT_FOUND' }));
  });
});

test.describe('Edição de embarque', () => {
  test('edição de embarque CREATED atualiza os dados e o updatedAt', async ({ analystApi }) => {
    const shipment = await analystApi.createValid();
    const changes = buildShipment({ reference: shipment.reference, customer: 'Cliente Renomeado', incoterm: 'DDP', valueUsd: 99.9 });

    const res = await analystApi.update(shipment.id, changes);

    expect(res.status).toBe(200);
    expectToMatchSchema(res.body, shipmentSchema);
    expect(res.body).toMatchObject({ ...changes, id: shipment.id, status: 'CREATED', createdAt: shipment.createdAt });
    expect(Date.parse(res.body.updatedAt)).toBeGreaterThanOrEqual(Date.parse(shipment.updatedAt));
    expect((await analystApi.get(shipment.id)).body).toEqual(res.body);
  });

  test('edição não altera o status nem gera evento de histórico', async ({ analystApi }) => {
    const shipment = await analystApi.createValid();

    const res = await analystApi.update(shipment.id, { ...buildShipment({ reference: shipment.reference }), status: 'DELIVERED' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CREATED');
    expect((await analystApi.events(shipment.id)).body).toHaveLength(1);
  });

  for (const status of ['IN_TRANSIT', 'CUSTOMS', 'DELIVERED', 'CANCELLED'] as const) {
    test(`embarque ${status} não pode ser editado: 422 NOT_EDITABLE`, async ({ analystApi }) => {
      const shipment = await analystApi.createInStatus(status);

      const res = await analystApi.update(shipment.id, buildShipment({ reference: shipment.reference, customer: 'Não deveria mudar' }));

      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({ error: 'NOT_EDITABLE' });
      expect((await analystApi.get(shipment.id)).body.customer).toBe(shipment.customer);
    });
  }

  test('edição aplica as mesmas validações da criação', async ({ analystApi }) => {
    const shipment = await analystApi.createValid();

    const res = await analystApi.update(shipment.id, { customer: 'X' });

    expect(res.status).toBe(400);
    const fields = (res.body as unknown as { details: { field: string }[] }).details.map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['customer', 'origin', 'destination', 'incoterm', 'weightKg', 'valueUsd']));
  });

  test('edição com origem igual ao destino é rejeitada', async ({ analystApi }) => {
    const shipment = await analystApi.createValid();

    const res = await analystApi.update(shipment.id, buildShipment({ reference: shipment.reference, origin: 'Itajaí, BR', destination: 'itajaí, br' }));

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ details: [{ field: 'destination' }] });
  });

  test('edição para referência de outro embarque retorna 409 DUPLICATE_REFERENCE', async ({ analystApi }) => {
    const shipment = await analystApi.createValid();

    const res = await analystApi.update(shipment.id, buildShipment({ reference: 'LT-2026-0001' }));

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'DUPLICATE_REFERENCE' });
  });

  test('edição de embarque inexistente retorna 404', async ({ analystApi }) => {
    const res = await analystApi.update(999999, buildShipment());

    expect(res.status).toBe(404);
  });
});
