import path from 'node:path';
import type { ClientConfig } from 'pg';

export interface RunnerConfig {
  readonly db: ClientConfig;
  readonly migrationsDir: string;
}

function env(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === '' ? undefined : value;
}

/**
 * Baut die Runner-Konfiguration ausschließlich aus ENV-Variablen — niemals
 * hartkodiert (Arbeitsauftrag AP3).
 *
 * Vorrang:
 *   1. `DATABASE_URL` (z. B. für CI/Power-User-Overrides), falls gesetzt.
 *   2. Sonst die bereits in `.env.example` dokumentierten Variablen
 *      `POSTGRES_HOST` / `POSTGRES_PORT` (Default 5432) / `POSTGRES_DB` /
 *      `POSTGRES_USER` / `POSTGRES_PASSWORD`.
 *
 * `MIGRATIONS_DIR` ist ein optionaler Override für das Migrations-Verzeichnis
 * (Default: `<cwd>/migrations` — der Runner wird per Konvention aus dem
 * Repo-Root heraus aufgerufen, z. B. via `pnpm --filter @edms/migrate run up`).
 *
 * Bewusst: keine neuen Pflicht-Variablen in `.env.example` nötig — der
 * Runner kommt mit der bestehenden AP1-Baseline aus.
 */
export function loadConfig(): RunnerConfig {
  const migrationsDir = env('MIGRATIONS_DIR') ?? path.resolve(process.cwd(), 'migrations');
  const databaseUrl = env('DATABASE_URL');

  if (databaseUrl !== undefined) {
    return { db: { connectionString: databaseUrl }, migrationsDir };
  }

  const host = env('POSTGRES_HOST');
  const port = env('POSTGRES_PORT');
  const database = env('POSTGRES_DB');
  const user = env('POSTGRES_USER');
  const password = env('POSTGRES_PASSWORD');

  if (host === undefined || database === undefined || user === undefined || password === undefined) {
    throw new Error(
      'Datenbankverbindung fehlt: setze entweder DATABASE_URL oder POSTGRES_HOST/POSTGRES_DB/' +
        'POSTGRES_USER/POSTGRES_PASSWORD (siehe .env.example). POSTGRES_PORT ist optional (Default 5432).',
    );
  }

  return {
    db: {
      host,
      port: port === undefined ? 5432 : Number.parseInt(port, 10),
      database,
      user,
      password,
    },
    migrationsDir,
  };
}
