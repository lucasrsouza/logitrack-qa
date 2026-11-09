# LogiTrack: automação de testes (API, Web e SQL)

Suíte de testes do **LogiTrack**, sistema de gestão de embarques do desafio técnico de QA Automation.
Cobre a API REST, a interface web e a validação por SQL no banco SQLite, e documenta os 25 defeitos
encontrados, cada um provado por pelo menos um teste automatizado.

| | |
|---|---|
| Ferramenta | [Playwright Test](https://playwright.dev) + TypeScript (API, Web e SQL no mesmo runner) |
| Testes | **166** (118 API · 9 SQL · 39 Web), dos quais **36** comprovam defeitos (`@bug`) |
| Execução | ~1 min, serial, sem retries e sem esperas fixas |
| Defeitos | **25** registrados em [`docs/RELATORIO-DE-DEFEITOS.md`](docs/RELATORIO-DE-DEFEITOS.md), mais 7 observações para o negócio |
| SQL | [`sql/consultas.sql`](sql/consultas.sql), o mesmo arquivo executado pelos testes |

## Como rodar

Pré-requisito: **Node.js 22.13 ou superior** (recomendado 24). O acesso ao SQLite usa o módulo nativo
`node:sqlite`, então não há nada para compilar.

```bash
npm ci
npx playwright install chromium
npm test
```

Não é preciso subir a aplicação antes: o Playwright inicia `app/` (`npm start`, porta 3000), espera o
`/api/health` responder e a encerra no fim. Se a aplicação já estiver rodando na porta 3000, ela é
reaproveitada (exceto no CI).

| Comando | O que faz |
|---|---|
| `npm test` | Suíte completa (API, SQL e Web) |
| `npm run test:api` / `test:sql` / `test:web` | Só uma camada |
| `npm run test:bugs` | Só os testes que comprovam defeitos |
| `npm run test:sem-bugs` | Só os testes de comportamento correto |
| `npm run report` | Abre o relatório HTML da última execução |
| `npm run app` | Sobe a aplicação manualmente (http://localhost:3000) |
| `npm run verify-app` | Confere por SHA-256 que `app/` é idêntica ao pacote recebido |
| `npm run typecheck` | Checagem de tipos TypeScript |

Variáveis opcionais: `PORT`, `BASE_URL`, `DB_PATH` e as credenciais `ANALISTA_EMAIL`/`ANALISTA_PASSWORD`/
`ADMIN_EMAIL`/`ADMIN_PASSWORD` (os padrões são os usuários de teste publicados no README da aplicação).

### Como ler o resultado

Os testes de defeito afirmam o comportamento **correto** (o das regras de negócio e do `openapi.yaml`) e
são declarados com `test.fail()`, a tag `@bug` e uma anotação com o ID do relatório:

```ts
test.fail('analista não pode remover embarque: 403 FORBIDDEN …', knownBug('BUG-04'), async ({ analystApi, db }) => { … });
```

Hoje eles falham, e o Playwright conta isso como **falha esperada**: por isso a execução fica verde com os
defeitos documentados. No relatório HTML, cada um mostra a anotação `bug: BUG-04: …` e o erro real
(ex.: `Expected: 403, Received: 204`). Quando um defeito for corrigido, o teste correspondente passa a
passar, o Playwright o acusa como **"Expected to fail, but passed"** e a execução fica vermelha: é o aviso
para trocar `test.fail` por `test`. Assim, os bugs conhecidos não mascaram regressões nem somem em silêncio.

## Estrutura

```
app/                        Aplicação sob teste, intocada (conferida por app.sha256)
src/
  api/                      Service objects da API: ApiClient (base), AuthApi, ShipmentsApi
  pages/                    Page Objects: Login, Listagem, Formulário, Detalhe, Header (componente)
  fixtures/index.ts         Fixtures do Playwright: injeção de dependências e reset automático
  data/                     Test Data Builder (buildShipment), usuários de teste, enums
  schemas/index.ts          Schemas JSON (AJV) derivados do openapi.yaml
  db/database.ts            Acesso somente leitura ao SQLite; executa as consultas nomeadas do .sql
  support/known-bugs.ts     Catálogo de defeitos e knownBug() (tag @bug + anotação)
tests/
  api/                      Autenticação, autorização, listagem, CRUD, fluxo de status
  sql/                      Qualidade de dados e API × banco
  web/                      Login, listagem, cadastro, detalhe e ponta a ponta API ↔ tela ↔ banco
sql/consultas.sql           Consultas da Parte C
docs/RELATORIO-DE-DEFEITOS.md
.github/workflows/tests.yml CI no GitHub Actions
```

## Por que Playwright + TypeScript

- **Uma ferramenta para API e Web.** O `APIRequestContext` do Playwright faz os testes de API e também
  prepara massa e confere resultados nos testes de interface, no mesmo processo, com os mesmos fixtures e
  o mesmo relatório. Os fluxos de ponta a ponta (criar pela API e ver na tela; criar na tela e conferir na
  API e no banco) ficam naturais.
- **Estabilidade sem esperas fixas.** Os locators e as asserções web-first (`toHaveText`, `toBeVisible`…)
  esperam e tentam de novo sozinhos. Não há nenhum `waitForTimeout`. Quando a tela depende de uma
  chamada, o page object espera a resposta HTTP (`waitForResponse`), e não um tempo arbitrário.
- **Evidências prontas para CI:** relatório HTML, JUnit, trace, screenshot e vídeo das falhas.
- **TypeScript** dá autocompletar e checagem nos contratos (`Shipment`, `ListResponse`…) e pega erros de
  digitação em campos antes da execução.

Alternativas consideradas: *Cypress* (bom para Web, mas API e banco ficariam em `cy.task` e o modelo
assíncrono deixa as checagens cruzadas mais verbosas) e *Postman/Newman + outro framework para Web* (duas
ferramentas, dois relatórios e massa de dados duplicada).

## Design patterns e decisões

| Padrão | Onde | Por quê |
|---|---|---|
| **Page Object** (+ componente) | `src/pages/` | Locators e ações de cada tela em um só lugar. Os testes falam a língua do negócio (`listPage.filter({ status })`). Locators por papel e rótulo (`getByRole`, `getByLabel`) primeiro, que também refletem acessibilidade; ids só onde a tela não oferece alternativa. |
| **Service Object / API Client** | `src/api/` | Mesma ideia do Page Object para a API. `ApiClient` centraliza URL base, token e desserialização; `ShipmentsApi` expõe operações de negócio (`createInStatus('DELIVERED')`). |
| **Fixtures (injeção de dependências)** | `src/fixtures/` | Cada teste declara o que precisa (`analystApi`, `adminApi`, `db`, `listPage`) e recebe pronto. O login na Web injeta o token no `localStorage`, sem passar pela tela, exceto nos testes do próprio login. |
| **Test Data Builder** | `src/data/shipment.factory.ts` | `buildShipment({ weightKg: 0 })` gera um payload válido e muda só o campo do cenário: a intenção do teste fica explícita e a referência é sempre única. |
| **Data-driven** | validações, limites e matriz de status | Uma tabela de casos por regra em vez de testes copiados. A matriz de transições cobre os 25 pares (5 permitidos e 20 proibidos), cada um um teste. |
| **Contrato por schema** | `src/schemas/` | Schemas AJV derivados do `openapi.yaml`, com `additionalProperties: false`. Foi assim que o vazamento de `passwordHash` (BUG-01) apareceu. |
| **SQL como fonte da verdade** | `src/db/` + `sql/consultas.sql` | O `.sql` entregue é o mesmo que os testes executam (consultas nomeadas com `-- name:`). Contagens esperadas vêm do banco, não de números fixos no código. |

**Independência entre testes:** uma fixture automática faz `POST /api/__reset` antes de **cada** teste, então
qualquer teste roda sozinho e em qualquer ordem. O custo é a execução serial (`workers: 1`): todos dividem o
mesmo banco. Paralelizar exigiria uma instância da aplicação e um banco por worker, o que não vale a pena
para ~1 minuto de suíte.

**Sem retries** (`retries: 0`): um teste instável deve ser corrigido, não escondido.

**A aplicação não foi alterada.** `app/` é uma cópia byte a byte do pacote recebido; o CI confere isso
(`npm run verify-app`) antes de rodar. O banco é aberto em modo **somente leitura** pelos testes.

## O que foi testado, e em que ordem

Comecei pelo que tem maior risco e maior impacto, e só então desci para os detalhes:

1. **Segurança e autorização** (token, perfis, exposição de dados). Uma falha aqui afeta todos os dados.
2. **Integridade dos dados** (regras 1 a 5, centavos, unicidade) e o **fluxo de status** (regras 6 e 7),
   que é o coração do domínio. Matriz completa de transições e histórico conferido também no banco.
3. **Listagem** (paginação, filtros, busca, `meta`), conferida contra contagens do SQL.
4. **Interface:** os mesmos fluxos pelos olhos do usuário, incluindo apresentação (datas, moeda) e
   fluxos de ponta a ponta entre camadas.
5. **SQL:** as consultas pedidas e a qualidade da massa inicial.

| Requisito do enunciado | Onde |
|---|---|
| A · Autenticação (válido, inválido, sem token, token inválido) | `tests/api/auth.spec.ts` |
| A · Autorização por perfil | `tests/api/authorization.spec.ts` |
| A · Listagem: paginação, filtros, busca, `meta` | `tests/api/shipments-list.spec.ts` |
| A · Criação, edição, remoção, contrato e negativos | `tests/api/shipments-crud.spec.ts`, `authorization.spec.ts` |
| A · Fluxo de status e histórico | `tests/api/status-flow.spec.ts` |
| B · Login (sucesso, falha) e logout | `tests/web/login.spec.ts` |
| B · Listagem, busca, filtro e paginação | `tests/web/shipments-list.spec.ts` |
| B · Cadastro (sucesso e validações) | `tests/web/shipment-create.spec.ts` |
| B · Detalhe e mudança de status (opcional) | `tests/web/shipment-detail.spec.ts` |
| B · Ponta a ponta API + interface | `tests/web/api-ui-integration.spec.ts` |
| C.1 a C.4 · Consultas | `sql/consultas.sql` → `tests/sql/data-quality.spec.ts` |
| C.5 · SQL validando o que a API ou a tela informou | `tests/sql/api-vs-database.spec.ts`, `tests/web/api-ui-integration.spec.ts`, contagens em `tests/*/shipments-list.spec.ts` |

### O que ficou de fora, e por quê

- **Outros navegadores (Firefox/WebKit):** a interface é HTML e JS simples, sem recurso específico de
  navegador; o risco não justifica triplicar o tempo. Ativar é adicionar um `project` no config.
- **Expiração do token (1 h):** exigiria manipular o relógio ou esperar uma hora; registrei como
  observação O-05.
- **Concorrência** (duas pessoas mudando o status ao mesmo tempo) **e carga:** fora do foco do desafio
  (API e Web funcionais) e exigiriam outra ferramenta (ex.: k6).
- **Acessibilidade automatizada** (axe) **e regressão visual:** os locators por papel e rótulo já
  garantem rótulos básicos; uma auditoria completa ficaria para uma segunda etapa.
- **Edição pela interface:** a tela não oferece edição, só a API.

## Relatório e CI

O workflow [`.github/workflows/tests.yml`](.github/workflows/tests.yml) roda em todo push e pull request:
confere a integridade de `app/`, instala as dependências, faz a checagem de tipos, executa a suíte e publica
como artefatos o **relatório HTML** (`playwright-report`) e **traces, vídeos e JUnit** (`test-results`). Os
resultados das consultas de qualidade de dados (C.3 e C.4) ficam anexados em JSON no relatório HTML.

Localmente, `npm run report` abre o mesmo relatório.

## Uso de IA

Como o enunciado permite, usei um assistente de IA generativa de forma ampla neste desafio:

- **Exploração da aplicação:** scripts de chamadas à API e consultas ao banco para varrer limites,
  combinações de filtros, a matriz de transições e a massa inicial. Cada comportamento suspeito foi
  reproduzido e comparado com as regras do enunciado e o `openapi.yaml` antes de virar defeito.
- **Arquitetura e código:** proposta da estrutura (camadas, padrões, convenção `test.fail` + `@bug`, reset
  por teste, SQL nomeado) e escrita dos page objects, services, fixtures, schemas e testes.
- **SQL:** consultas da Parte C, incluindo as de inconsistência de histórico (funções de janela
  `ROW_NUMBER`/`LAG`).
- **Documentação:** este README e o relatório de defeitos.

Como garanti a qualidade do que a IA produziu: a suíte roda do zero no modo CI, e cada teste `@bug` foi
conferido para falhar **pelo motivo certo**, ou seja, pelo defeito documentado, e não por seletor ou massa
(o erro real de cada um aparece no relatório HTML). Revisei o código e o texto antes da entrega.
