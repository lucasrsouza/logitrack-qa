import { readFileSync } from 'node:fs';
import path from 'node:path';
// node:sqlite é nativo do Node 22.13+: nada para compilar e nenhuma dependência extra.
import { DatabaseSync } from 'node:sqlite';

const DB_PATH = process.env.DB_PATH ?? path.resolve(__dirname, '../../app/data/logitrack.db');
const SQL_FILE = path.resolve(__dirname, '../../sql/consultas.sql');

/**
 * Lê o arquivo sql/consultas.sql e separa as consultas pelos marcadores `-- name: <id>`.
 * Assim, o .sql entregue é exatamente o mesmo que os testes executam.
 */
function loadNamedQueries(): Map<string, string> {
  const queries = new Map<string, string>();
  const content = readFileSync(SQL_FILE, 'utf8');
  const blocks = content.split(/^-- name:\s*/m).slice(1);
  for (const block of blocks) {
    const [firstLine, ...rest] = block.split('\n');
    const sql = rest
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .trim()
      .replace(/;\s*$/, '');
    queries.set(firstLine.trim(), sql);
  }
  return queries;
}

export type Row = Record<string, unknown>;

/**
 * Acesso SOMENTE LEITURA ao SQLite da aplicação (o README pede que só a aplicação grave nele).
 * Cada consulta abre e fecha a conexão para enxergar o estado mais recente gravado pela API.
 */
export class LogiTrackDb {
  private readonly queries = loadNamedQueries();

  named(name: string, params: Record<string, string | number | null> = {}): Row[] {
    const sql = this.queries.get(name);
    if (!sql) throw new Error(`Consulta "${name}" não encontrada em sql/consultas.sql`);
    return this.query(sql, params);
  }

  query(sql: string, params: Record<string, string | number | null> = {}): Row[] {
    const db = new DatabaseSync(DB_PATH, { readOnly: true });
    try {
      return db.prepare(sql).all(params) as Row[];
    } finally {
      db.close();
    }
  }

  shipmentByReference(reference: string): Row | undefined {
    return this.query('SELECT * FROM shipments WHERE reference = :reference', { reference })[0];
  }

  eventsOf(shipmentId: number): Row[] {
    return this.query(
      'SELECT from_status, to_status, created_at FROM shipment_events WHERE shipment_id = :id ORDER BY created_at, id',
      { id: shipmentId },
    );
  }
}
