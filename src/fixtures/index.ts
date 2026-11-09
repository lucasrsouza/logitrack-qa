import { test as base, expect, type Page } from '@playwright/test';
import { AuthApi } from '../api/auth.api';
import { ShipmentsApi } from '../api/shipments.api';
import { LogiTrackDb } from '../db/database';
import { USERS, type Role } from '../data/users';
import { LoginPage } from '../pages/login.page';
import { ShipmentsListPage } from '../pages/shipments-list.page';
import { ShipmentFormPage } from '../pages/shipment-form.page';
import { ShipmentDetailPage } from '../pages/shipment-detail.page';

/**
 * Fixtures do Playwright fazem a injeção de dependências: cada teste declara o que
 * precisa (api do analista, api do admin, banco, páginas) e recebe pronto.
 *
 * `resetDatabase` é automática: TODO teste começa com POST /api/__reset, o que
 * garante independência entre testes e permite rodar qualquer um isoladamente.
 */
interface Fixtures {
  resetDatabase: void;
  authApi: AuthApi;
  /** API sem token. */
  anonymousApi: ShipmentsApi;
  analystApi: ShipmentsApi;
  adminApi: ShipmentsApi;
  db: LogiTrackDb;
  /** Página já autenticada (token injetado no localStorage, sem passar pela tela de login). */
  loggedInPage: Page;
  loginAs: (role: Role) => Promise<void>;
  loginPage: LoginPage;
  listPage: ShipmentsListPage;
  formPage: ShipmentFormPage;
  detailPage: ShipmentDetailPage;
}

export const test = base.extend<Fixtures>({
  resetDatabase: [
    async ({ request }, use) => {
      const res = await request.post('/api/__reset');
      expect(res.status(), 'POST /api/__reset').toBe(204);
      await use();
    },
    { auto: true },
  ],

  authApi: async ({ request }, use) => use(new AuthApi(request)),
  anonymousApi: async ({ request }, use) => use(new ShipmentsApi(request)),
  analystApi: async ({ request, authApi }, use) => use(new ShipmentsApi(request, await authApi.tokenFor(USERS.analista))),
  adminApi: async ({ request, authApi }, use) => use(new ShipmentsApi(request, await authApi.tokenFor(USERS.admin))),
  db: async ({}, use) => use(new LogiTrackDb()),

  loginAs: async ({ page, authApi }, use) => {
    await use(async (role) => {
      const res = await authApi.login(USERS[role].email, USERS[role].password);
      expect(res.status).toBe(200);
      const { token, user } = res.body;
      // Mesmo formato que a própria tela de login grava no localStorage.
      await page.addInitScript(
        ([t, u]) => {
          if (!window.localStorage.getItem('logitrack.token')) {
            window.localStorage.setItem('logitrack.token', t);
            window.localStorage.setItem('logitrack.user', u);
          }
        },
        [token, JSON.stringify({ id: user.id, name: user.name, email: user.email, role: user.role })],
      );
    });
  },

  loggedInPage: async ({ page, loginAs }, use) => {
    await loginAs('analista');
    await use(page);
  },

  loginPage: async ({ page }, use) => use(new LoginPage(page)),
  listPage: async ({ page }, use) => use(new ShipmentsListPage(page)),
  formPage: async ({ page }, use) => use(new ShipmentFormPage(page)),
  detailPage: async ({ page }, use) => use(new ShipmentDetailPage(page)),
});

export { expect };
