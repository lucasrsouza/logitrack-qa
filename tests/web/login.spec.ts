import { test, expect } from '../../src/fixtures';
import { USERS } from '../../src/data/users';
import { knownBug } from '../../src/support/known-bugs';

test.describe('Web: login e logout', () => {
  test('login válido leva à listagem e identifica o usuário', async ({ page, loginPage, listPage }) => {
    await loginPage.goto();

    await loginPage.login(USERS.analista.email, USERS.analista.password);

    await expect(page).toHaveURL(/#\/shipments$/);
    await expect(listPage.heading).toBeVisible();
    await expect(listPage.header.whoami).toHaveText('Ana Analista (analista)');
  });

  test('login com senha incorreta mostra erro e permanece na tela de login', async ({ page, loginPage }) => {
    await loginPage.goto();

    await loginPage.login(USERS.analista.email, 'Errada@123');

    await expect(loginPage.error).toHaveText('E-mail ou senha inválidos.');
    await expect(page).toHaveURL(/#\/login$/);
    expect(await page.evaluate(() => localStorage.getItem('logitrack.token'))).toBeNull();
  });

  test('login com campos vazios mostra erro e não autentica', async ({ page, loginPage }) => {
    await loginPage.goto();

    await loginPage.submit.click();

    // A API responde 400; a tela mostra uma mensagem genérica (ver observação O-03 do relatório).
    await expect(loginPage.error).not.toBeEmpty();
    await expect(page).toHaveURL(/#\/login$/);
  });

  test('rota protegida sem sessão redireciona para o login', async ({ page, loginPage }) => {
    await page.goto('/#/shipments');

    await expect(page).toHaveURL(/#\/login$/);
    await expect(loginPage.heading).toBeVisible();
  });

  test('logout volta para a tela de login', async ({ page, loginPage, listPage }) => {
    await loginPage.goto();
    await loginPage.login(USERS.admin.email, USERS.admin.password);
    await expect(listPage.header.whoami).toHaveText('Admin Master (admin)');

    await listPage.header.logout();

    await expect(page).toHaveURL(/#\/login$/);
    await expect(loginPage.heading).toBeVisible();
  });

  test.fail('tela de login não exibe a barra do usuário (nome, menu e Sair)', knownBug('BUG-25'), async ({ loginPage, listPage }) => {
    await loginPage.goto();
    await loginPage.login(USERS.admin.email, USERS.admin.password);
    await expect(listPage.header.whoami).toHaveText('Admin Master (admin)');

    await listPage.header.logout();
    await expect(loginPage.heading).toBeVisible();

    await expect(listPage.header.root).toBeHidden();
    await expect(listPage.header.whoami).not.toBeVisible();
  });

  test.fail('após o logout a sessão é encerrada: a listagem exige novo login', knownBug('BUG-18'), async ({ page, loginPage, listPage }) => {
    await loginPage.goto();
    await loginPage.login(USERS.analista.email, USERS.analista.password);
    await expect(listPage.heading).toBeVisible();
    await listPage.header.logout();
    await expect(loginPage.heading).toBeVisible();

    await page.goto('/#/shipments');

    expect.soft(await page.evaluate(() => localStorage.getItem('logitrack.token')), 'token deveria ser removido').toBeNull();
    await expect(loginPage.heading).toBeVisible();
    await expect(listPage.rows).toHaveCount(0);
  });
});
