import { test, expect } from '../../src/fixtures';
import { knownBug } from '../../src/support/known-bugs';

test.describe('Web: detalhe e mudança de status', () => {
  test.beforeEach(async ({ loggedInPage }) => {
    void loggedInPage;
  });

  test('detalhe exibe os dados do embarque e o histórico', async ({ analystApi, detailPage }) => {
    const shipment = await analystApi.createInStatus('IN_TRANSIT', { customer: 'Cliente Detalhe', incoterm: 'EXW', weightKg: 1500 });

    await detailPage.goto(shipment.id);

    await expect(detailPage.reference).toHaveText(shipment.reference);
    await expect(detailPage.customer).toHaveText('Cliente Detalhe');
    await expect(detailPage.field('Rota')).toHaveText(`${shipment.origin} → ${shipment.destination}`);
    await expect(detailPage.field('Incoterm')).toHaveText('EXW');
    await expect(detailPage.field('Peso')).toHaveText('1.500 kg');
    await expect(detailPage.status).toHaveText('Em trânsito');
    await expect(detailPage.timelineItems).toHaveCount(2);
    await expect(detailPage.timelineItems.last()).toContainText('Criado → Em trânsito');
  });

  test('fluxo completo de status pela tela até Entregue', async ({ analystApi, detailPage }) => {
    const shipment = await analystApi.createValid();
    await detailPage.goto(shipment.id);
    await expect(detailPage.status).toHaveText('Criado');

    const steps = [
      { button: 'Iniciar trânsito', label: 'Em trânsito', next: ['Enviar para desembaraço', 'Cancelar embarque'] },
      { button: 'Enviar para desembaraço', label: 'Desembaraço', next: ['Confirmar entrega'] },
      { button: 'Confirmar entrega', label: 'Entregue', next: [] },
    ];
    for (const [i, step] of steps.entries()) {
      const response = await detailPage.changeStatus(step.button);
      expect(response.status()).toBe(200);
      await expect(detailPage.toast).toHaveText('Status atualizado.');
      await expect(detailPage.status).toHaveText(step.label);
      await expect(detailPage.timelineItems).toHaveCount(i + 2);
      for (const name of step.next) await expect(detailPage.actionButton(name)).toBeVisible();
    }

    // Estado final: só resta o botão Voltar.
    await expect(detailPage.actionButtons).toHaveText(['Voltar']);
    expect((await analystApi.get(shipment.id)).body.status).toBe('DELIVERED');
  });

  test('cancelar embarque em trânsito pela tela', async ({ analystApi, detailPage }) => {
    const shipment = await analystApi.createInStatus('IN_TRANSIT');
    await detailPage.goto(shipment.id);

    await detailPage.changeStatus('Cancelar embarque');

    await expect(detailPage.status).toHaveText('Cancelado');
    await expect(detailPage.timelineItems.last()).toContainText('Em trânsito → Cancelado');
  });

  test('embarque inexistente mostra mensagem de não encontrado', async ({ detailPage, page }) => {
    await detailPage.goto(999999);

    await expect(page.getByRole('heading', { name: 'Embarque não encontrado' })).toBeVisible();
  });

  test.fail('valor é exibido na moeda do campo (USD)', knownBug('BUG-16'), async ({ analystApi, detailPage }) => {
    const shipment = await analystApi.createValid({ valueUsd: 15430 });

    await detailPage.goto(shipment.id);

    await expect(detailPage.value).toContainText(/USD|US\$/);
    await expect(detailPage.value).not.toContainText('R$');
  });

  test.fail('datas do detalhe e do histórico no padrão DD/MM/AAAA', knownBug('BUG-15'), async ({ detailPage }) => {
    // LT-2026-0004 foi criado em 14/01/2026: dia > 12 torna o formato inequívoco.
    await detailPage.goto(4);

    await expect(detailPage.field('Criado em')).toHaveText('14/01/2026');
    await expect(detailPage.timelineItems.first()).toContainText('14/01/2026');
  });
});
