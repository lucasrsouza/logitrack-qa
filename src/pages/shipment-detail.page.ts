import type { Locator, Page } from '@playwright/test';
import { HeaderComponent } from './header.component';

export class ShipmentDetailPage {
  readonly header: HeaderComponent;
  readonly reference: Locator;
  readonly customer: Locator;
  readonly value: Locator;
  readonly status: Locator;
  readonly timeline: Locator;
  readonly timelineItems: Locator;
  readonly backButton: Locator;
  readonly actionButtons: Locator;
  readonly toast: Locator;

  constructor(private readonly page: Page) {
    this.header = new HeaderComponent(page);
    this.reference = page.locator('#detail-ref');
    this.customer = page.locator('#d-customer');
    this.value = page.locator('#d-value');
    this.status = page.locator('#d-status');
    this.timeline = page.locator('#timeline');
    this.timelineItems = this.timeline.locator('li');
    this.backButton = page.getByRole('button', { name: 'Voltar' });
    this.actionButtons = page.locator('.actions button');
    this.toast = page.getByTestId('toast');
  }

  async goto(id: number): Promise<void> {
    await this.page.goto(`/#/shipments/${id}`);
  }

  /** Valor de um campo da lista de definição (Cliente, Rota, Incoterm, Peso, Valor, Status, Criado em). */
  field(label: string): Locator {
    return this.page.locator(`dt:text-is("${label}") + dd`);
  }

  actionButton(name: string): Locator {
    return this.page.getByRole('button', { name });
  }

  async changeStatus(buttonName: string) {
    const response = this.page.waitForResponse((r) => r.url().includes('/status') && r.request().method() === 'PATCH');
    await this.actionButton(buttonName).click();
    return response;
  }
}
