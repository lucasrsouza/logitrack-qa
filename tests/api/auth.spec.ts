import { test, expect } from '../../src/fixtures';
import { USERS } from '../../src/data/users';
import { errorSchema, expectToMatchSchema, loginSchema } from '../../src/schemas';
import { knownBug } from '../../src/support/known-bugs';

test.describe('Autenticação', () => {
  for (const user of Object.values(USERS)) {
    test(`login válido do perfil ${user.role} devolve token e dados do usuário`, async ({ authApi, analystApi }) => {
      const res = await authApi.login(user.email, user.password);

      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({ name: user.name, email: user.email, role: user.role });
      // O token emitido precisa realmente dar acesso a um endpoint protegido.
      const list = await analystApi.withToken(res.body.token).list();
      expect(list.status).toBe(200);
    });
  }

  test.fail('resposta do login segue o contrato e não expõe dados sensíveis', knownBug('BUG-01'), async ({ authApi }) => {
    const res = await authApi.login(USERS.analista.email, USERS.analista.password);

    expect(res.status).toBe(200);
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expectToMatchSchema(res.body, loginSchema);
  });

  const invalidCredentials = [
    { title: 'senha incorreta', email: USERS.analista.email, password: 'Errada@123' },
    { title: 'senha com maiúsculas trocadas', email: USERS.analista.email, password: USERS.analista.password.toLowerCase() },
    { title: 'e-mail inexistente', email: 'ninguem@logitrack.test', password: USERS.analista.password },
    { title: 'senha de outro usuário', email: USERS.analista.email, password: USERS.admin.password },
  ];
  for (const c of invalidCredentials) {
    test(`login com ${c.title} retorna 401 INVALID_CREDENTIALS`, async ({ authApi }) => {
      const res = await authApi.login(c.email, c.password);

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'INVALID_CREDENTIALS' });
      expect(res.body).not.toHaveProperty('token');
    });
  }

  const missingFields = [
    { title: 'sem e-mail', email: undefined, password: USERS.analista.password },
    { title: 'sem senha', email: USERS.analista.email, password: undefined },
    { title: 'com campos vazios', email: '', password: '' },
  ];
  for (const c of missingFields) {
    test(`login ${c.title} retorna 400 VALIDATION_ERROR`, async ({ authApi }) => {
      const res = await authApi.login(c.email, c.password);

      expect(res.status).toBe(400);
      expectToMatchSchema(res.body, errorSchema);
      expect(res.body).toMatchObject({ error: 'VALIDATION_ERROR' });
    });
  }
});

test.describe('Acesso sem token ou com token inválido', () => {
  test('listagem sem token retorna 401 UNAUTHORIZED', async ({ anonymousApi }) => {
    const res = await anonymousApi.list();

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'UNAUTHORIZED' });
  });

  test('cabeçalho Authorization sem o esquema Bearer retorna 401', async ({ request }) => {
    const res = await request.get('/api/shipments', { headers: { Authorization: 'qualquer-coisa' } });

    expect(res.status()).toBe(401);
  });

  test('operações de escrita e histórico sem token retornam 401', async ({ anonymousApi }) => {
    const calls = {
      'GET /events': () => anonymousApi.events(1),
      'POST /shipments': () => anonymousApi.create({}),
      'PUT /shipments/1': () => anonymousApi.update(1, {}),
      'PATCH /status': () => anonymousApi.changeStatus(1, 'IN_TRANSIT'),
      'DELETE /shipments/1': () => anonymousApi.remove(1),
    };
    for (const [name, call] of Object.entries(calls)) {
      const res = await call();
      expect.soft(res.status, name).toBe(401);
    }
  });

  test.fail('detalhe do embarque sem token retorna 401', knownBug('BUG-02'), async ({ anonymousApi }) => {
    const res = await anonymousApi.get(1);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'UNAUTHORIZED' });
  });

  const invalidTokens = {
    'texto aleatório': 'abc',
    'JWT malformado': 'a.b.c',
    'JWT com assinatura forjada': forgeToken('HS256', 'assinatura-falsa'),
    'JWT com alg none': forgeToken('none', ''),
  };
  for (const [title, token] of Object.entries(invalidTokens)) {
    test.fail(`token inválido (${title}) retorna 401, e não erro interno`, knownBug('BUG-03'), async ({ analystApi }) => {
      const res = await analystApi.withToken(token).list();

      // O ponto de segurança é não dar acesso; o defeito é responder 500.
      expect(res.status).not.toBe(200);
      expect(res.status).toBe(401);
    });
  }
});

/** Monta um JWT com payload de admin que NÃO foi assinado pela aplicação. */
function forgeToken(alg: string, signature: string): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg, typ: 'JWT' })}.${b64({ sub: 2, role: 'admin', name: 'Intruso', exp: 4102444800 })}.${signature}`;
}
