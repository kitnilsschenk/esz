import { connect } from '@edms/migrate';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';

/**
 * Login-Rolle als Mitglied von `edms_app` — dem Rollenmodell entsprechend die
 * Rolle, unter der die NestJS-Anwendung im Zielbetrieb verbindet.
 *
 * WARUM ES DIESE TEST-ROLLE BRAUCHT (database-lead-Review 2026-09-17):
 * Entwicklung und Test verbinden ueber `DATABASE_URL` als `edms` — und `edms`
 * ist ein echter PostgreSQL-Superuser. Damit ist das gesamte
 * Least-Privilege-Modell um `edms_app` im laufenden Betrieb unsichtbar: Jede
 * Abfrage gelingt, unabhaengig davon, ob die Zielrolle sie duerfte. Genau
 * dadurch blieb unbemerkt, dass die C-10-Zaehlung `energy.zaehler` direkt
 * enumerierte, worauf `edms_app` keinerlei Recht hat — sie waere am Tag der
 * Umstellung ausgefallen.
 *
 * Tests, die eine Rechte-Eigenschaft behaupten, muessen deshalb unter DIESER
 * Rolle laufen und nicht unter der Superuser-Verbindung. Sonst pruefen sie,
 * dass etwas funktioniert, und nicht, dass es erlaubt ist.
 *
 * Aufbau analog `ingest-worker-role.test-support.ts`: `edms_app` ist eine
 * `NOLOGIN`-Gruppenrolle (V0003), die Credential-Zuweisung ist bewusst nicht
 * Teil einer Migration.
 */
export const APP_TEST_LOGIN_ROLE = 'edms_app_login_test';
const APP_TEST_LOGIN_PASSWORD = 'edms-app-test-only-password';

export async function ensureAppLoginRole(container: StartedPostgreSqlContainer): Promise<void> {
  const client = await connect({ connectionString: container.getConnectionUri() });
  try {
    await client.query(
      `DO $$ BEGIN
         CREATE ROLE ${APP_TEST_LOGIN_ROLE} LOGIN PASSWORD '${APP_TEST_LOGIN_PASSWORD}';
       EXCEPTION WHEN duplicate_object THEN
         NULL;
       END $$;`,
    );
    await client.query(`ALTER ROLE ${APP_TEST_LOGIN_ROLE} PASSWORD '${APP_TEST_LOGIN_PASSWORD}'`);
    await client.query(`GRANT edms_app TO ${APP_TEST_LOGIN_ROLE}`);
  } finally {
    await client.end();
  }
}

export function buildAppConnectionString(container: StartedPostgreSqlContainer): string {
  const url = new URL(container.getConnectionUri());
  url.username = APP_TEST_LOGIN_ROLE;
  url.password = APP_TEST_LOGIN_PASSWORD;
  return url.toString();
}
