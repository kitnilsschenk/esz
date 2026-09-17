import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Client } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChecksumDriftError, runUp } from './up.js';

interface FakeAppliedRow {
  readonly version: number;
  readonly name: string;
  readonly checksum: string;
  readonly applied_at: Date;
}

/**
 * Gemockter `pg.Client` — bildet nur die SQL-Muster nach, die `runUp`
 * tatsächlich absetzt (Advisory-Lock, `schema_migrations`-Bootstrap-DDL,
 * die "bereits angewendet"-Abfrage). Alle übrigen Statements (BEGIN/COMMIT/
 * INSERT/das eigentliche Migrations-SQL) werden lediglich protokolliert, um
 * im Test zu verifizieren, DASS (bzw. dass NICHT) versucht wurde, sie
 * abzusetzen — Kernaussage von ADR-0001 §10.4 (b): "Checksum-Drift = harter
 * Abbruch, kein Auto-Repair", geprüft anhand gemockter
 * `schema_migrations`-Einträge (keine echte DB, Arbeitsauftrag AP6).
 */
function createFakeClient(appliedRows: readonly FakeAppliedRow[]): { client: Client; queries: string[] } {
  const queries: string[] = [];

  const query = vi.fn((sql: string) => {
    queries.push(sql);

    if (sql.includes('pg_advisory')) {
      return Promise.resolve({ rows: [] });
    }
    if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
      return Promise.resolve({ rows: [] });
    }
    if (sql.includes('FROM public.schema_migrations ORDER BY version')) {
      return Promise.resolve({ rows: appliedRows });
    }
    return Promise.resolve({ rows: [] });
  });

  return { client: { query } as unknown as Client, queries };
}

function makeFixtureDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'edms-migrate-checksum-'));
}

describe('runUp — Checksum-Drift-Erkennung (ADR-0001 §10.4 (b), gemockte schema_migrations-Einträge)', () => {
  let fixtureDir: string;

  beforeEach(() => {
    fixtureDir = makeFixtureDir();
  });

  afterEach(() => {
    rmSync(fixtureDir, { recursive: true, force: true });
  });

  it('bricht hart ab, wenn die Checksumme einer bereits angewendeten Datei nicht mehr übereinstimmt', async () => {
    writeFileSync(
      path.join(fixtureDir, 'V0001__create_extensions.sql'),
      '-- Inhalt wurde NACH dem Anwenden nachträglich verändert (Append-only-Verletzung)\nSELECT 1;\n',
      'utf8',
    );
    writeFileSync(path.join(fixtureDir, 'V0001__create_extensions.down.sql'), '-- down\n', 'utf8');

    const { client, queries } = createFakeClient([
      {
        version: 1,
        name: 'create_extensions',
        checksum: 'deadbeef',
        applied_at: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);

    await expect(runUp(client, fixtureDir)).rejects.toBeInstanceOf(ChecksumDriftError);

    // Kein Auto-Repair: es darf NIE versucht worden sein, für die drifted
    // Migration eine Transaktion zu öffnen oder einen neuen Eintrag zu
    // schreiben.
    expect(queries.some((sql) => sql === 'BEGIN')).toBe(false);
    expect(queries.some((sql) => sql.includes('INSERT INTO'))).toBe(false);
  });

  it('bricht hart ab, wenn eine bereits angewendete Version im Verzeichnis fehlt', async () => {
    // Verzeichnis enthält KEINE Datei für die (laut schema_migrations) bereits
    // angewendete Version 1 — Checksumme kann nicht verifiziert werden.
    const { client, queries } = createFakeClient([
      {
        version: 1,
        name: 'create_extensions',
        checksum: 'deadbeef',
        applied_at: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);

    await expect(runUp(client, fixtureDir)).rejects.toBeInstanceOf(ChecksumDriftError);
    expect(queries.some((sql) => sql === 'BEGIN')).toBe(false);
  });

  it('wendet ausstehende Migrationen normal an, wenn keine Drift vorliegt', async () => {
    writeFileSync(path.join(fixtureDir, 'V0001__create_extensions.sql'), '-- up\nSELECT 1;\n', 'utf8');
    writeFileSync(path.join(fixtureDir, 'V0001__create_extensions.down.sql'), '-- down\n', 'utf8');

    const { client, queries } = createFakeClient([]); // noch keine angewendeten Migrationen

    await runUp(client, fixtureDir);

    expect(queries.some((sql) => sql === 'BEGIN')).toBe(true);
    expect(queries.some((sql) => sql.includes('INSERT INTO'))).toBe(true);
    expect(queries.some((sql) => sql === 'COMMIT')).toBe(true);
  });
});
