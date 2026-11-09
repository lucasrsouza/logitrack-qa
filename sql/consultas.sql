-- =============================================================================
-- LogiTrack: consultas de validação (Parte C do desafio)
-- Banco: app/data/logitrack.db (SQLite). Abrir em modo somente leitura, por exemplo:
--   sqlite3 -readonly -header -column app/data/logitrack.db < sql/consultas.sql
--
-- Cada consulta tem um marcador "-- name: <id>". A suíte automatizada
-- (src/db/database.ts) lê ESTE arquivo e executa as consultas pelo nome; portanto
-- o SQL documentado aqui é exatamente o SQL usado nos testes.
-- Parâmetros nomeados (:reference, :status) só existem nas consultas de apoio aos testes.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- C.1 Quantidade de embarques por status
-- Inclui os 5 status do fluxo, mesmo os que tiverem 0 embarques.
-- -----------------------------------------------------------------------------
-- name: count_by_status
WITH statuses(status, ordem) AS (
  VALUES ('CREATED', 1), ('IN_TRANSIT', 2), ('CUSTOMS', 3), ('DELIVERED', 4), ('CANCELLED', 5)
)
SELECT st.status,
       COUNT(s.id) AS total
FROM statuses st
LEFT JOIN shipments s ON s.status = st.status
GROUP BY st.status, st.ordem
ORDER BY st.ordem;


-- -----------------------------------------------------------------------------
-- C.2 (opcional) Por cliente: total de embarques e valor total em USD,
-- do maior para o menor valor. ROUND(…, 2) evita resíduo de ponto flutuante na soma.
-- -----------------------------------------------------------------------------
-- name: totals_by_customer
SELECT customer,
       COUNT(*)                  AS total_embarques,
       ROUND(SUM(value_usd), 2)  AS valor_total_usd
FROM shipments
GROUP BY customer
ORDER BY valor_total_usd DESC, total_embarques DESC, customer;


-- -----------------------------------------------------------------------------
-- C.3 Embarques cujo histórico (shipment_events) é inconsistente com o status atual.
-- Regras verificadas, uma linha por problema encontrado:
--   SEM_HISTORICO          embarque sem nenhum evento (regra 1 e 7: nasce com evento CREATED)
--   PRIMEIRO_EVENTO        primeiro evento não é (NULL -> CREATED)
--   CADEIA_QUEBRADA        from_status de um evento difere do to_status do evento anterior
--   TRANSICAO_PROIBIDA     evento registra transição fora do fluxo da regra 6
--   STATUS_DIVERGENTE      status atual difere do to_status do último evento
-- -----------------------------------------------------------------------------
-- name: history_inconsistencies
WITH ordered AS (
  SELECT e.shipment_id,
         e.from_status,
         e.to_status,
         ROW_NUMBER() OVER (PARTITION BY e.shipment_id ORDER BY e.created_at, e.id)           AS seq,
         ROW_NUMBER() OVER (PARTITION BY e.shipment_id ORDER BY e.created_at DESC, e.id DESC) AS seq_desc,
         LAG(e.to_status) OVER (PARTITION BY e.shipment_id ORDER BY e.created_at, e.id)       AS previous_to
  FROM shipment_events e
),
allowed(from_status, to_status) AS (
  VALUES ('CREATED', 'IN_TRANSIT'), ('CREATED', 'CANCELLED'),
         ('IN_TRANSIT', 'CUSTOMS'), ('IN_TRANSIT', 'CANCELLED'),
         ('CUSTOMS', 'DELIVERED')
),
problems AS (
  SELECT s.id AS shipment_id, 'SEM_HISTORICO' AS problema, NULL AS detalhe
  FROM shipments s
  WHERE NOT EXISTS (SELECT 1 FROM shipment_events e WHERE e.shipment_id = s.id)

  UNION ALL
  SELECT o.shipment_id, 'PRIMEIRO_EVENTO',
         COALESCE(o.from_status, 'NULL') || ' -> ' || o.to_status
  FROM ordered o
  WHERE o.seq = 1 AND NOT (o.from_status IS NULL AND o.to_status = 'CREATED')

  UNION ALL
  SELECT o.shipment_id, 'CADEIA_QUEBRADA',
         'anterior terminou em ' || o.previous_to || ', evento seguinte parte de ' || COALESCE(o.from_status, 'NULL')
  FROM ordered o
  WHERE o.seq > 1 AND (o.from_status IS NULL OR o.from_status <> o.previous_to)

  UNION ALL
  SELECT o.shipment_id, 'TRANSICAO_PROIBIDA', o.from_status || ' -> ' || o.to_status
  FROM ordered o
  WHERE o.seq > 1
    AND NOT EXISTS (SELECT 1 FROM allowed a WHERE a.from_status = o.from_status AND a.to_status = o.to_status)

  UNION ALL
  SELECT o.shipment_id, 'STATUS_DIVERGENTE',
         'status atual ' || s.status || ', último evento ' || o.to_status
  FROM ordered o
  JOIN shipments s ON s.id = o.shipment_id
  WHERE o.seq_desc = 1 AND o.to_status <> s.status
)
SELECT s.id, s.reference, s.status, p.problema, p.detalhe
FROM problems p
JOIN shipments s ON s.id = p.shipment_id
ORDER BY s.id, p.problema;


