import type { TestDetails } from '@playwright/test';

/**
 * Catálogo dos defeitos registrados em docs/RELATORIO-DE-DEFEITOS.md.
 *
 * Testes que provam um defeito afirmam o comportamento CORRETO (o das regras de negócio
 * e do openapi.yaml) e são declarados com `test.fail(...)`: hoje eles falham e o
 * Playwright conta isso como "esperado". Quando o defeito for corrigido, o teste passa
 * a passar, o Playwright o marca como "unexpected pass" e sabemos que é hora de
 * trocar `test.fail` por `test`.
 */
export const BUGS = {
  'BUG-01': 'Login expõe o hash da senha (user.passwordHash)',
  'BUG-02': 'GET /api/shipments/{id} responde sem token',
  'BUG-03': 'Token inválido ou forjado retorna 500 em vez de 401',
  'BUG-04': 'Perfil analista consegue remover embarques',
  'BUG-05': 'meta.total e meta.totalPages ignoram os filtros status e q',
  'BUG-06': 'Busca q não encontra embarques pelo nome do cliente',
  'BUG-07': 'POST arredonda valueUsd para inteiro (perda de centavos)',
  'BUG-08': 'POST aceita peso igual a 0',
  'BUG-09': 'POST aceita origem igual ao destino',
  'BUG-10': 'POST com referência duplicada retorna 500 em vez de 409',
  'BUG-11': 'Transição DELIVERED → CANCELLED é aceita (estado final)',
  'BUG-12': 'GET de embarque inexistente retorna 200 com corpo null',
  'BUG-13': 'JSON malformado retorna 500 em vez de 400',
  'BUG-14': 'Busca trata % e _ como curingas',
  'BUG-15': 'Interface exibe datas no formato MM/DD/AAAA',
  'BUG-16': 'Interface exibe o valor em R$ em vez de USD',
  'BUG-17': 'Filtro "Desembaraço" da interface lista embarques Em trânsito',
  'BUG-18': 'Logout não encerra a sessão (token continua no navegador)',
  'BUG-19': 'Embarque recém-criado não aparece na listagem (cache)',
  'BUG-20': 'Erro na criação (ex.: referência duplicada) exibe mensagem de sucesso',
  'BUG-21': 'Botão "Próxima" continua habilitado na última página',
  'BUG-22': 'Massa inicial com status incoerente com o histórico',
  'BUG-23': 'Massa inicial com dados que violam as regras de negócio',
  'BUG-24': 'Paginação pula um embarque a partir da página 2',
  'BUG-25': 'Barra superior com usuário, menu e "Sair" aparece na tela de login',
} as const;

export type BugId = keyof typeof BUGS;

/** Detalhes para `test.fail(título, knownBug('BUG-xx'), corpo)`: tag @bug + anotação com o ID. */
export function knownBug(...ids: BugId[]): TestDetails {
  return {
    tag: '@bug',
    annotation: ids.map((id) => ({
      type: 'bug',
      description: `${id}: ${BUGS[id]} (docs/RELATORIO-DE-DEFEITOS.md)`,
    })),
  };
}
