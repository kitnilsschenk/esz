import { connect } from '@edms/migrate';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';

/**
 * ADR-0012 E5/Stufe C, Auflage C-1 — eine ECHTE, NICHT-superuser
 * Migrations-Rolle fuer Testcontainer-Verifikationen.
 *
 * `migrateTestPostgres()` (`stammdaten/test-support/migrate-test-postgres.ts`)
 * verbindet ueber `container.getConnectionUri()` — den Bootstrap-User des
 * Testcontainers, der (wie jeder von `initdb` angelegte Erstbenutzer,
 * unabhaengig vom gewaehlten Namen) SUPERUSER ist. Ein Superuser umgeht die
 * PostgreSQL-eigene Pruefung "die neue Owner-Rolle braucht CREATE auf dem
 * Zielschema" bei `ALTER ... OWNER TO` vollstaendig (s. V0084-Datei-Kopf,
 * Auflage C-1) — ein Migrations-Fehler, der GENAU DAS voraussetzt, faellt
 * unter dem Bootstrap-User also nicht auf.
 *
 * Diese Rolle bildet nach, was ein REALISTISCHER, nicht-superuser
 * Migrations-Betrieb braucht:
 *   - `LOGIN` — muss sich selbst verbinden koennen.
 *   - `CREATEROLE` — etliche Migrationen legen eigene Rollen an
 *     (`edms_ingest_worker`, `edms_analytics_owner`, `edms_consent_gate_owner`,
 *     ...). Seit PostgreSQL 16 wird die erzeugende Rolle automatisch mit
 *     ADMIN OPTION Mitglied der neu erzeugten Rolle — das deckt die zweite
 *     Voraussetzung von `ALTER ... OWNER TO` (der aktuelle Session-User muss
 *     per SET ROLE auf die neue Owner-Rolle wechseln koennen).
 *   - Eigentuemerin der Test-Datenbank — Schema-Anlage (`CREATE SCHEMA ...`)
 *     verlangt CREATE-Privileg auf der DATENBANK; der Datenbank-Eigentuemer
 *     hat das ohne separates GRANT. OHNE das waere bereits `CREATE SCHEMA
 *     energy` (V0002) unter dieser Rolle nicht ausfuehrbar.
 *   - AUSDRUECKLICH KEIN `SUPERUSER`.
 *
 * NICHT abgedeckt: `CREATE EVENT TRIGGER` (V0003) verlangt IMMER Superuser,
 * unabhaengig von jeder graduellen Rechte-Vergabe — V0003 selbst behandelt
 * das bereits als erwarteten Fall (`current_setting('is_superuser')`-Check,
 * `RAISE WARNING` statt Abbruch). Diese Rolle loest also GENAU den Fall aus,
 * fuer den V0003 bereits vorgesorgt hat.
 */
export const MIGRATION_TEST_ROLE = 'edms_migration_test_role';
const MIGRATION_TEST_PASSWORD = 'edms-migration-test-only-password';

export async function ensureMigrationRole(container: StartedPostgreSqlContainer): Promise<void> {
  const client = await connect({ connectionString: container.getConnectionUri() });
  try {
    await client.query(
      `DO $$ BEGIN
         CREATE ROLE ${MIGRATION_TEST_ROLE} LOGIN CREATEROLE PASSWORD '${MIGRATION_TEST_PASSWORD}';
       EXCEPTION WHEN duplicate_object THEN
         NULL;
       END $$;`,
    );
    // Idempotent, auch wenn die Rolle aus einem frueheren Lauf bereits existiert.
    await client.query(`ALTER ROLE ${MIGRATION_TEST_ROLE} PASSWORD '${MIGRATION_TEST_PASSWORD}'`);
    await client.query(`ALTER ROLE ${MIGRATION_TEST_ROLE} CREATEROLE NOSUPERUSER`);
    // Eigentuemerin der Datenbank -- s. Klassen-Kommentar. `getDatabase()`
    // liefert den Namen unquotiert; Testcontainer-Datenbanknamen sind fixe,
    // von uns nicht beeinflussbare Bezeichner (kein Injection-Risiko in
    // diesem Test-Support-Kontext).
    await client.query(`ALTER DATABASE ${container.getDatabase()} OWNER TO ${MIGRATION_TEST_ROLE}`);

    // `public.schema_migrations` (Bootstrap-DDL des `@edms/migrate`-Runners
    // SELBST, s. `tools/migrate/src/schema-migrations.ts`) wurde bereits VOR
    // diesem Aufruf angelegt (Phase 1: `CREATE EXTENSION`, IMMER als
    // Testcontainer-Bootstrap-Superuser, s. Integrationstest) — `ALTER
    // DATABASE ... OWNER TO` allein macht diese Rolle NICHT rueckwirkend zum
    // Eigentuemer bereits existierender Objekte (nur des `public`-Schemas
    // selbst, ueber die automatische `pg_database_owner`-Mitgliedschaft seit
    // PostgreSQL 15). Ohne diesen Schritt scheitert der eigentliche
    // Migrationslauf (V0002 aufwaerts) bereits an SEINER ERSTEN Zeile mit
    // "permission denied for table schema_migrations", bevor auch nur eine
    // einzige Fach-Migration versucht wird. Bedingtes `ALTER TABLE`, falls
    // die Tabelle zum Zeitpunkt dieses Aufrufs noch nicht existiert (z. B.
    // wenn ein Aufrufer diese Funktion vor Phase 1 aufruft).
    await client.query(`
      DO $$
      BEGIN
        IF to_regclass('public.schema_migrations') IS NOT NULL THEN
          ALTER TABLE public.schema_migrations OWNER TO ${MIGRATION_TEST_ROLE};
        END IF;
      END $$;
    `);
  } finally {
    await client.end();
  }
}

