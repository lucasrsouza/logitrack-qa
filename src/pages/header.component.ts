import type { Locator, Page } from '@playwright/test';

/** Barra superior presente em todas as telas autenticadas. */
export class HeaderComponent {
  readonly root: Locator;
  readonly whoami: Locator;
  readonly logoutButton: Locator;
  readonly shipmentsLink: Locator;
  readonly newShipmentLink: Locator;

  constructor(page: Page) {
    this.root = page.locator('#topbar');
    this.whoami = page.locator('#whoami');
    this.logoutButton = page.getByRole('button', { name: 'Sair' });
    this.shipmentsLink = this.root.getByRole('link', { name: 'Embarques' });
    this.newShipmentLink = this.root.getByRole('link', { name: 'Novo embarque' });
  }

  async logout(): Promise<void> {
    await this.logoutButton.click();
  }
}
