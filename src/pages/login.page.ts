import type { Locator, Page } from '@playwright/test';

export class LoginPage {
  readonly heading: Locator;
  readonly email: Locator;
  readonly password: Locator;
  readonly submit: Locator;
  readonly error: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Entrar no LogiTrack' });
    this.email = page.getByLabel('E-mail');
    this.password = page.getByLabel('Senha');
    this.submit = page.getByRole('button', { name: 'Entrar' });
    this.error = page.locator('#login-error');
  }

  async goto(): Promise<void> {
    await this.page.goto('/#/login');
  }

  async login(email: string, password: string): Promise<void> {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.submit.click();
  }
}
