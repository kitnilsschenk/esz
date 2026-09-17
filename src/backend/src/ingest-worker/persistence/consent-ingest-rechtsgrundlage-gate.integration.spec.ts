import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { connect, runUp, runDown } from '@edms/migrate';
import { startTestPostgres } from '../../health/test-support/testcontainer-postgres';
import {
  ensureMigrationRole,
  buildMigrationRoleConnectionString,
  preCreateKnownOwnerRolesWithSetOption,
} from '../test-support/migration-role.test-support';
import { buildSingleVersionMigrationsDir } from '../test-support/merged-migrations-dir.test-support';
import { migrationsVerzeichnis } from '../test-support/migrations-verzeichnis.test-support';
import {
  ensureIngestWorkerLoginRole,
  buildIngestWorkerConnectionString,
} from '../test-support/ingest-worker-role.test-support';
import { ensureAppLoginRole, buildAppConnectionString } from '../test-support/app-role.test-support';

const GATE_FUNCTION_SQL = 'SELECT consent.ingest_rechtsgrundlage_wirksam($1::uuid) AS wirksam';

async function gateWirksam(client: Client, zaehlerId: string): Promise<boolean> {
  const result = await client.query<{ wirksam: boolean }>(GATE_FUNCTION_SQL, [zaehlerId]);
  const row = result.rows[0];
  if (row === undefined) {
    throw new Error('consent.ingest_rechtsgrundlage_wirksam hat keine Zeile zurueckgegeben.');
  }
  return row.wirksam;
}

function textVersionSha256(wortlaut: string): Buffer {
  return createHash('sha256').update(wortlaut, 'utf8').digest();
}

/**
 * ADR-0012 E5/Stufe C — Integrationstest gegen ECHTES PostgreSQL 16
 * (+ TimescaleDB-oss), Auflagen C-1 und C-13 (`compliance-director`-Votum).
 *
 * VERIFIZIERT (C-1): Migration V0084 laesst sich unter einer ECHTEN,
 * NICHT-superuser Migrations-Rolle anwenden UND zurueckrollen — die Rolle
 * traegt die GESAMTE Kette V0001..V0084 (nicht nur diese eine Datei), weil
 * jedes `GRANT`/`ALTER ... OWNER TO` in V0084 auf Tabellen/Rollen zeigt, die
 * FRUEHERE Migrationen anlegen; nur wer diese fruehere Migrationen selbst
 * ausgefuehrt hat, besitzt (und darf granten auf) diese Objekte.
 *
 * ZWEISTUFIGER BOOTSTRAP (s. `migration-role.test-support.ts`):
 *   1. `CREATE EXTENSION` (V0001) verlangt IMMER Superuser — laeuft ALLEIN
 *      unter dem Testcontainer-Bootstrap-User.
 *   2. V0002..V0084 laufen unter `edms_migration_test_role` — LOGIN,
 *      CREATEROLE, Eigentuemerin der Test-Datenbank, AUSDRUECKLICH KEIN
 *      SUPERUSER.
 *
 * C-13-Szenarien laufen alle gegen die FUNKTION SELBST (SQL, kein
 * `IngestFlowService`) — das ist die pruefbare Grenze dieser Migration.
 */
