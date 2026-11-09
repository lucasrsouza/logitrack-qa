import { test, expect } from '../../src/fixtures';
import { STATUSES } from '../../src/data/shipment.factory';
import { errorSchema, expectToMatchSchema, listSchema } from '../../src/schemas';
import { knownBug } from '../../src/support/known-bugs';

/**
 * Os números esperados vêm do banco (consultas de sql/consultas.sql), não de constantes:
 * o teste continua correto se a massa inicial mudar.
 */
test.describe('Listagem de embarques', () => {
  test('listagem padrão segue o contrato, pagina de 10 em 10 e ordena do mais recente', async ({ analystApi, db }) => {
    const totalInDb = db.query('SELECT COUNT(*) AS total FROM shipments')[0].total as number;

    const res = await analystApi.list();

    expect(res.status).toBe(200);
    expectToMatchSchema(res.body, listSchema);
    expect(res.body.meta).toEqual({ page: 1, pageSize: 10, total: totalInDb, totalPages: Math.ceil(totalInDb / 10) });
    expect(res.body.data).toHaveLength(10);
    const createdAt = res.body.data.map((s) => s.createdAt);
    expect(createdAt).toEqual([...createdAt].sort().reverse());
  });

  test.fail('percorrer todas as páginas devolve cada embarque uma única vez', knownBug('BUG-24'), async ({ analystApi }) => {
    const pageSize = 7;
    const first = await analystApi.list({ pageSize });
    const { total, totalPages } = first.body.meta;
    expect(totalPages).toBe(Math.ceil(total / pageSize));

    const seen: string[] = [];
    for (let page = 1; page <= totalPages; page++) {
      const res = await analystApi.list({ page, pageSize });
      expect(res.body.meta.page).toBe(page);
      seen.push(...res.body.data.map((s) => s.reference));
    }

    const all = (await analystApi.list({ pageSize: 100 })).body.data.map((s) => s.reference);
    const missing = all.filter((ref) => !seen.includes(ref));
    expect(missing, 'embarques que não aparecem em nenhuma página').toEqual([]);
    expect(seen).toHaveLength(total);
    expect(new Set(seen).size).toBe(total);
  });

  test.fail('página 2 começa exatamente no embarque seguinte ao último da página 1', knownBug('BUG-24'), async ({ analystApi }) => {
    const all = (await analystApi.list({ pageSize: 20 })).body.data.map((s) => s.reference);

    const page2 = (await analystApi.list({ page: 2, pageSize: 10 })).body.data.map((s) => s.reference);

    expect(page2).toEqual(all.slice(10, 20));
  });

  test('página além da última retorna lista vazia com meta coerente', async ({ analystApi }) => {
    const { totalPages, total } = (await analystApi.list()).body.meta;

    const res = await analystApi.list({ page: totalPages + 1 });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta).toMatchObject({ page: totalPages + 1, total, totalPages });
  });

  test('pageSize acima do máximo do contrato (100) é limitado a 100', async ({ analystApi }) => {
    const res = await analystApi.list({ pageSize: 500 });

    expect(res.status).toBe(200);
    expect(res.body.meta.pageSize).toBe(100);
  });

  for (const status of STATUSES) {
    test(`filtro status=${status} devolve apenas embarques desse status`, async ({ analystApi, db }) => {
      const expected = db.named('count_with_status', { status })[0].total as number;

      const res = await analystApi.list({ status, pageSize: 100 });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(expected);
      expect(new Set(res.body.data.map((s) => s.status))).toEqual(new Set([status]));
    });
  }

  test('filtro com status inexistente retorna 400 VALIDATION_ERROR', async ({ analystApi }) => {
    const res = await analystApi.list({ status: 'EXTRAVIADO' });

    expect(res.status).toBe(400);
    expectToMatchSchema(res.body, errorSchema);
    expect(res.body).toMatchObject({ error: 'VALIDATION_ERROR', details: [{ field: 'status' }] });
  });

  test.fail('meta.total e meta.totalPages consideram o filtro de status', knownBug('BUG-05'), async ({ analystApi, db }) => {
    const expected = db.named('count_with_status', { status: 'CREATED' })[0].total as number;

    const res = await analystApi.list({ status: 'CREATED', pageSize: 5 });

    expect(res.body.meta.total).toBe(expected);
    expect(res.body.meta.totalPages).toBe(Math.ceil(expected / 5));
  });

  test.fail('meta.total considera a busca q', knownBug('BUG-05'), async ({ analystApi }) => {
    const res = await analystApi.list({ q: 'LT-2026-0001' });

    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toMatchObject({ total: 1, totalPages: 1 });
  });
});

test.describe('Busca (q)', () => {
  test('busca por referência é parcial e não diferencia maiúsculas', async ({ analystApi }) => {
    for (const q of ['LT-2026-0001', 'lt-2026-0001', '2026-0001']) {
      const res = await analystApi.list({ q });
      expect.soft(res.body.data.map((s) => s.reference), `q=${q}`).toEqual(['LT-2026-0001']);
    }
  });

  test('busca sem correspondência retorna lista vazia', async ({ analystApi }) => {
    const res = await analystApi.list({ q: 'nao-existe-xyz' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  test('busca combinada com filtro de status aplica os dois critérios', async ({ analystApi }) => {
    const res = await analystApi.list({ q: 'LT-2026-000', status: 'DELIVERED', pageSize: 100 });

    expect(res.body.data.length).toBeGreaterThan(0);
    for (const s of res.body.data) {
      expect(s.reference).toContain('LT-2026-000');
      expect(s.status).toBe('DELIVERED');
    }
  });

  test('busca com tentativa de SQL injection é tratada como texto', async ({ analystApi }) => {
    const res = await analystApi.list({ q: "' OR 1=1 --", pageSize: 100 });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  test.fail('busca por nome do cliente, sem diferenciar maiúsculas', knownBug('BUG-06'), async ({ analystApi, db }) => {
    const expected = db.named('count_matching_search', { q: 'atlas' })[0].total as number;
    expect(expected, 'massa deve ter clientes "Atlas"').toBeGreaterThan(0);

    for (const q of ['Atlas', 'atlas', 'ATLAS IMPORT']) {
      const res = await analystApi.list({ q, pageSize: 100 });
      expect.soft(res.body.data.length, `q=${q}`).toBeGreaterThan(0);
      for (const s of res.body.data) expect.soft(s.customer.toLowerCase()).toContain('atlas');
    }
    const atlas = await analystApi.list({ q: 'atlas', pageSize: 100 });
    expect(atlas.body.data).toHaveLength(expected);
  });

  test.fail('caracteres % e _ na busca são literais, não curingas', knownBug('BUG-14'), async ({ analystApi }) => {
    for (const q of ['%', '_']) {
      const res = await analystApi.list({ q, pageSize: 100 });
      expect.soft(res.body.data, `q=${q}`).toEqual([]);
    }
  });
});
