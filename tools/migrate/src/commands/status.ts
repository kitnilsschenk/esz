import { readFileSync } from 'node:fs';
import type { Client } from 'pg';
import { sha256Hex } from '../checksum.js';
import { logger } from '../logger.js';
import { loadAppliedMigrations, schemaMigrationsTableExists } from '../schema-migrations.js';
import type { AppliedMigration } from '../schema-migrations.js';
import { scanMigrations } from '../scan.js';

/**
 * Rein lesender Statusbericht: angewendete vs. ausstehende Migrationen,
 * inkl. Checksum-Abgleich. Führt KEINE Schreibaktion aus (legt insbesondere
 * `schema_migrations` nicht an, falls die Tabelle noch fehlt).
 */
export async function runStatus(client: Client, migrationsDir: string): Promise<void> {
  const files = scanMigrations(migrationsDir);

  if (files.length === 0) {
    logger.info(`Keine Migrationsdateien in ${migrationsDir} gefunden.`);
    return;
  }

  const tableExists = await schemaMigrationsTableExists(client);
  const applied: Map<number, AppliedMigration> = tableExists
    ? await loadAppliedMigrations(client)
    : new Map<number, AppliedMigration>();

  logger.info(`${files.length} Migrationsdatei(en) validiert (Namenskonvention + Sequenz OK).`);
  logger.info('VERSION  STATUS    CHECKSUMME   ANGEWENDET (UTC)              NAME');

  for (const file of files) {
    const record = applied.get(file.version);
    if (record === undefined) {
      logger.info(`V${file.versionRaw}   pending   —            —                              ${file.name}`);
      continue;
    }
    const currentChecksum = sha256Hex(readFileSync(file.upFile, 'utf8'));
    const checksumStatus = currentChecksum === record.checksum ? 'ok' : 'DRIFT';
    logger.info(
      `V${file.versionRaw}   applied   ${checksumStatus.padEnd(12)} ${record.appliedAt}   ${file.name}`,
    );
  }

  const pendingCount = files.filter((file) => !applied.has(file.version)).length;
  logger.info(`${applied.size} angewendet, ${pendingCount} ausstehend.`);
}
