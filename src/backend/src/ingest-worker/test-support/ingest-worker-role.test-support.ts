import { connect } from '@edms/migrate';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';

/**
 * ADR-0005 §26.4 (RL-1) — `edms_ingest_worker` (V0010) ist eine `NOLOGIN`-
 * Gruppenrolle; Credential-/Mitgliedschafts-Zuweisung ist BEWUSST NICHT Teil
 * der Migration (Betriebs-/Credential-Entscheidung, devops-lead/security-lead,
 * s. V0010-Datei-Kopf). Fuer Tests/Dev braucht es daher eine EIGENE
 * `LOGIN`-Rolle als Mitglied von `edms_ingest_worker` — NIEMALS die breite
 * `edms_app`-Verbindung fuer den Worker.
 *
 * Dieselbe Anlage-Logik ist der DEV-SETUP-HINWEIS fuer den spaeteren
 * Betrieb (s. Auslieferungsbericht Aufgabe F): ein `devops-lead`-Skript
 * fuehrt strukturell dasselbe DO-Block-Muster (idempotent, analog V0010
 * `edms_ingest_worker`-Anlage) gegen die Ziel-DB aus, MIT einem echten,
 * aus Secrets/Vault bezogenen Passwort statt des hier fest verdrahteten
 * Test-Passworts.
 */
export const INGEST_WORKER_TEST_LOGIN_ROLE = 'edms_ingest_worker_login_test';
const INGEST_WORKER_TEST_LOGIN_PASSWORD = 'edms-ingest-worker-test-only-password';

export async function ensureIngestWorkerLoginRole(container: StartedPostgreSqlContainer): Promise<void> {
  const client = await connect({ connectionString: container.getConnectionUri() });
  try {
    await client.query(
      `DO $$ BEGIN
         CREATE ROLE ${INGEST_WORKER_TEST_LOGIN_ROLE} LOGIN PASSWORD '${INGEST_WORKER_TEST_LOGIN_PASSWORD}';
       EXCEPTION WHEN duplicate_object THEN
         NULL;
       END $$;`,
    );
    // Idempotent, auch wenn die Rolle aus einem frueheren Lauf bereits existiert.
    await client.query(`ALTER ROLE ${INGEST_WORKER_TEST_LOGIN_ROLE} PASSWORD '${INGEST_WORKER_TEST_LOGIN_PASSWORD}'`);
    await client.query(`GRANT edms_ingest_worker TO ${INGEST_WORKER_TEST_LOGIN_ROLE}`);
  } finally {
    await client.end();
  }
}

/**
 * `EDMS_INGEST_DATABASE_URL` fuer den Worker-Testlauf — dieselbe DB/denselben
 * Host/Port wie `container.getConnectionUri()`, aber mit den Credentials der
 * least-privilege Login-Rolle (NIEMALS dem Testcontainer-Superuser).
 */
export function buildIngestWorkerConnectionString(container: StartedPostgreSqlContainer): string {
  const url = new URL(container.getConnectionUri());
  url.username = INGEST_WORKER_TEST_LOGIN_ROLE;
  url.password = INGEST_WORKER_TEST_LOGIN_PASSWORD;
  return url.toString();
}
