import { connect } from '@edms/migrate';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';

/**
 * `edms_einfluss_erkennung` (V0079) ist eine `NOLOGIN`-Gruppenrolle;
 * Credential- und Mitgliedschafts-Zuweisung sind bewusst nicht Teil der
 * Migration (Betriebs-/Credential-Entscheidung — ein Passwort in einer
 * Migration stünde für immer in der Git-Historie). Für Tests und Dev braucht
 * es daher eine eigene `LOGIN`-Rolle als Mitglied.
 *
 * Muster und Begründung wörtlich vom Ingest-Worker übernommen
 * (`ingest-worker-role.test-support.ts`): Dieselbe Anlage-Logik ist der
 * Dev-Setup-Hinweis für den späteren Betrieb — ein devops-lead-Skript führt
 * strukturell denselben idempotenten DO-Block gegen die Ziel-Datenbank aus,
 * mit einem echten Secret statt des hier fest verdrahteten Test-Passworts.
 */
export const EINFLUSS_ERKENNUNG_TEST_LOGIN_ROLE = 'edms_einfluss_erkennung_login_test';
const EINFLUSS_ERKENNUNG_TEST_LOGIN_PASSWORD = 'edms-einfluss-erkennung-test-only-password';

export async function ensureEinflussErkennungLoginRole(container: StartedPostgreSqlContainer): Promise<void> {
  const client = await connect({ connectionString: container.getConnectionUri() });
  try {
    await client.query(
      `DO $$ BEGIN
         CREATE ROLE ${EINFLUSS_ERKENNUNG_TEST_LOGIN_ROLE} LOGIN PASSWORD '${EINFLUSS_ERKENNUNG_TEST_LOGIN_PASSWORD}';
       EXCEPTION WHEN duplicate_object THEN
         NULL;
       END $$;`,
    );
    // Idempotent, auch wenn die Rolle aus einem frueheren Lauf existiert.
    await client.query(
      `ALTER ROLE ${EINFLUSS_ERKENNUNG_TEST_LOGIN_ROLE} PASSWORD '${EINFLUSS_ERKENNUNG_TEST_LOGIN_PASSWORD}'`,
    );
    await client.query(`GRANT edms_einfluss_erkennung TO ${EINFLUSS_ERKENNUNG_TEST_LOGIN_ROLE}`);
  } finally {
    await client.end();
  }
}

/**
 * Die Verbindungszeichenkette des Laufs für den Test — dieselbe Datenbank wie
 * der Container, aber mit den Credentials der least-privilege Rolle, NIEMALS
 * denen des Testcontainer-Superusers. Genau darauf beruht der Test, der
 * beweist, dass der Lauf nicht löschen kann.
 */
export function buildEinflussErkennungConnectionString(container: StartedPostgreSqlContainer): string {
  const url = new URL(container.getConnectionUri());
  url.username = EINFLUSS_ERKENNUNG_TEST_LOGIN_ROLE;
  url.password = EINFLUSS_ERKENNUNG_TEST_LOGIN_PASSWORD;
  return url.toString();
}
