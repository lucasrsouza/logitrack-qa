import { test, expect } from '../../src/fixtures';
import { knownBug } from '../../src/support/known-bugs';

/**
 * Parte C: as consultas de sql/consultas.sql rodam contra o banco recém-restaurado
 * (a fixture automática faz POST /api/__reset antes de cada teste).
 */
test.describe('SQL: consultas de apoio', () => {
  test('C.1 contagem por status bate com o total geral e com o filtro da API', async ({ db, analystApi }) => {
    const rows = db.named('count_by_status') as { status: string; total: number }[];
    const totalInDb = db.query('SELECT COUNT(*) AS total FROM shipments')[0].total as number;

    expect(rows.map((r) => r.status)).toEqual(['CREATED', 'IN_TRANSIT', 'CUSTOMS', 'DELIVERED', 'CANCELLED']);
    expect(rows.reduce((sum, r) => sum + r.total, 0)).toBe(totalInDb);
    for (const { status, total } of rows) {
      const api = await analystApi.list({ status, pageSize: 100 });
      expect.soft(api.body.data.length, `API status=${status}`).toBe(total);
    }
  });

  test('C.2 totais por cliente: ordenados por valor e somando todos os embarques', async ({ db }) => {
    const rows = db.named('totals_by_customer') as { customer: string; total_embarques: number; valor_total_usd: number }[];
    const totalInDb = db.query('SELECT COUNT(*) AS total FROM shipments')[0].total as number;

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.reduce((s, r) => s + r.total_embarques, 0)).toBe(totalInDb);
    const values = rows.map((r) => r.valor_total_usd);
    expect(values).toEqual([...values].sort((a, b) => b - a));
  });

  test('C.3 eventos órfãos: nenhum evento aponta para embarque inexistente', async ({ db }) => {
    expect(db.named('orphan_events')).toEqual([]);
  });
});

test.describe('SQL: integridade da massa de dados', () => {
  test.fail('C.3 todo embarque tem histórico consistente com o status atual', knownBug('BUG-22'), async ({ db }) => {
    const problems = db.named('history_inconsistencies');

    // Anexa o resultado da consulta ao relatório como evidência.
    await test.info().attach('history_inconsistencies.json', { body: JSON.stringify(problems, null, 2), contentType: 'application/json' });
    expect(problems).toEqual([]);
  });

  test.fail('C.4 nenhum embarque viola as regras de negócio', knownBug('BUG-23'), async ({ db }) => {
    const violations = db.named('business_rule_violations');

    await test.info().attach('business_rule_violations.json', { body: JSON.stringify(violations, null, 2), contentType: 'application/json' });
    expect(violations).toEqual([]);
  });

  test('a consulta C.3 detecta inconsistência criada pela própria API (DELIVERED → CANCELLED)', async ({ analystApi, db }) => {
    // Embarque criado e movido só pela API: o histórico gerado deve ser coerente...
    const shipment = await analystApi.createInStatus('DELIVERED');
    const byRef = (rows: Record<string, unknown>[]) => rows.filter((r) => r.reference === shipment.reference);
    expect(byRef(db.named('history_inconsistencies'))).toEqual([]);

    // ...mas a transição proibida aceita pela API (BUG-11) deixa rastro que o SQL encontra.
    const res = await analystApi.changeStatus(shipment.id, 'CANCELLED');
    test.skip(res.status !== 200, 'BUG-11 corrigido: a API já recusa a transição');

    expect(byRef(db.named('history_inconsistencies'))).toEqual([
      expect.objectContaining({ problema: 'TRANSICAO_PROIBIDA', detalhe: 'DELIVERED -> CANCELLED' }),
    ]);
  });
});
