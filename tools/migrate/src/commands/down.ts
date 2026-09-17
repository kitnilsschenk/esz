import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Client } from 'pg';
import { sha256Hex } from '../checksum.js';
import { withAdvisoryLock } from '../db.js';
import { logger } from '../logger.js';
import { formatVersion } from '../migration-file.js';
import { deleteMigrationRecord, loadAppliedMigrations, schemaMigrationsTableExists } from '../schema-migrations.js';

/**
 * Rollt GENAU die zuletzt angewendete Migration zurück, via ihrer
 * `.down.sql` (ADR-0001 §10.4). Manueller, bewusster Schritt — daher das
 * Bestätigungs-Flag `--yes`; es gibt KEINEN automatischen Rollback bei
 * Fehlern (das ist Aufgabe von `up`s Transaktions-Rollback).
 */
export async function runDown(client: Client, migrationsDir: string, confirmed: boolean): Promise<void> {
  if (!confirmed) {
    throw new Error(
      "'down' erfordert das Bestätigungs-Flag --yes (Rollback ist ein manueller, bewusster Schritt, " +
        'siehe tools/migrate/README.md).',
    );
  }

  await withAdvisoryLock(client, async () => {
    const tableExists = await schemaMigrationsTableExists(client);
    if (!tableExists) {
      logger.info('Keine schema_migrations-Tabelle gefunden — nichts zurückzurollen.');
      return;
    }

    const applied = await loadAppliedMigrations(client);
    if (applied.size === 0) {
      logger.info('Keine angewendeten Migrationen — nichts zurückzurollen.');
      return;
    }

    const lastVersion = Math.max(...applied.keys());
    const record = applied.get(lastVersion);
    if (record === undefined) {
      // Kann durch obige Ableitung (lastVersion stammt aus applied.keys())
      // nicht eintreten — defensive Absicherung für strict-mode.
      throw new Error('Interner Fehler: letzte angewendete Version nicht auflösbar.');
    }

    const versionRaw = formatVersion(lastVersion);
    const upFile = path.join(migrationsDir, `V${versionRaw}__${record.name}.sql`);
    if (existsSync(upFile)) {
      const currentChecksum = sha256Hex(readFileSync(upFile, 'utf8'));
      if (currentChecksum !== record.checksum) {
        throw new Error(
          `Checksum-Drift bei V${versionRaw}__${record.name}.sql erkannt — Rollback abgebrochen. ` +
            "Bitte zuerst 'status' bzw. 'up' zur Diagnose ausführen.",
        );
      }
    }

    const downFile = path.join(migrationsDir, `V${versionRaw}__${record.name}.down.sql`);
    if (!existsSync(downFile)) {
      throw new Error(
        `Down-Migration fehlt für die zuletzt angewendete Version V${versionRaw}__${record.name}: ` +
          `erwartet "${downFile}". Rollback abgebrochen.`,
      );
    }

    const sql = readFileSync(downFile, 'utf8');
    logger.info(`Rolle zurück: V${versionRaw}__${record.name}.down.sql (manueller Rollback, --yes bestätigt)`);

    await client.query('BEGIN');
    try {
      await client.query(sql);
      await deleteMigrationRecord(client, lastVersion);
      await client.query('COMMIT');
      logger.info(`Zurückgerollt: V${versionRaw}__${record.name}`);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Rollback fehlgeschlagen: V${versionRaw}__${record.name} — Transaktion zurückgerollt.`);
      throw error;
    }
  });
}
