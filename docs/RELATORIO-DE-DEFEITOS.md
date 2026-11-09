# Relatório de defeitos: LogiTrack

**Versão testada:** pacote `logitrack-avaliacao` (`dist/server.js` com SHA-256 `418dce72…e30e5e7`, conferível com `npm run verify-app`)
**Ambiente:** macOS, Node.js 24, Chromium (Playwright 1.65), aplicação em `http://localhost:3000`
**Referências:** regras de negócio do enunciado (numeradas de 1 a 11) e `app/openapi.yaml`

Cada defeito tem pelo menos um teste automatizado que o comprova. Esses testes afirmam o
comportamento **correto** e são declarados com `test.fail(...)` + tag `@bug` + anotação com o ID.
Hoje eles falham, e o Playwright conta isso como "falha esperada". Quando o defeito for corrigido, o
teste passa a passar, o Playwright o acusa como *unexpected pass*, e o `test.fail` deve virar `test`.

```bash
npm run test:bugs        # roda só os testes que comprovam defeitos
```

## Resumo

| ID | Defeito | Severidade | Camada | Regra / contrato |
|----|---------|-----------|--------|------------------|
| [BUG-01](#bug-01) | Login devolve o hash da senha do usuário | **Crítica** | API | openapi: "NÃO deve expor dados sensíveis" |
| [BUG-04](#bug-04) | Analista consegue remover embarques | **Crítica** | API | Regra 9 |
| [BUG-02](#bug-02) | Detalhe do embarque acessível sem token | **Alta** | API | Regra 10 |
| [BUG-07](#bug-07) | Criação arredonda o valor (perde centavos; 0,29 vira 0) | **Alta** | API | Regra 5 |
| [BUG-11](#bug-11) | DELIVERED → CANCELLED é aceito | **Alta** | API | Regra 6 |
| [BUG-24](#bug-24) | Paginação pula um embarque a partir da página 2 | **Alta** | API + Web | openapi (paginação) |
| [BUG-18](#bug-18) | Logout não encerra a sessão | **Alta** | Web | Segurança |
| [BUG-20](#bug-20) | Erro na criação aparece como "criado com sucesso" | **Alta** | Web | Usabilidade / integridade |
| [BUG-05](#bug-05) | `meta.total`/`totalPages` ignoram filtros | Média | API + Web | openapi (meta) |
| [BUG-06](#bug-06) | Busca não encontra pelo cliente | Média | API + Web | Regra 10 |
| [BUG-08](#bug-08) | Criação aceita peso 0 | Média | API | Regra 5 |
| [BUG-09](#bug-09) | Criação aceita origem igual ao destino | Média | API | Regra 3 |
| [BUG-10](#bug-10) | Referência duplicada na criação devolve 500 | Média | API | Regra 2 / openapi 409 |
| [BUG-12](#bug-12) | Embarque inexistente devolve 200 com `null` | Média | API | openapi 404 |
| [BUG-03](#bug-03) | Token inválido ou forjado devolve 500 | Média | API | openapi 401 |
| [BUG-15](#bug-15) | Datas em MM/DD/AAAA | Média | Web | Regra 11 |
| [BUG-16](#bug-16) | Valor exibido em R$ em vez de USD | Média | Web | Regra 11 |
| [BUG-17](#bug-17) | Filtro "Desembaraço" lista "Em trânsito" | Média | Web | Funcionalidade de filtro |
| [BUG-19](#bug-19) | Embarque recém-criado não aparece na listagem | Média | Web | Funcionalidade de cadastro |
| [BUG-22](#bug-22) | Massa inicial: status incoerente com o histórico | Média | Dados | Regras 6 e 7 |
| [BUG-23](#bug-23) | Massa inicial: dados que violam regras de negócio | Média | Dados | Regras 3 e 5 |
| [BUG-21](#bug-21) | "Próxima" habilitado na última página | Baixa | Web | Usabilidade |
| [BUG-25](#bug-25) | Barra do usuário visível na tela de login | Baixa | Web | Usabilidade |
| [BUG-13](#bug-13) | JSON malformado devolve 500 | Baixa | API | Robustez |
| [BUG-14](#bug-14) | `%` e `_` na busca funcionam como curinga | Baixa | API | Regra 10 |

**Critério de severidade:** *Crítica* = falha de segurança ou de autorização explorável;
*Alta* = perda ou corrupção de dado, quebra de regra central, ou o usuário é levado a erro;
*Média* = regra de negócio ou contrato violado, com contorno; *Baixa* = robustez ou usabilidade.

Os comandos de reprodução usam `TOKEN` de um login como analista:

```bash
TOKEN=$(curl -s localhost:3000/api/auth/login -H 'content-type: application/json' \
  -d '{"email":"analista@logitrack.test","password":"Senha@123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
```

---

## API

### BUG-01
**Login devolve o hash da senha do usuário** · Crítica
- **Passos:** `POST /api/auth/login` com credenciais válidas.
- **Esperado:** `user` com apenas `id`, `name`, `email` e `role` (o openapi diz explicitamente que a resposta "NÃO deve expor dados sensíveis").
- **Obtido:** `user.passwordHash: "$2b$08$..."` (hash bcrypt com custo 8). Com o hash em mãos, dá para fazer ataque de força bruta offline.
- **Teste:** `tests/api/auth.spec.ts` › *resposta do login segue o contrato e não expõe dados sensíveis*

### BUG-02
**Detalhe do embarque acessível sem token** · Alta
- **Passos:** `curl -i localhost:3000/api/shipments/1` (sem `Authorization`).
- **Esperado:** `401 UNAUTHORIZED` (regra 10: todos os endpoints, exceto login, health e reset, exigem token).
- **Obtido:** `200` com o embarque completo. Os ids são sequenciais, então qualquer pessoa enumera a base inteira. Os demais endpoints (`/events`, `POST`, `PUT`, `PATCH`, `DELETE`, listagem) exigem token corretamente.
- **Teste:** `tests/api/auth.spec.ts` › *detalhe do embarque sem token retorna 401*

### BUG-03
**Token inválido ou forjado devolve 500** · Média
- **Passos:** `curl -i localhost:3000/api/shipments -H 'Authorization: Bearer abc'` (o mesmo vale para `a.b.c`, JWT com assinatura falsa e JWT com `alg: none`).
- **Esperado:** `401 UNAUTHORIZED`.
- **Obtido:** `500 INTERNAL_ERROR`. O acesso **não** é concedido (o que é bom), mas a falha de verificação do token não é tratada: vira erro interno, polui o monitoramento e confunde o cliente da API.
- **Teste:** `tests/api/auth.spec.ts` › *token inválido (…) retorna 401, e não erro interno* (4 variações)

### BUG-04
**Analista consegue remover embarques** · Crítica
- **Passos:** com token de analista, `curl -i -X DELETE localhost:3000/api/shipments/27 -H "Authorization: Bearer $TOKEN"`.
- **Esperado:** `403 FORBIDDEN`, com o embarque preservado (regra 9: somente admin remove).
- **Obtido:** `204`, e o embarque e o histórico somem do banco.
- **Teste:** `tests/api/authorization.spec.ts` › *analista não pode remover embarque* (confere também no SQLite que o registro sumiu)

### BUG-05
**`meta.total` e `meta.totalPages` ignoram os filtros** · Média
- **Passos:** `GET /api/shipments?status=CREATED&pageSize=5`.
- **Esperado:** `total` = quantidade que atende ao filtro (6 na massa inicial) e `totalPages = ceil(6/5) = 2` (o openapi define assim).
- **Obtido:** `total: 27`, `totalPages: 6`. O mesmo acontece com `q`. Na tela, o filtro "Entregue" mostra 5 linhas, mas o rodapé diz "27 embarques · Página 1 de 3", e "Próxima" leva a páginas vazias.
- **Testes:** `tests/api/shipments-list.spec.ts` (2 testes) e `tests/web/shipments-list.spec.ts` › *total e paginação refletem o filtro aplicado*

### BUG-06
**Busca `q` não encontra pelo nome do cliente** · Média
- **Passos:** `GET /api/shipments?q=atlas` (também `Atlas` e `ATLAS`).
- **Esperado:** os 4 embarques de "Atlas Importadora" (regra 10: busca por referência **ou** cliente).
- **Obtido:** lista vazia. A busca por referência funciona e já ignora maiúsculas.
- **Teste:** `tests/api/shipments-list.spec.ts` › *busca por nome do cliente, sem diferenciar maiúsculas* (o esperado vem da consulta `count_matching_search`)

### BUG-07
**Criação arredonda `valueUsd` para inteiro** · Alta
- **Passos:** `POST /api/shipments` com `"valueUsd": 1234.56`.
- **Esperado:** `1234.56` persistido e devolvido (regra 5: "sem perda de centavos").
- **Obtido:** `1235` na resposta **e no banco**. Com `0.29` o valor gravado é `0`, o que viola também "valor > 0". A edição (`PUT`) preserva os centavos, então o defeito está só no caminho de criação, e o mesmo embarque muda de valor dependendo de por onde passou.
- **Testes:** `tests/api/shipments-crud.spec.ts` (2 testes) e `tests/sql/api-vs-database.spec.ts` › *valor com centavos … sem perda*

### BUG-08
**Criação aceita peso igual a 0** · Média
- **Passos:** `POST /api/shipments` com `"weightKg": 0`.
- **Esperado:** `400 VALIDATION_ERROR` no campo `weightKg` (regra 5: peso **maior que 0**). Pesos negativos são rejeitados corretamente.
- **Obtido:** `201`. O limite foi implementado como `>= 0`.
- **Teste:** `tests/api/shipments-crud.spec.ts` › *peso igual a 0 é rejeitado*

### BUG-09
**Criação aceita origem igual ao destino** · Média
- **Passos:** `POST /api/shipments` com `"origin": "Santos, BR", "destination": "Santos, BR"` (ou `"SANTOS, BR"`).
- **Esperado:** `400` no campo `destination` (regra 3; o openapi pede comparação sem diferenciar maiúsculas).
- **Obtido:** `201`. No `PUT` a mesma regra funciona (`"Destino deve ser diferente da origem"`): a validação existe, mas não é aplicada na criação.
- **Teste:** `tests/api/shipments-crud.spec.ts` › *origem igual ao destino (…) é rejeitada* (2 variações)

### BUG-10
**Referência duplicada na criação devolve 500** · Média
- **Passos:** `POST /api/shipments` com `"reference": "LT-2026-0001"`.
- **Esperado:** `409 DUPLICATE_REFERENCE` (o `PUT` faz isso corretamente).
- **Obtido:** `500 INTERNAL_ERROR`. A unicidade é garantida só pela constraint `UNIQUE` do banco; a exceção não é tratada. Na tela, a consequência é o BUG-20.
- **Teste:** `tests/api/shipments-crud.spec.ts` › *referência duplicada retorna 409*

### BUG-11
**Transição DELIVERED → CANCELLED é aceita** · Alta
- **Passos:** criar um embarque, levá-lo a `IN_TRANSIT` → `CUSTOMS` → `DELIVERED` e depois enviar `PATCH /status {"status":"CANCELLED"}`.
- **Esperado:** `422 INVALID_TRANSITION` (regra 6: DELIVERED é estado final).
- **Obtido:** `200`, status `CANCELLED` e um evento `DELIVERED → CANCELLED` no histórico. Todas as outras 19 transições proibidas são bloqueadas; só esta escapa.
- **Testes:** `tests/api/status-flow.spec.ts` › *DELIVERED → CANCELLED é rejeitada…*; `tests/sql/data-quality.spec.ts` mostra que a consulta C.3 detecta o rastro (`TRANSICAO_PROIBIDA`).

### BUG-12
**Embarque inexistente devolve 200 com corpo `null`** · Média
- **Passos:** `curl -i localhost:3000/api/shipments/999999 -H "Authorization: Bearer $TOKEN"`.
- **Esperado:** `404 NOT_FOUND`, como fazem `/events`, `PUT`, `PATCH` e `DELETE` para o mesmo id.
- **Obtido:** `200` com corpo `null`. Ids não numéricos (`/shipments/abc`) também respondem `200 null`.
- **Teste:** `tests/api/shipments-crud.spec.ts` › *embarque inexistente retorna 404*
- **Atenção na correção:** a tela de detalhe testa `if (!a.data)` para mostrar "Embarque não encontrado". Se a API passar a responder `404 {"error":"NOT_FOUND"}`, o corpo deixa de ser `null` e a tela vai renderizar um detalhe vazio. A tela precisa olhar o status HTTP (ver O-04).

### BUG-13
**JSON malformado devolve 500** · Baixa
- **Passos:** `POST /api/shipments` com corpo `{"reference": "LT-2026-5555",`.
- **Esperado:** `400`. **Obtido:** `500 INTERNAL_ERROR`.
- **Teste:** `tests/api/shipments-crud.spec.ts` › *JSON malformado retorna 400*

### BUG-14
**`%` e `_` na busca funcionam como curinga** · Baixa
- **Passos:** `GET /api/shipments?q=%` ou `?q=_`.
- **Esperado:** busca literal (nenhum embarque tem esses caracteres). **Obtido:** todos os 27 embarques. O termo vai para um `LIKE` sem escape. Não é SQL injection (`' OR 1=1 --` é tratado como texto, e há teste para isso), mas a busca devolve resultado errado.
- **Teste:** `tests/api/shipments-list.spec.ts` › *caracteres % e _ na busca são literais*

### BUG-24
**Paginação pula um embarque a partir da página 2** · Alta
- **Passos:** `GET /api/shipments?page=1&pageSize=10` e depois `?page=2&pageSize=10`.
- **Esperado:** a página 2 começa no 11º embarque (`LT-2026-0017`).
- **Obtido:** a página 2 começa no 12º (`LT-2026-0016`). Da página 2 em diante o deslocamento é `(page-1)*pageSize + 1`, então exatamente um embarque (o primeiro da página 2) nunca é exibido. Com `pageSize=10` o `LT-2026-0017` fica inalcançável pela tela, e com `pageSize=2` a última página informada vem vazia.
- **Testes:** `tests/api/shipments-list.spec.ts` (2 testes) e `tests/web/shipments-list.spec.ts` › *percorrer as páginas na tela exibe todos os embarques*

## Web

### BUG-15
**Datas exibidas em MM/DD/AAAA** · Média
- **Passos:** abrir o detalhe de `LT-2026-0004` (criado em 14/01/2026).
- **Esperado:** `14/01/2026` (regra 11). **Obtido:** `01/14/2026`, na listagem, no detalhe e no histórico. Para dias até 12 a data fica ambígua e é lida errada (05/01 aparece como `01/05/2026`).
- **Testes:** `tests/web/shipments-list.spec.ts` e `tests/web/shipment-detail.spec.ts`

### BUG-16
**Valor exibido em R$** · Média
- **Passos:** abrir o detalhe de um embarque com `valueUsd = 15430`.
- **Esperado:** valor na moeda do campo, USD (regra 11). **Obtido:** `R$ 15.430,00`. Um valor em dólar aparece como se fosse em reais.
- **Teste:** `tests/web/shipment-detail.spec.ts` › *valor é exibido na moeda do campo (USD)*

### BUG-17
**Filtro "Desembaraço" lista embarques "Em trânsito"** · Média
- **Passos:** listagem → Status "Desembaraço" → Filtrar.
- **Esperado:** os 5 embarques `CUSTOMS`. **Obtido:** os 5 embarques `IN_TRANSIT`. A tela envia `status=IN_TRANSIT` quando o usuário escolhe `CUSTOMS`; pela API o filtro funciona.
- **Teste:** `tests/web/shipments-list.spec.ts` › *filtro "Desembaraço" exibe apenas embarques em desembaraço*

### BUG-18
**Logout não encerra a sessão** · Alta
- **Passos:** entrar, clicar em "Sair" e depois acessar `/#/shipments` (ou clicar em "Embarques" na barra, que continua visível, ver BUG-25).
- **Esperado:** voltar ao login; o token é removido do navegador.
- **Obtido:** a listagem abre normalmente. "Sair" só troca a rota; o token continua no `localStorage`. Em computador compartilhado, o próximo usuário entra na sessão anterior.
- **Teste:** `tests/web/login.spec.ts` › *após o logout a sessão é encerrada*

### BUG-19
**Embarque recém-criado não aparece na listagem** · Média
- **Passos:** abrir a listagem → "Novo embarque" → salvar um embarque válido.
- **Esperado:** voltar à listagem com o novo embarque no topo (ordem: mais recentes primeiro).
- **Obtido:** a listagem mostra a versão anterior, em cache e sem o embarque, até o usuário filtrar ou recarregar a página. O usuário tende a achar que o cadastro falhou e cadastra de novo.
- **Teste:** `tests/web/shipment-create.spec.ts` › *embarque recém-criado aparece no topo da listagem*

### BUG-20
**Erro na criação aparece como "Embarque criado com sucesso."** · Alta
- **Passos:** cadastrar pela tela um embarque com a referência `LT-2026-0001` (já existente).
- **Esperado:** mensagem de erro e permanência no formulário.
- **Obtido:** toast verde "Embarque criado com sucesso." e volta para a listagem, mas nada foi criado (a API respondeu 500, ver BUG-10). A tela só trata 400 e 401; qualquer outra resposta, inclusive 409 e 500, é tratada como sucesso.
- **Teste:** `tests/web/shipment-create.spec.ts` › *referência duplicada mostra erro, e não mensagem de sucesso*

### BUG-21
**Botão "Próxima" habilitado na última página** · Baixa
- **Passos:** listagem → avançar até "Página 3 de 3".
- **Esperado:** "Próxima" desabilitado (como "Anterior" na página 1). **Obtido:** habilitado; leva a "Página 4 de 3", com a tabela vazia.
- **Teste:** `tests/web/shipments-list.spec.ts` › *botão "Próxima" fica desabilitado na última página*

### BUG-25
**Barra do usuário visível na tela de login** · Baixa
- **Passos:** entrar como admin e clicar em "Sair".
- **Esperado:** tela de login sem a barra superior. **Obtido:** a barra continua mostrando "Admin Master (admin)", o menu e o "Sair". O código marca a barra com o atributo `hidden`, mas o CSS `header { display:flex }` anula o efeito. Somado ao BUG-18, o link "Embarques" leva de volta à listagem sem novo login.
- **Teste:** `tests/web/login.spec.ts` › *tela de login não exibe a barra do usuário*

## Dados (massa inicial)

Encontrados pelas consultas de `sql/consultas.sql`, executadas pelos testes de `tests/sql/data-quality.spec.ts`
(o resultado vai anexado ao relatório HTML como JSON).

### BUG-22
**Status incoerente com o histórico** · Média · consulta `history_inconsistencies` (C.3)

| Embarque | Status atual | Último evento | Problema |
|----------|--------------|---------------|----------|
| LT-2026-0007 | DELIVERED | CREATED → IN_TRANSIT | Faltam os eventos de CUSTOMS e DELIVERED |
| LT-2026-0014 | CANCELLED | CUSTOMS → DELIVERED | Histórico termina em DELIVERED (estado final) e o status diz CANCELLED |
| LT-2026-0022 | IN_TRANSIT | NULL → CREATED | Falta o evento CREATED → IN_TRANSIT (o id de evento 51 não existe na sequência) |

### BUG-23
**Registros que violam regras de negócio** · Média · consulta `business_rule_violations` (C.4)

| Embarque | Regra | Valor |
|----------|-------|-------|
| LT-2026-0011 | 3: origem ≠ destino | Paranaguá, BR → Paranaguá, BR |
| LT-2026-0019 | 5: peso > 0 | 0 |
| LT-2026-0025 | 5: valor > 0 | -150 |

Esses registros passam pelas validações porque entraram direto no banco (seed) ou por caminhos sem validação
(BUG-08, BUG-09). Eles também aparecem na API: o contrato da listagem é validado só quanto à forma
(`shipmentShapeSchema`), e as faixas de valor ficam com as consultas SQL, para que um teste de contrato não
falhe por causa de dado sujo.

---

## Observações e dúvidas para o negócio

Pontos que **não** registrei como defeito, porque o enunciado e o openapi não definem o comportamento. Na
conversa, eu os levaria como perguntas.

| ID | Observação | Pergunta |
|----|-----------|----------|
| O-01 | `page=0`, `page=-1`, `page=abc` e `pageSize=0` são normalizados em silêncio (viram 1 e 10); `pageSize>100` vira 100. O openapi declara `minimum`/`maximum`, mas não diz se valores fora da faixa são erro. | Preferem `400` para paginação inválida ou a normalização é intencional? |
| O-02 | A remoção é física e apaga também o histórico (sem eventos órfãos, o que é coerente). | Embarque de comércio exterior pode ser apagado sem trilha de auditoria? Não seria o caso de exclusão lógica? |
| O-03 | Login com campos vazios mostra "Erro inesperado. Tente novamente.", embora a API devolva `400` com mensagem clara ("E-mail e senha são obrigatórios"). | Melhoria de UX: exibir a mensagem da API. |
| O-04 | A tela de detalhe decide "não encontrado" por `!a.data`, e não pelo status HTTP; isso só funciona por causa do BUG-12. | Corrigir junto com o BUG-12. |
| O-05 | O token expira em 1 hora, sem renovação; ao expirar, a tela volta ao login sem aviso. | Tempo de sessão esperado? |
| O-06 | A busca não iguala maiúsculas acentuadas (`TÊXTIL` × `Têxtil`), porque o `LOWER` do SQLite só trata ASCII. Hoje fica mascarado pelo BUG-06. | A busca deve ignorar acentos? |
| O-07 | `POST` e `PUT` ignoram campos extras no corpo (`id`, `status`), em vez de rejeitá-los. Comportamento seguro: há teste garantindo que `status` enviado não é aplicado. | Ok manter tolerante? |
