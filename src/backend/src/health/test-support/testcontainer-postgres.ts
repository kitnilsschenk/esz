import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';

// Identisches Image wie deployment/docker/docker-compose.dev.yml (ADR-0001
// §10.5) — Integrationstests laufen gegen dieselbe TimescaleDB-"-oss"-Version
// wie der Dev-Stack, nicht gegen ein generisches `postgres`-Image.
export const HEALTH_TEST_POSTGRES_IMAGE = 'timescale/timescaledb:2.15.3-pg16-oss';

/**
 * Startet einen echten PostgreSQL+TimescaleDB-Testcontainer. Wirft bei
 * fehlendem/nicht erreichbarem Docker die unveränderte Testcontainers-
 * Fehlermeldung durch — bewusst KEIN Auto-Skip (.claude/rules/tests.md).
 */
export async function startTestPostgres(): Promise<StartedPostgreSqlContainer> {
  return new PostgreSqlContainer(HEALTH_TEST_POSTGRES_IMAGE).start();
}
