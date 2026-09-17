import { readFileSync } from 'node:fs';
import type { Client } from 'pg';
import { sha256Hex } from '../checksum.js';
import { withAdvisoryLock } from '../db.js';
import { logger } from '../logger.js';
import { formatVersion } from '../migration-file.js';
import { scanMigrations } from '../scan.js';
import { ensureSchemaMigrationsTable, loadAppliedMigrations, recordMigration } from '../schema-migrations.js';

/**
 * Checksum-Drift oder eine fehlende, bereits angewendete Migrationsdatei —
 * harter Abbruch, kein Auto-Repair (ADR-0001 §10.4 (b)).
 */
export class ChecksumDriftError extends Error {}

/**
 * Wendet alle ausstehenden Migrationen aus `migrationsDir` an.
 *
 * Ablauf (unter dem prozessweiten Advisory-Lock, ADR-0001 §10.4 (c)):
 *   1. `schema_migrations` sicherstellen (Bootstrap-DDL, s. schema-migrations.ts).
 *   2. Checksum-Drift-Check ZUERST über alle bereits angewendeten Versionen —
 *      bevor irgendetwas Neues angewendet wird.
 *   3. Jede ausstehende Migration in ihrer EIGENEN Transaktion anwenden
 *      (ADR-0001 §10.4 (d)); schlägt eine fehl, rollt die Transaktion
 *      zurück und der gesamte Lauf bricht ab — `.down.sql` wird dabei NICHT
 *      automatisch ausgeführt (ADR-0001 §10.4 (a)).
 */
export async function runUp(client: Client, migrationsDir: string): Promise<void> {
  const files = scanMigrations(migrationsDir);

  await withAdvisoryLock(client, async () => {
    await ensureSchemaMigrationsTable(client);
    const applied = await loadAppliedMigrations(client);

    for (const file of files) {
      const record = applied.get(file.version);
      if (record === undefined) {
        continue;
      }
      const currentChecksum = sha256Hex(readFileSync(file.upFile, 'utf8'));
      if (currentChecksum !== record.checksum) {
        throw new ChecksumDriftError(
          `Checksum-Drift bei V${file.versionRaw}__${file.name}.sql: bereits angewendet mit Checksumme ` +
            `${record.checksum}, Datei enthält jetzt ${currentChecksum}. Die Datei wurde nachträglich ` +
            'verändert (append-only-Verletzung von migrations/**). Abbruch — kein Auto-Repair.',
        );
      }
    }

    const filesByVersion = new Map(files.map((file) => [file.version, file] as const));
    for (const version of applied.keys()) {
      if (!filesByVersion.has(version)) {
        throw new ChecksumDriftError(
          `Bereits angewendete Migration V${formatVersion(version)} fehlt im Verzeichnis ${migrationsDir} ` +
            '— Checksumme kann nicht verifiziert werden. Abbruch.',
        );
      }
    }

    const pending = files.filter((file) => !applied.has(file.version));
    if (pending.length === 0) {
      logger.info('Keine ausstehenden Migrationen.');
      return;
    }

    for (const file of pending) {
      const sql = readFileSync(file.upFile, 'utf8');
      const checksum = sha256Hex(sql);
      logger.info(`Wende an: V${file.versionRaw}__${file.name}.sql`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await recordMigration(client, { version: file.version, name: file.name, checksum });
        await client.query('COMMIT');
        logger.info(`Angewendet: V${file.versionRaw}__${file.name}.sql`);
      } catch (error) {
        await client.query('ROLLBACK');
        logger.error(
          `Fehlgeschlagen: V${file.versionRaw}__${file.name}.sql — Transaktion zurückgerollt, Lauf abgebrochen.`,
        );
        throw error;
      }
    }
  });
}
