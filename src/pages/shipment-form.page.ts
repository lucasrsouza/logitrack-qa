import type { Locator, Page } from '@playwright/test';
import type { ShipmentInput } from '../data/shipment.factory';
import { HeaderComponent } from './header.component';

type Field = keyof ShipmentInput;

export class ShipmentFormPage {
  readonly header: HeaderComponent;
  readonly heading: Locator;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;
  readonly toast: Locator;
  private readonly inputs: Record<Field, Locator>;

  constructor(private readonly page: Page) {
    this.header = new HeaderComponent(page);
    this.heading = page.getByRole('heading', { name: 'Novo embarque' });
    this.saveButton = page.getByRole('button', { name: 'Salvar embarque' });
    this.cancelButton = page.getByRole('button', { name: 'Cancelar' });
    this.toast = page.getByTestId('toast');
    this.inputs = {
      reference: page.getByLabel('Referência'),
      customer: page.getByLabel('Cliente'),
      origin: page.getByLabel('Origem'),
      destination: page.getByLabel('Destino'),
      incoterm: page.getByLabel('Incoterm'),
      weightKg: page.getByLabel('Peso (kg)'),
      valueUsd: page.getByLabel('Valor (USD)'),
    };
  }

  async goto(): Promise<void> {
    await this.page.goto('/#/shipments/new');
  }

  fieldError(field: Field): Locator {
    return this.page.locator(`.field-error[data-for="${field}"]`);
  }

  async fill(data: Partial<Record<Field, string | number>>): Promise<void> {
    for (const [field, value] of Object.entries(data) as [Field, string | number][]) {
      if (field === 'incoterm') await this.inputs.incoterm.selectOption(String(value));
      else await this.inputs[field].fill(String(value));
    }
  }

  /** Clica em salvar e devolve a resposta do POST, para o teste poder correlacionar tela e API. */
  async submit() {
    const response = this.page.waitForResponse((r) => r.url().endsWith('/api/shipments') && r.request().method() === 'POST');
    await this.saveButton.click();
    return response;
  }

  async create(data: ShipmentInput) {
    await this.fill(data);
    return this.submit();
  }
}
