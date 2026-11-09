# LogiTrack — aplicação sob teste

Sistema de gestão de embarques (logística / comércio exterior) com API REST e interface web.
Esta é a aplicação que você vai testar no desafio técnico. Leia o enunciado para as instruções.

## Como executar

Requisitos: Node.js 18 ou superior. A aplicação **não tem dependências para instalar nem módulos nativos para compilar**:
todo o código já vem empacotado em `dist/server.js`.

```bash
npm start
```

(Se preferir, `npm install` também funciona, mas não é necessário.)

A aplicação sobe em **http://localhost:3000** (interface web e API no mesmo endereço).
Para usar outra porta: `PORT=3100 npm start` (Windows PowerShell: `$env:PORT=3100; npm start`).

## Usuários de teste

| Perfil     | E-mail                    | Senha       |
|------------|---------------------------|-------------|
| analista   | analista@logitrack.test   | Senha@123   |
| admin      | admin@logitrack.test      | Admin@123   |

## Banco de dados

SQLite, criado automaticamente em `./data/logitrack.db` com 27 embarques de exemplo
(`LT-2026-0001` a `LT-2026-0027`) e 2 usuários.

> Abra o arquivo **somente para leitura** enquanto a aplicação está rodando. A aplicação é a única que deve gravar nele;
> alterações feitas por fora podem ser sobrescritas. Para consultar, feche o cliente SQL ao reiniciar a aplicação.

- Restaurar a massa inicial **sem reiniciar**: `POST /api/__reset` (útil para isolar testes).
- Restaurar parando a aplicação: `npm run reset-db` e `npm start` novamente.

## Problemas para subir a aplicação?

- Confirme a versão: `node --version` (precisa ser 18 ou superior).
- Porta ocupada: use `PORT=3100 npm start` (PowerShell: `$env:PORT=3100; npm start`).
- Qualquer outro erro: copie a mensagem completa e responda ao e-mail do desafio. Não perca tempo com isso.
- Você pode abrir o arquivo `data/logitrack.db` com qualquer cliente SQLite (DB Browser, DBeaver, `sqlite3`)
  para consultas e validações. Tabelas: `users`, `shipments`, `shipment_events`.

## Documentação

- `openapi.yaml`: contrato esperado da API (abra no Swagger Editor ou em qualquer visualizador OpenAPI).
