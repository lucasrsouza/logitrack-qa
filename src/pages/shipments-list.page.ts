import { expect, type Locator, type Page } from '@playwright/test';
import type { Status } from '../data/shipment.factory';
import { HeaderComponent } from './header.component';

export class ShipmentsListPage {
  readonly header: HeaderComponent;
  readonly heading: Locator;
  readonly search: Locator;
  readonly statusFilter: Locator;
  readonly applyButton: Locator;
  readonly rows: Locator;
  readonly total: Locator;
  readonly pageInfo: Locator;
  readonly nextButton: Locator;
  readonly prevButton: Locator;
  readonly toast: Locator;

  constructor(private readonly page: Page) {
    this.header = new HeaderComponent(page);
    this.heading = page.getByRole('heading', { name: 'Embarques' });
    this.search = page.getByLabel('Buscar');
    this.statusFilter = page.getByLabel('Status');
    this.applyButton = page.getByRole('button', { name: 'Filtrar' });
    this.rows = page.getByTestId('shipment-row');
    this.total = page.locator('#total');
    this.pageInfo = page.locator('#page-info');
    this.nextButton = page.getByRole('button', { name: 'Próxima' });
    this.prevButton = page.getByRole('button', { name: 'Anterior' });
    this.toast = page.getByTestId('toast');
  }

  async goto(): Promise<void> {
    await this.page.goto('/#/shipments');
    await this.waitForTable();
  }

  /** Espera a tabela renderizar (o "Carregando…" some quando a API responde). */
  async waitForTable(): Promise<void> {
    await expect(this.pageInfo).toBeVisible();
  }

  async filter({ q = '', status = '' }: { q?: string; status?: Status | '' }): Promise<void> {
    const response = this.page.waitForResponse((r) => r.url().includes('/api/shipments?') && r.request().method() === 'GET');
    await this.search.fill(q);
    await this.statusFilter.selectOption(status);
    await this.applyButton.click();
    await response;
    await this.waitForTable();
  }

  async goToNextPage(): Promise<void> {
    const before = await this.pageInfo.textContent();
    await this.nextButton.click();
    await expect(this.pageInfo).not.toHaveText(before ?? '');
  }

  rowByReference(reference: string): Locator {
    return this.rows.filter({ has: this.page.getByRole('cell', { name: reference, exact: true }) });
  }

  /** Lê as linhas visíveis como objetos (Referência, Cliente, Rota, Status, Criado em). */
  async readRows(): Promise<{ reference: string; customer: string; route: string; status: string; createdAt: string }[]> {
    return this.rows.evaluateAll((trs) =>
      trs.map((tr) => {
        const c = Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent ?? '').trim());
        return { reference: c[0], customer: c[1], route: c[2], status: c[3], createdAt: c[4] };
      }),
    );
  }

  async openShipment(reference: string): Promise<void> {
    await this.rowByReference(reference).click();
  }
}