-- -----------------------------------------------------------------------------
-- C.3 (complemento) Eventos órfãos: histórico apontando para embarque que não existe.
-- -----------------------------------------------------------------------------
-- name: orphan_events
SELECT e.id, e.shipment_id, e.from_status, e.to_status, e.created_at
FROM shipment_events e
LEFT JOIN shipments s ON s.id = e.shipment_id
WHERE s.id IS NULL
ORDER BY e.id;


-- -----------------------------------------------------------------------------
-- C.4 Dados que violam as regras de negócio (uma linha por violação).
-- -----------------------------------------------------------------------------
-- name: business_rule_violations
SELECT id, reference, 'REGRA_2_REFERENCIA_FORMATO' AS regra, reference AS valor
FROM shipments
WHERE reference NOT GLOB 'LT-[0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9]'

UNION ALL
SELECT s.id, s.reference, 'REGRA_2_REFERENCIA_DUPLICADA', s.reference
FROM shipments s
WHERE EXISTS (SELECT 1 FROM shipments o WHERE o.id <> s.id AND UPPER(o.reference) = UPPER(s.reference))

UNION ALL
SELECT id, reference, 'REGRA_3_CLIENTE_TAMANHO', customer
FROM shipments
WHERE LENGTH(TRIM(customer)) NOT BETWEEN 2 AND 80

UNION ALL
SELECT id, reference, 'REGRA_3_ORIGEM_DESTINO_OBRIGATORIOS', COALESCE(origin, 'NULL') || ' -> ' || COALESCE(destination, 'NULL')
FROM shipments
WHERE TRIM(COALESCE(origin, '')) = '' OR TRIM(COALESCE(destination, '')) = ''

UNION ALL
SELECT id, reference, 'REGRA_3_ORIGEM_IGUAL_DESTINO', origin || ' -> ' || destination
FROM shipments
WHERE LOWER(TRIM(origin)) = LOWER(TRIM(destination))

UNION ALL
SELECT id, reference, 'REGRA_4_INCOTERM', incoterm
FROM shipments
WHERE incoterm NOT IN ('FOB', 'CIF', 'EXW', 'DAP', 'DDP')

UNION ALL
SELECT id, reference, 'REGRA_5_PESO', CAST(weight_kg AS TEXT)
FROM shipments
WHERE weight_kg <= 0 OR weight_kg > 30000

UNION ALL
SELECT id, reference, 'REGRA_5_VALOR', CAST(value_usd AS TEXT)
FROM shipments
WHERE value_usd <= 0 OR value_usd > 10000000

UNION ALL
SELECT id, reference, 'REGRA_5_VALOR_MAIS_DE_2_CASAS', CAST(value_usd AS TEXT)
FROM shipments
WHERE ABS(value_usd * 100 - ROUND(value_usd * 100)) > 0.000001

UNION ALL
SELECT id, reference, 'REGRA_6_STATUS_INEXISTENTE', status
FROM shipments
WHERE status NOT IN ('CREATED', 'IN_TRANSIT', 'CUSTOMS', 'DELIVERED', 'CANCELLED')

ORDER BY id, regra;


-- =============================================================================
-- Consultas de apoio usadas pelos testes automatizados para conferir o que a
-- API ou a tela informaram (item C.5).
-- =============================================================================

-- name: shipment_by_reference
SELECT id, reference, customer, origin, destination, incoterm,
       weight_kg, value_usd, status, created_at, updated_at
FROM shipments
WHERE reference = :reference;

-- name: events_by_reference
SELECT e.from_status, e.to_status, e.created_at
FROM shipment_events e
JOIN shipments s ON s.id = e.shipment_id
WHERE s.reference = :reference
ORDER BY e.created_at, e.id;

-- name: count_with_status
SELECT COUNT(*) AS total
FROM shipments
WHERE status = :status;

-- name: count_matching_search
-- Contagem esperada para a busca q: referência OU cliente, sem diferenciar maiúsculas
-- (LOWER cobre os acentos dos nomes da massa porque compara a mesma grafia). INSTR evita
-- que % e _ do termo virem curinga, como aconteceria com LIKE.
SELECT COUNT(*) AS total
FROM shipments
WHERE INSTR(LOWER(reference), LOWER(:q)) > 0
   OR INSTR(LOWER(customer), LOWER(:q)) > 0;