describe('consent.ingest_rechtsgrundlage_wirksam — ADR-0012 E5/Stufe C, Auflagen C-1/C-13 (Testcontainer-PG16)', () => {
  let container: StartedPostgreSqlContainer;
  let migrationClient: Client; // edms_migration_test_role — Eigentuemerin, fuer Fixture-Seeding UND Migrationslauf
  let workerClient: Client; // edms_ingest_worker (Login-Testrolle) — GENAU das, was der Worker im Betrieb haelt
  let appClient: Client; // edms_app (Login-Testrolle) — was die NestJS-Anwendung im Zielbetrieb haelt

  beforeAll(async () => {
    container = await startTestPostgres();

    // Phase 1 — Extensions (V0001) als Testcontainer-Bootstrap-Superuser.
    const extOnlyDir = buildSingleVersionMigrationsDir('V0001__');
    try {
      const bootstrapClient = await connect({ connectionString: container.getConnectionUri() });
      try {
        await runUp(bootstrapClient, extOnlyDir.dir);
      } finally {
        await bootstrapClient.end();
      }
    } finally {
      extOnlyDir.cleanup();
    }

    // Phase 2 — nicht-superuser Migrationsrolle anlegen (Auflage C-1).
    await ensureMigrationRole(container);

    // Phase 2b — SEPARATER Befund (nicht Teil von C-1, s. dortiger
    // Kommentar): drei PRE-EXISTIERENDE Migrationen (V0003/V0019/V0025)
    // fuehren `ALTER ... OWNER TO <rolle>` aus, ohne sich selbst das
    // PG16-SET-Recht zu gewaehren. Vorab-Anlage + SET-Grant AUSSERHALB jeder
    // Migrations-Transaktion, damit diese drei Migrationen unter der echten
    // nicht-superuser Rolle ueberhaupt durchlaufen (Voraussetzung, um V0084
    // am Ende der Kette ueberhaupt zu erreichen).
    await preCreateKnownOwnerRolesWithSetOption(container);

    // Phase 3 — V0002..V0084 unter DIESER Rolle, gegen die ECHTE Kette.
    // V0001 ist darin enthalten; `runUp` erkennt sie ueber
    // `schema_migrations` bereits als angewendet und ueberspringt sie, alles
    // ab V0002 laeuft echt unter `edms_migration_test_role`.
    //
    // Bis zum 2026-09-17 stand hier ein zusammengefuehrtes Temp-Verzeichnis,
    // weil V0084 noch ausserhalb von `migrations/` lag. Seit sie in der Kette
    // liegt, gibt es nichts zusammenzufuehren — und damit auch keine Stelle
    // mehr, an der eine Datei eine andere still ueberschreiben kann.
    const migrationsDir = migrationsVerzeichnis();

    const migrationRoleConnectionString = buildMigrationRoleConnectionString(container);
    const migrationRunnerClient = await connect({ connectionString: migrationRoleConnectionString });
    try {
      await runUp(migrationRunnerClient, migrationsDir);
    } finally {
      await migrationRunnerClient.end();
    }

    // Auflage C-1 — UND ZURUECKBAUEN: V0084 sofort wieder runter, dann
    // wieder rauf (derselbe Zustand wie zuvor, aber der Rueckbau-Pfad ist
    // damit ECHT verifiziert, nicht nur der Up-Pfad). Kein Auto-Heal noetig:
    // der Rueckbau betrifft AUSSCHLIESSLICH V0084 selbst (die letzte
    // angewendete Migration), und dessen `.down.sql` traegt den noetigen
    // `SET ROLE`-Schritt bereits selbst (s. Datei-Kopf).
    const rollbackClient = await connect({ connectionString: migrationRoleConnectionString });
    try {
      await runDown(rollbackClient, migrationsDir, true);
    } finally {
      await rollbackClient.end();
    }
    const reapplyClient = await connect({ connectionString: migrationRoleConnectionString });
    try {
      await runUp(reapplyClient, migrationsDir);
    } finally {
      await reapplyClient.end();
    }

    // Fixture-Seeding UND die eigentlichen Testabfragen laufen ueber
    // verschiedene Rollen:
    //   - `migrationClient` (Eigentuemerin): Stammdaten/Consent-Fixtures
    //     anlegen — braucht volle Rechte, die der Worker NICHT hat.
    //   - `workerClient` (`edms_ingest_worker`-Mitglied): GENAU das, was der
    //     Worker im Betrieb haelt — EXECUTE auf die Funktion, sonst nichts
    //     in `consent.*`.
    migrationClient = new Client({ connectionString: migrationRoleConnectionString });
    await migrationClient.connect();

    await ensureIngestWorkerLoginRole(container);
    workerClient = new Client({ connectionString: buildIngestWorkerConnectionString(container) });
    await workerClient.connect();

    await ensureAppLoginRole(container);
    appClient = new Client({ connectionString: buildAppConnectionString(container) });
    await appClient.connect();
  }, 120_000);

  afterAll(async () => {
    await appClient?.end();
    await workerClient?.end();
    await migrationClient?.end();
    await container?.stop();
  });

  describe('A12-11 — der Worker haelt KEIN Tabellen-Grant auf consent.*', () => {
    it('EXECUTE auf die Gate-Funktion gelingt', async () => {
      const zaehlerId = randomUUID();
      // Nicht auflösbar -> false, aber der AUFRUF selbst muss durchgehen
      // (kein "permission denied" auf die Funktion).
      await expect(gateWirksam(workerClient, zaehlerId)).resolves.toBe(false);
    });

    it('direktes SELECT auf consent.einwilligung scheitert mit permission denied', async () => {
      await expect(workerClient.query('SELECT 1 FROM consent.einwilligung LIMIT 1')).rejects.toThrow(
        /permission denied/i,
      );
    });

    it('direktes SELECT auf consent.zweck_subjekt scheitert mit permission denied', async () => {
      await expect(workerClient.query('SELECT 1 FROM consent.zweck_subjekt LIMIT 1')).rejects.toThrow(
        /permission denied/i,
      );
    });

    it('direktes SELECT auf energy.nutzungsverhaeltnis scheitert mit permission denied', async () => {
      await expect(workerClient.query('SELECT 1 FROM energy.nutzungsverhaeltnis LIMIT 1')).rejects.toThrow(
        /permission denied/i,
      );
    });
  });

  describe('C-13 — Szenarien direkt gegen die Funktion', () => {
    async function seedEndkunde(): Promise<string> {
      const id = randomUUID();
      await migrationClient.query(`INSERT INTO energy.endkunde (id) VALUES ($1)`, [id]);
      return id;
    }

    async function seedSystemUndZaehler(endkundeId: string): Promise<{ systemId: string; zaehlerId: string }> {
      const systemId = randomUUID();
      await migrationClient.query(
        `INSERT INTO energy.system (id, endkunde_id, bezeichnung, systemgrenze) VALUES ($1, $2, 'Testsystem', 'gesamtes Gebaeude')`,
        [systemId, endkundeId],
      );
      const zaehlerId = randomUUID();
      await migrationClient.query(
        `INSERT INTO energy.zaehler (id, system_id, geraetetyp, energietraeger) VALUES ($1, $2, 'synthetisch_referenz_v1', 'strom')`,
        [zaehlerId, systemId],
      );
      return { systemId, zaehlerId };
    }

    async function seedAnschlussnutzer(endkundeId: string): Promise<string> {
      const id = randomUUID();
      await migrationClient.query(`INSERT INTO energy.anschlussnutzer (id, endkunde_id) VALUES ($1, $2)`, [
        id,
        endkundeId,
      ]);
      return id;
    }

    async function seedNutzungsverhaeltnis(input: {
      endkundeId: string;
      anschlussnutzerId: string;
      systemId: string;
      gueltigVon: Date;
      gueltigBis?: Date;
      rolle?: string;
    }): Promise<void> {
      await migrationClient.query(
        `INSERT INTO energy.nutzungsverhaeltnis
           (id, endkunde_id, anschlussnutzer_id, system_id, rolle, gueltig_von, gueltig_bis)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          randomUUID(),
          input.endkundeId,
          input.anschlussnutzerId,
          input.systemId,
          input.rolle ?? 'mieter',
          input.gueltigVon,
          input.gueltigBis ?? null,
        ],
      );
    }

    /** Zweck `messdaten_verarbeitung` traegt bereits eine gueltige Textversion (Seed-Daten, docs/consent — hier synthetisch). */
    let textVersionId: string;

    beforeAll(async () => {
      textVersionId = randomUUID();
      const wortlaut = 'Synthetischer Testwortlaut fuer die Integrationstest-Fixture, mindestens zwanzig Zeichen lang.';
      await migrationClient.query(
        `INSERT INTO consent.text_version (id, zweck_code, fassung, wortlaut, wortlaut_sha256, gueltig_ab)
         VALUES ($1, 'messdaten_verarbeitung', '1.0', $2, $3, '2020-01-01T00:00:00Z')`,
        [textVersionId, wortlaut, textVersionSha256(wortlaut)],
      );
    });

    async function seedEinwilligung(input: {
      anschlussnutzerId: string;
      erteiltAt: Date;
      widerrufenAt?: Date;
    }): Promise<string> {
      const id = randomUUID();
      await migrationClient.query(
        `INSERT INTO consent.einwilligung
           (id, subjekt_typ, anschlussnutzer_id, zweck_code, text_version_id, rechtsgrundlage, erteilt_at, widerrufen_at)
         VALUES ($1, 'anschlussnutzer', $2, 'messdaten_verarbeitung', $3, 'einwilligung_art6_1a', $4, $5)`,
        [id, input.anschlussnutzerId, textVersionId, input.erteiltAt, input.widerrufenAt ?? null],
      );
      return id;
    }

    it('Zaehler ohne Nutzungsverhaeltnis -> Endkunde ist Subjekt, vertraglich, IMMER true', async () => {
      const endkundeId = await seedEndkunde();
      const { zaehlerId } = await seedSystemUndZaehler(endkundeId);

      await expect(gateWirksam(workerClient, zaehlerId)).resolves.toBe(true);
    });

    it('nicht aufloesbarer Zaehler -> false (fail-closed)', async () => {
      await expect(gateWirksam(workerClient, randomUUID())).resolves.toBe(false);
    });

    it('GELOESCHTER Endkunde -> false, obwohl die Matrix "vertraglich" fuehrt (C-7)', async () => {
      // Der lit.-b-Zweig besteht kraft VERTRAG, und der endet mit der
      // Loeschung. Bis zur Auflage C-7 gab die Funktion `true` zurueck,
      // sobald die energy.endkunde-Zeile existierte -- also auch fuer
      // jemanden, dessen Daten nach Art. 17 bereits krypto-geschreddert sind.
      // Sie behauptete einen fortbestehenden Vertrag, den sie nie prueft.
      const endkundeId = await seedEndkunde();
      const { zaehlerId } = await seedSystemUndZaehler(endkundeId);
      await expect(gateWirksam(workerClient, zaehlerId)).resolves.toBe(true);

      await migrationClient.query(`UPDATE energy.endkunde SET verarbeitungs_status = 'geloescht' WHERE id = $1`, [
        endkundeId,
      ]);

      await expect(gateWirksam(workerClient, zaehlerId)).resolves.toBe(false);
    });

    it('Art.-18-Sperre lit. b: die am Sperrvorgang getroffene Entscheidung gilt (C-8)', async () => {
      // Art. 18 verbietet die fortgesetzte Neuerhebung bei lit. b nicht --
      // aber sie soll eine Entscheidung sein und keine stille Fortsetzung.
      // Die Datenbank erzwingt deshalb eine Antwort (CHECK in V0087), und
      // das Gate befolgt sie.
      const endkundeId = await seedEndkunde();
      const { zaehlerId } = await seedSystemUndZaehler(endkundeId);

      await migrationClient.query(
        `UPDATE energy.endkunde
            SET verarbeitungs_status = 'gesperrt',
                einschraenkung_grund_code = 'art18_1b_unrechtmaessig',
                gesperrt_seit = now(),
                neuerhebung_fortsetzen = true
          WHERE id = $1`,
        [endkundeId],
      );
      await expect(gateWirksam(workerClient, zaehlerId)).resolves.toBe(true);

      await migrationClient.query(`UPDATE energy.endkunde SET neuerhebung_fortsetzen = false WHERE id = $1`, [
        endkundeId,
      ]);
      await expect(gateWirksam(workerClient, zaehlerId)).resolves.toBe(false);
    });

    it('Art.-18-Sperre lit. a: die Frage stellt sich gar nicht, es wird weiter erhoben (C-8)', async () => {
      // Bei lit. a (Richtigkeit bestritten) und lit. c greift Art. 18 Abs. 2
      // ohne Einzelfallfrage -- die Spalte bleibt leer, und das ist richtig:
      // Eine Frage, die sich nicht stellt, mit einer Antwort zu fuellen macht
      // die Akte unschaerfer, nicht genauer.
      const endkundeId = await seedEndkunde();
      const { zaehlerId } = await seedSystemUndZaehler(endkundeId);

      await migrationClient.query(
        `UPDATE energy.endkunde
            SET verarbeitungs_status = 'gesperrt',
                einschraenkung_grund_code = 'art18_1a_richtigkeit',
                gesperrt_seit = now()
          WHERE id = $1`,
        [endkundeId],
      );

      await expect(gateWirksam(workerClient, zaehlerId)).resolves.toBe(true);
    });

    it('Eigentuemer-Selbstnutzer braucht KEINE Einwilligung, ein Mieter schon (C-11)', async () => {
      // Der Fehler, den C-11 behebt, drueckt in die falsche Richtung: Das Gate
      // blockierte einen rechtmaessigen Zaehler, der Betrieb legte eine
      // Einwilligungszeile an, damit es weitergeht -- und dann stuende eine
      // Rechtsgrundlage in der Akte, die es gar nicht braucht.
      const endkundeId = await seedEndkunde();
      const { systemId, zaehlerId } = await seedSystemUndZaehler(endkundeId);
      const anschlussnutzerId = await seedAnschlussnutzer(endkundeId);

      await seedNutzungsverhaeltnis({
        endkundeId,
        anschlussnutzerId,
        systemId,
        gueltigVon: new Date('2020-01-01T00:00:00Z'),
        rolle: 'mieter',
      });

      // Ein Mieter IST ein Dritter -- ohne Einwilligung keine Rechtsgrundlage.
      await expect(gateWirksam(workerClient, zaehlerId)).resolves.toBe(false);

      await migrationClient.query(
        `UPDATE energy.nutzungsverhaeltnis SET rolle = 'eigentuemer_selbstnutzer' WHERE system_id = $1`,
        [systemId],
      );

      // Der Eigentuemer, der selbst nutzt, ist gegenueber dem Endkunden kein
      // Dritter -- es traegt derselbe Vertrag, ganz ohne Einwilligung.
      await expect(gateWirksam(workerClient, zaehlerId)).resolves.toBe(true);
    });

    it('GESPERRTER Endkunde -> weiterhin true (Art. 18 Abs. 2 nimmt die Speicherung aus, C-7)', async () => {
      // Kein Versehen, sondern die Hausposition aus DSFA-0001 §14.3: Der
      // Ingest-Schreibpfad ist Erhebung und Speicherung. Jede weitergehende
      // Verarbeitung ist ohnehin gesperrt -- der Berechnungslauf ueber den
      // V0023-Trigger, der Nachweis ueber FJ-07b/c. Die Messwerte LIEGEN
      // dann nur.
      const endkundeId = await seedEndkunde();
      const { zaehlerId } = await seedSystemUndZaehler(endkundeId);

      await migrationClient.query(`UPDATE energy.endkunde SET verarbeitungs_status = 'gesperrt' WHERE id = $1`, [
        endkundeId,
      ]);

      await expect(gateWirksam(workerClient, zaehlerId)).resolves.toBe(true);
    });

    it('Anschlussnutzer MIT wirksamer Einwilligung -> true', async () => {
      const endkundeId = await seedEndkunde();
      const { systemId, zaehlerId } = await seedSystemUndZaehler(endkundeId);
      const anschlussnutzerId = await seedAnschlussnutzer(endkundeId);
      await seedNutzungsverhaeltnis({
        endkundeId,
        anschlussnutzerId,
        systemId,
        gueltigVon: new Date('2020-01-01T00:00:00Z'),
      });
      await seedEinwilligung({ anschlussnutzerId, erteiltAt: new Date('2020-06-01T00:00:00Z') });

      await expect(gateWirksam(workerClient, zaehlerId)).resolves.toBe(true);
    });

    it('Anschlussnutzer OHNE jede Einwilligung -> false', async () => {
      const endkundeId = await seedEndkunde();
      const { systemId, zaehlerId } = await seedSystemUndZaehler(endkundeId);
      const anschlussnutzerId = await seedAnschlussnutzer(endkundeId);
      await seedNutzungsverhaeltnis({
        endkundeId,
        anschlussnutzerId,
        systemId,
        gueltigVon: new Date('2020-01-01T00:00:00Z'),
      });
      // Bewusst KEINE Einwilligung fuer diesen Anschlussnutzer angelegt.

      await expect(gateWirksam(workerClient, zaehlerId)).resolves.toBe(false);
    });

    it('WG mit zwei Anschlussnutzern an DERSELBEN Messstelle, EINER widerruft -> false (fail-closed, kein stilles "irgendeiner reicht")', async () => {
      const endkundeId = await seedEndkunde();
      const { systemId, zaehlerId } = await seedSystemUndZaehler(endkundeId);

      const anschlussnutzerA = await seedAnschlussnutzer(endkundeId);
      const anschlussnutzerB = await seedAnschlussnutzer(endkundeId);

      await seedNutzungsverhaeltnis({
        endkundeId,
        anschlussnutzerId: anschlussnutzerA,
        systemId,
        gueltigVon: new Date('2020-01-01T00:00:00Z'),
      });
      await seedNutzungsverhaeltnis({
        endkundeId,
        anschlussnutzerId: anschlussnutzerB,
        systemId,
        gueltigVon: new Date('2020-01-01T00:00:00Z'),
      });

      // A hat eine wirksame Einwilligung ...
      await seedEinwilligung({ anschlussnutzerId: anschlussnutzerA, erteiltAt: new Date('2020-06-01T00:00:00Z') });
      // ... B hat widerrufen.
      await seedEinwilligung({
        anschlussnutzerId: anschlussnutzerB,
        erteiltAt: new Date('2020-06-01T00:00:00Z'),
        widerrufenAt: new Date('2021-01-01T00:00:00Z'),
      });

      // Beweist zugleich, dass `bool_and(EXISTS(korrelierte Unterabfrage))`
      // ueber energy.nutzungsverhaeltnis wie erwartet funktioniert (Auflage
      // C-1, Verifikationsnotiz V0084).
      await expect(gateWirksam(workerClient, zaehlerId)).resolves.toBe(false);
    });

    it('WG, in der EINE Person geloescht ist -> false, statt sie aus der Betrachtung fallen zu lassen (C-7)', async () => {
      // Die Unterscheidung, um die es geht: Der Status-Term steht INNERHALB
      // des `bool_and`, nicht als Filter im WHERE. Wuerde der geloeschte
      // Nutzer herausgefiltert, bliebe nur der aktive uebrig, `bool_and`
      // saehe lauter `true` -- und das Gate liesse die Messung durch, obwohl
      // an derselben Messstelle die Daten einer Person erhoben wuerden, deren
      // Verarbeitung beendet ist. Ein Filter waere hier also nicht bloss
      // ungenau, er kehrte die Wirkung um.
      const endkundeId = await seedEndkunde();
      const { systemId, zaehlerId } = await seedSystemUndZaehler(endkundeId);

      const aktiv = await seedAnschlussnutzer(endkundeId);
      const geloescht = await seedAnschlussnutzer(endkundeId);

      for (const anschlussnutzerId of [aktiv, geloescht]) {
        await seedNutzungsverhaeltnis({
          endkundeId,
          anschlussnutzerId,
          systemId,
          gueltigVon: new Date('2020-01-01T00:00:00Z'),
        });
        await seedEinwilligung({ anschlussnutzerId, erteiltAt: new Date('2020-06-01T00:00:00Z') });
      }

      // Beide haben eine wirksame Einwilligung -- das Gate steht auf true.
      await expect(gateWirksam(workerClient, zaehlerId)).resolves.toBe(true);

      await migrationClient.query(
        `UPDATE energy.anschlussnutzer SET verarbeitungs_status = 'geloescht' WHERE id = $1`,
        [geloescht],
      );

      await expect(gateWirksam(workerClient, zaehlerId)).resolves.toBe(false);
    });

    it('Widerruf GENAU auf der Sekunde: unmittelbar VOR dem Widerruf true, unmittelbar NACH dem Widerruf-Zeitpunkt false (`>`, nicht `>=`, gegen now())', async () => {
      const endkundeId = await seedEndkunde();
      const { systemId, zaehlerId } = await seedSystemUndZaehler(endkundeId);
      const anschlussnutzerId = await seedAnschlussnutzer(endkundeId);
      await seedNutzungsverhaeltnis({
        endkundeId,
        anschlussnutzerId,
        systemId,
        gueltigVon: new Date('2020-01-01T00:00:00Z'),
      });
      const einwilligungId = await seedEinwilligung({
        anschlussnutzerId,
        erteiltAt: new Date('2020-06-01T00:00:00Z'),
      });

      // Vor dem Widerruf: wirksam.
      await expect(gateWirksam(workerClient, zaehlerId)).resolves.toBe(true);

      // Widerruf GENAU auf den Datenbank-Zeitpunkt `now()` gesetzt (nicht
      // einen App-seitig erzeugten `Date`-Wert) — die praezise Grenze, die
      // A12-12 verlangt: die Funktion vergleicht `widerrufen_at > now()`
      // ohne jede Uhren-Differenz zwischen zwei Prozessen.
      await migrationClient.query(`UPDATE consent.einwilligung SET widerrufen_at = now() WHERE id = $1`, [
        einwilligungId,
      ]);

      // Der naechste Aufruf der Funktion (nach dem Widerruf-COMMIT) findet
      // zwangslaeufig ein SPAETERES `now()` vor als der Widerrufszeitpunkt
      // selbst — `widerrufen_at > now()` ist dann false, also NICHT mehr
      // wirksam. Das ist die Grenzsemantik: "widerrufen im Moment X" heisst
      // "nicht mehr gueltig AB X", nicht "noch gueltig bis X".
      await expect(gateWirksam(workerClient, zaehlerId)).resolves.toBe(false);
    });

    it('fehlender Matrix-Eintrag (consent.zweck_subjekt) -> false, statt einer Ausnahme oder eines Nachsicht-Defaults', async () => {
      const endkundeId = await seedEndkunde();
      const { zaehlerId } = await seedSystemUndZaehler(endkundeId);

      await migrationClient.query('BEGIN');
      try {
        // Der Endkunde-Zweig dieses Zaehlers (kein Nutzungsverhaeltnis) haengt
        // an GENAU dieser Matrixzeile — sie wird NUR innerhalb dieser
        // Transaktion entfernt und per ROLLBACK wieder hergestellt.
        await migrationClient.query(
          `DELETE FROM consent.zweck_subjekt WHERE zweck_code = 'messdaten_verarbeitung' AND subjekt_typ = 'endkunde'`,
        );

        // WICHTIG: `workerClient` ist eine ANDERE Verbindung/Transaktion als
        // `migrationClient` — unter Standard-`READ COMMITTED` sieht sie
        // fremde UNCOMMITTED Aenderungen normalerweise NICHT. Diese Abfrage
        // laeuft deshalb ueber `migrationClient` SELBST (dieselbe Rolle darf
        // die Funktion ebenfalls ausfuehren, EXECUTE ist nicht auf
        // `edms_ingest_worker` beschraenkt) -- der SICHERHEITSASPEKT (A12-11)
        // ist bereits in der Beschreibung oben separat bewiesen; hier geht es
        // NUR um die fail-closed-Semantik bei fehlendem Matrix-Eintrag.
        await expect(gateWirksam(migrationClient, zaehlerId)).resolves.toBe(false);
      } finally {
        await migrationClient.query('ROLLBACK');
      }

      // Nach dem Rollback: Matrixzeile wieder da, Funktion wieder true.
      await expect(gateWirksam(workerClient, zaehlerId)).resolves.toBe(true);
    });

    // HIER STAND EIN TEST, DER DAS GEGENTEIL BEHAUPTETE, und er hat seinen
    // Zweck erfuellt.
    //
    // Er hielt fest, dass `verarbeitungs_status` NICHTS am Ergebnis aendert —
    // als bewusste, dokumentierte Scope-Grenze (Widerruf einer Einwilligung
    // sei etwas anderes als eine Art.-17-Loeschung, ADR-0012 B4), und
    // ausdruecklich mit der Begruendung, "DAMIT eine kuenftige Aenderung es
    // nicht unbemerkt verschiebt". Genau das ist eingetreten: Die Aenderung
    // kam, und der Test hat sie gemeldet.
    //
    // Verschoben hat die Grenze nicht Unachtsamkeit, sondern ein Votum.
    // Auflage C-7 (`compliance-director`, 2026-09-16) haelt fest, dass der
    // lit.-b-Zweig kraft VERTRAG besteht und der mit der Loeschung endet —
    // die Funktion behauptete einen fortbestehenden Vertrag, den sie nie
    // geprueft hat. Das neue Verhalten steht jetzt in den beiden Tests
    // "GELOESCHTER Endkunde" und "GESPERRTER Endkunde" weiter oben, samt der
    // Unterscheidung, die dabei zaehlt: `geloescht` blockiert, `gesperrt`
    // nicht (Art. 18 Abs. 2 nimmt die Speicherung aus).
  });

  // ------------------------------------------------------------------
  // Auflage C-10 unter der ECHTEN Anwendungsrolle (V0090).
  //
  // Diese vier Tests existieren wegen eines Befunds aus dem
  // `database-lead`-Review vom 2026-09-17: Die Zaehlung der betroffenen
  // Zaehler stand als SQL in `ConsentRepository` und enumerierte
  // `energy.zaehler`/`energy.system`/`energy.nutzungsverhaeltnis` direkt.
  // `edms_app` hat auf keine dieser Tabellen ein Recht — die Auflage waere
  // am Tag der Umstellung vom Superuser `edms` auf das eigene Rollenmodell
  // ausgefallen, ohne dass ein einziger Test es gemerkt haette. Alle
  // bisherigen Tests laufen naemlich ueber die Superuser-Verbindung und
  // pruefen damit, dass etwas FUNKTIONIERT, nicht dass es ERLAUBT ist.
  // ------------------------------------------------------------------
  describe('C-10 — die Zaehlung laeuft unter edms_app, die Datenbasis bleibt ihr verwehrt', () => {
    it('EXECUTE auf die Zaehlfunktion gelingt', async () => {
      const ergebnis = await appClient.query<{ anzahl: number }>(
        'SELECT consent.zaehle_zaehler_ohne_rechtsgrundlage($1, $2) AS anzahl',
        ['endkunde', randomUUID()],
      );
      // Unbekanntes Subjekt -> 0 betroffene Zaehler. Entscheidend ist hier
      // nicht die Zahl, sondern dass der Aufruf nicht an den Rechten
      // scheitert.
      expect(ergebnis.rows[0]?.anzahl).toBe(0);
    });

    // HIER STAND EIN TEST, DER INZWISCHEN FALSCH IST, und seine Geschichte
    // gehoert festgehalten.
    //
    // Er hielt fest, dass `edms_app` `energy.zaehler` NICHT lesen darf — am
    // 2026-09-17 war das zutreffend und der unmittelbare Grund, aus dem die
    // C-10-Zaehlung in eine SECURITY-DEFINER-Funktion wanderte: Die vorherige
    // Fassung enumerierte die Tabelle direkt und waere unter der Zielrolle
    // mit "permission denied for table zaehler" gescheitert.
    //
    // Seit V0091 hat `edms_app` dort SELECT — und das ist richtig so, nicht
    // etwa eine Aufweichung: Die Fachanwendung MUSS Zaehler lesen koennen,
    // sie verwaltet sie. Der damalige Zustand war kein Schutz, sondern eine
    // Luecke im Rollenmodell, die niemand bemerkt hatte.
    //
    // Was dadurch NICHT hinfaellig wird, ist die Funktion selbst. Ihr
    // tragender Grund ist ein anderer und haltbarerer: `edms_app` darf das
    // GATE nicht aufrufen (V0090). Sie kann Zaehler aufzaehlen, aber die
    // Rechtsgrundlagen-Frage nicht beantworten — und genau die ist die
    // Zaehlung. Der folgende Test haelt das fest.
    it('kann die Zaehlung NICHT selbst nachbauen — das Gate bleibt ihr verwehrt', async () => {
      // Lesen der Zaehler: erlaubt (V0091, die App verwaltet sie).
      await expect(appClient.query('SELECT 1 FROM energy.zaehler LIMIT 1')).resolves.toBeDefined();

      // Die Rechtsgrundlagen-Frage dazu: nicht erlaubt. Damit ist die
      // SECURITY-DEFINER-Funktion der einzige Weg zur Zahl — nicht aus
      // Bequemlichkeit, sondern weil der andere verschlossen ist.
      await expect(
        appClient.query(
          'SELECT count(*) FROM energy.zaehler z WHERE NOT consent.ingest_rechtsgrundlage_wirksam(z.id)',
        ),
      ).rejects.toThrow(/permission denied/i);
    });

    it('das direkte Gate ist der Anwendungsrolle seit V0090 verwehrt', async () => {
      // V0089 hatte `edms_app` EXECUTE auf die Gate-Funktion erteilt, mit
      // der Begruendung, sie duerfe die zugrundeliegenden Daten ohnehin
      // lesen. Fuer `energy.*` stimmte das nicht. V0090 nimmt das Recht
      // zurueck — gebraucht wird es nicht mehr, seit die Zaehlung selbst in
      // der Datenbank sitzt.
      await expect(
        appClient.query('SELECT consent.ingest_rechtsgrundlage_wirksam($1::uuid)', [randomUUID()]),
      ).rejects.toThrow(/permission denied/i);
    });

    it('ein unbekannter Subjekttyp wird laut abgelehnt, nicht still als 0 gezaehlt', async () => {
      // Eine stille 0 landete als "kein Zaehler betroffen" im Audit-Log —
      // eine falsche Aussage ueber die Wirkung eines Betroffenenrechts,
      // ausgeloest von einem Tippfehler.
      await expect(
        appClient.query('SELECT consent.zaehle_zaehler_ohne_rechtsgrundlage($1, $2)', ['tippfehler', randomUUID()]),
      ).rejects.toThrow(/Unbekannter Subjekttyp/i);
    });
  });
});
