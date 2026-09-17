// Programmatischer Einstiegspunkt von `@edms/migrate` (z. B. für spätere
// Integrationstests gegen Testcontainer-PG, ADR-0001 §10.5). Die CLI selbst
// lebt in `cli.ts` (`bin.edms-migrate`).

export { loadConfig } from './config.js';
export type { RunnerConfig } from './config.js';

export { ADVISORY_LOCK_KEY, connect, withAdvisoryLock } from './db.js';

export { sha256Hex } from './checksum.js';

export { downFilenameFor, formatVersion, parseUpFilename } from './migration-file.js';
export type { MigrationFile, ParsedUpFilename } from './migration-file.js';

export { MigrationValidationError, scanMigrations } from './scan.js';

export {
  deleteMigrationRecord,
  ensureSchemaMigrationsTable,
  loadAppliedMigrations,
  recordMigration,
  schemaMigrationsTableExists,
} from './schema-migrations.js';
export type { AppliedMigration } from './schema-migrations.js';

export { ChecksumDriftError, runUp } from './commands/up.js';
export { runDown } from './commands/down.js';
export { runStatus } from './commands/status.js';

export { logger } from './logger.js';
