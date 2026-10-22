import type { Database } from "./types.js";

export class StorageConflict extends Error {
  constructor() { super("Данные изменились. Обновите страницу и повторите действие"); }
}

export interface SqlConnection {
  query(sql: string, values?: unknown[]): Promise<{ rows: any[]; rowCount?: number | null; affectedRows?: number }>;
}

// A versioned JSONB document preserves the existing MVP data model. Conditional
// updates prevent concurrent API instances from silently overwriting each other.
export function createPostgresStore(sql: SqlConnection) {
  let initialized: Promise<void> | undefined;
  const versions = new WeakMap<Database, string>();
  function initialize() {
    if (!initialized) {
      initialized = (async () => {
        await sql.query(`CREATE TABLE IF NOT EXISTS shodka_state (
          id smallint PRIMARY KEY CHECK (id = 1),
          schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version = 1),
          version bigint NOT NULL DEFAULT 0,
          payload jsonb NOT NULL CHECK (
            payload ?& ARRAY['users', 'activities', 'applications'] AND
            jsonb_typeof(payload->'users') = 'array' AND
            jsonb_typeof(payload->'activities') = 'array' AND
            jsonb_typeof(payload->'applications') = 'array'),
          updated_at timestamptz NOT NULL DEFAULT now()
        )`);
        await sql.query(`INSERT INTO shodka_state (id, payload) VALUES (1, $1::jsonb)
          ON CONFLICT (id) DO NOTHING`, [JSON.stringify({ users: [], activities: [], applications: [] })]);
      })().catch(error => { initialized = undefined; throw error; });
    }
    return initialized;
  }
  return {
    async read(): Promise<Database> {
      await initialize();
      const result = await sql.query("SELECT payload, version::text AS version FROM shodka_state WHERE id = 1");
      if (!result.rows[0]) throw new Error("PostgreSQL state is missing");
      const database = result.rows[0].payload as Database;
      versions.set(database, result.rows[0].version);
      return database;
    },
    async write(database: Database): Promise<void> {
      const version = versions.get(database);
      if (version === undefined) throw new Error("Read database before writing");
      const result = await sql.query(`UPDATE shodka_state SET payload = $1::jsonb,
        version = version + 1, updated_at = now()
        WHERE id = 1 AND version = $2::bigint RETURNING version::text AS version`, [JSON.stringify(database), version]);
      if (!result.rows[0]) throw new StorageConflict();
      versions.set(database, result.rows[0].version);
    },
    async importIntoEmpty(database: Database): Promise<void> {
      await initialize();
      const result = await sql.query(`UPDATE shodka_state SET payload = $1::jsonb,
        version = version + 1, updated_at = now()
        WHERE id = 1 AND version = 0 AND payload = $2::jsonb RETURNING id`,
      [JSON.stringify(database), JSON.stringify({ users: [], activities: [], applications: [] })]);
      if (!result.rows[0]) throw new Error("Import refused: destination is not empty");
    },
  };
}