/**
 * Verbindungsstring fuer `MIGRATION_TEST_ROLE` gegen dieselbe Datenbank —
 * NIEMALS den Testcontainer-Bootstrap-User (s. Klassen-Kommentar).
 */
export function buildMigrationRoleConnectionString(container: StartedPostgreSqlContainer): string {
  const url = new URL(container.getConnectionUri());
  url.username = MIGRATION_TEST_ROLE;
  url.password = MIGRATION_TEST_PASSWORD;
  return url.toString();
}

/**
 * SEPARATER Befund dieser Verifikation, NICHT Teil der Auflage C-1 (die
 * betrifft ausschliesslich V0084): Drei PRE-EXISTIERENDE Migrationen
 * (`grep -n "OWNER TO" migrations/*.sql`) fuehren `ALTER ... OWNER TO
 * <rolle>` aus, ohne sich vorher (wie V0084 es jetzt tut) selbst das
 * PostgreSQL-16-SET-Recht auf diese Rolle zu gewaehren:
 *   - V0003 -> `edms_audit_owner`
 *   - V0019 -> `edms_analytics_owner`
 *   - V0025 -> `edms_nachweis_owner`
 *
 * Unter einer echten, nicht-superuser Rolle scheitern sie deshalb JEWEILS
 * mit "must be able to SET ROLE ...". Ein Abfangen-und-Nachruesten NACH dem
 * Fehlschlag funktioniert nicht: Jede Migrationsdatei laeuft in EINER
 * Transaktion (`tools/migrate/src/commands/up.ts`), ein Fehler rollt
 * ALLES in dieser Datei zurueck — auch das `CREATE ROLE`, das kurz zuvor in
 * DERSELBEN Transaktion lief. Die Rolle existiert nach dem Fehlschlag also
 * nicht mehr, ein nachtraegliches `GRANT ... WITH SET TRUE` liefe ins Leere.
 *
 * Diese Funktion legt die drei Rollen deshalb VORAB an (eigene, sofort
 * committete Anweisungen, ausserhalb jeder Migrations-Transaktion) und
 * gewaehrt `MIGRATION_TEST_ROLE` das SET-Recht darauf. Wenn die jeweilige
 * Migration spaeter ihr EIGENES `CREATE ROLE ... EXCEPTION WHEN
 * duplicate_object THEN NULL` ausfuehrt, findet sie die Rolle bereits vor
 * (Idempotenz-Pfad, ohnehin im Repo-Muster vorgesehen) — unberuehrt vom
 * spaeteren Erfolg/Misserfolg IHRER Transaktion, weil sie ausserhalb davon
 * entstanden ist.
 *
 * Die drei Migrationen bleiben unveraendert — sie MUESSEN es: Sie sind
 * angewendet, und der Runner bricht bei Pruefsummen-Drift ab.
 *
 * **Diese Funktion ist seit dem 2026-09-17 die Nachbildung eines
 * AUSGELIEFERTEN Bootstrap-Schritts**, nicht mehr ein Test-Behelf:
 * `tools/db/bootstrap-owner-rollen.sh` tut gegen eine echte Datenbank genau
 * dasselbe und gehoert vor den ersten Migrationslauf jeder Umgebung, die
 * ohne Superuser migriert. Der gruene Integrationstest ist damit zugleich
 * der Nachweis, dass dieser Bootstrap-Schritt wirkt: Er laesst die
 * vollstaendige Kette unter einer Rolle OHNE Superuser-Recht durchlaufen,
 * und ohne den Schritt scheitert sie an V0003.
 *
 * Die Rollenliste unten und die im Skript muessen deckungsgleich bleiben.
 * `migration-role.test-support.spec.ts` prueft das — zwei Listen, die
 * dasselbe meinen und getrennt gepflegt werden, laufen sonst auseinander,
 * und zwar unbemerkt, weil beide fuer sich weiter funktionieren.
 */
export const BEKANNTE_OWNER_ROLLEN_OHNE_SET_GRANT = [
  'edms_audit_owner',
  'edms_analytics_owner',
  'edms_nachweis_owner',
];

export async function preCreateKnownOwnerRolesWithSetOption(container: StartedPostgreSqlContainer): Promise<void> {
  const client = await connect({ connectionString: buildMigrationRoleConnectionString(container) });
  try {
    for (const rolle of BEKANNTE_OWNER_ROLLEN_OHNE_SET_GRANT) {
      await client.query(
        `DO $$ BEGIN
           CREATE ROLE ${rolle} NOLOGIN;
         EXCEPTION WHEN duplicate_object THEN
           NULL;
         END $$;`,
      );
      await client.query(`GRANT ${rolle} TO CURRENT_USER WITH SET TRUE`);
    }
  } finally {
    await client.end();
  }
}
