import type { Client } from 'pg';

export interface AppliedMigration {
  readonly version: number;
  readonly name: string;
  readonly checksum: string;
  /** ISO-8601 UTC ("Z"-Suffix). */
  readonly appliedAt: string;
}

// Bewusst `public.schema_migrations` — dies ist Bootstrap-DDL des Runners
// SELBST (analog Flyway's `flyway_schema_history`), KEINE Datei unter
// migrations/** und daher nicht der V<NNNN>__-Konvention unterworfen (siehe
// README.md, Abschnitt "schema_migrations"). Der Tabellenname ist ein
// Compile-Time-Konstante, keine Nutzereingabe — String-Interpolation hier ist
// unkritisch (kein SQL-Injection-Vektor).
const TABLE = 'public.schema_migrations';

export async function schemaMigrationsTableExists(client: Client): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(
    "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists",
  );
  return result.rows[0]?.exists ?? false;
}

export async function ensureSchemaMigrationsTable(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      version     integer      NOT NULL PRIMARY KEY,
      name        text         NOT NULL,
      checksum    text         NOT NULL,
      applied_at  timestamptz  NOT NULL DEFAULT now()
    )
  `);
}

export async function loadAppliedMigrations(client: Client): Promise<Map<number, AppliedMigration>> {
  const result = await client.query<{
    version: number;
    name: string;
    checksum: string;
    applied_at: Date;
  }>(`SELECT version, name, checksum, applied_at FROM ${TABLE} ORDER BY version ASC`);

  const applied = new Map<number, AppliedMigration>();
  for (const row of result.rows) {
    applied.set(row.version, {
      version: row.version,
      name: row.name,
      checksum: row.checksum,
      appliedAt: row.applied_at.toISOString(),
    });
  }
  return applied;
}

export async function recordMigration(
  client: Client,
  migration: { readonly version: number; readonly name: string; readonly checksum: string },
): Promise<void> {
  await client.query(`INSERT INTO ${TABLE} (version, name, checksum, applied_at) VALUES ($1, $2, $3, now())`, [
    migration.version,
    migration.name,
    migration.checksum,
  ]);
}

export async function deleteMigrationRecord(client: Client, version: number): Promise<void> {
  await client.query(`DELETE FROM ${TABLE} WHERE version = $1`, [version]);
}
