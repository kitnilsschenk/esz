import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StammdatenTestApp } from '../stammdaten/test-support/stammdaten-test-app';
import { startStammdatenTestApp, stopStammdatenTestApp } from '../stammdaten/test-support/stammdaten-test-app';
import { sha256Canonical } from './hash.util';

/**
 * Integrationstests (ECHTER Postgres+TimescaleDB-Testcontainer via
 * `startStammdatenTestApp()`/`AppModule`, ALLE `migrations/**`-Dateien
 * dynamisch angewendet inkl. V0019-V0021, KEIN DB-Mock, `.claude/rules/
 * tests.md`) für den Berechnungslauf-Endpoint (ADR-0006 Teil B).
 *
 * `startStammdatenTestApp()` bootet die VOLLSTÄNDIGE `AppModule` — inkl.
 * `BerechnungModule` (jetzt registriert) UND `GoldenVectorBootstrapService`
 * (`OnModuleInit`): ein erfolgreicher `beforeAll()` beweist bereits, dass
 * der Bootstrap-Fail-closed-Check den Golden-Vector-Abgleich gegen die ECHTE
 * DB übersteht (Priorität 6 des Arbeitsauftrags).
 *
 * Testdaten sind ausschließlich synthetisch (F6-Bedingung 2/M6). Klimadaten
 * werden NIE per SQL vorbefüllt — sie entstehen ausschließlich über den
 * `SyntheticKlimaQuelleAdapter`-Auto-Fallback im Service (End-to-End-Beweis
 * für Priorität 7 des Arbeitsauftrags).
 */
describe('Berechnungslauf-Endpoint — Integrationstests (ADR-0006)', () => {
  let testApp: StammdatenTestApp;
  let betriebToken: string;
  let auditorToken: string;
  let adminToken: string;
  let dbClient: Client;

  beforeAll(async () => {
    testApp = await startStammdatenTestApp();
    betriebToken = await testApp.signToken('betrieb-sub', ['betrieb']);
    auditorToken = await testApp.signToken('auditor-sub', ['compliance-auditor']);
    adminToken = await testApp.signToken('admin-sub', ['admin']);

    dbClient = new Client({ connectionString: testApp.container.getConnectionUri() });
    await dbClient.connect();
  }, 120_000);

  afterAll(async () => {
    await dbClient?.end().catch(() => undefined);
    await stopStammdatenTestApp(testApp);
  });

  function idempotencyKey(): string {
    return randomUUID();
  }

  async function legeEndkundeAn(namenSuffix: string): Promise<string> {
    const response = await request(testApp.httpServer)
      .post('/stammdaten/endkunden')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ stammdatenPii: { name: `Testkunde Berechnung ${namenSuffix}`, anschrift: 'Musterstraße 1' } });
    expect(response.status).toBe(201);
    return (response.body as { id: string }).id;
  }

  /** Legt eine Messkonzept-Version MIT genau einem Energieträger (`gas`, baseline_wert/-einheit) an und liefert die `mvet_id` (per SQL, s. Datei-Kopf — die API-Response traegt bewusst KEINE `id` je Energietraeger-Zeile). */
  async function legeMvetAn(
    endkundeId: string,
    input: { readonly baselineWert: number; readonly energietraeger?: string } = { baselineWert: 20000 },
  ): Promise<string> {
    const response = await request(testApp.httpServer)
      .post(`/stammdaten/endkunden/${endkundeId}/messkonzept/versionen`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({
        typ: 'vereinfacht',
        systemgrenze: 'Gebäude Musterhalle',
        systembeschreibung: 'Testsystem',
        bereinigungsverfahren: 'Gradtagzahlverfahren',
        messgeraeteWahl: 'Fernauslesbare Zähler',
        geraeteerkennungsVerfahren: 'Direktmessung',
        energietraeger: [
          {
            energietraeger: input.energietraeger ?? 'gas',
            baselineWert: input.baselineWert,
            baselineEinheit: 'kWh',
          },
        ],
      });
    expect(response.status).toBe(201);

    const row = await dbClient.query(
      `SELECT mvet.id
         FROM energy.messkonzept_version_energietraeger mvet
         JOIN energy.messkonzept_version mv ON mv.id = mvet.messkonzept_version_id
         JOIN energy.messkonzept mk ON mk.id = mv.messkonzept_id
        WHERE mk.endkunde_id = $1
        ORDER BY mvet.created_at DESC
        LIMIT 1`,
      [endkundeId],
    );
    return (row.rows[0] as { id: string }).id;
  }

  function laufBody(
    endkundeId: string,
    mvetId: string,
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      endkundeId,
      mvetId,
      periodeVon: '2027-01-01',
      periodeBis: '2027-02-01',
      grundlastAnteil: 0.2,
      stationRef: `TEST-${randomUUID()}`,
      gtzBaseOverride: 3500,
      ...overrides,
    };
  }

  async function starteLauf(
    body: Record<string, unknown>,
    token: string = betriebToken,
  ): Promise<{ readonly status: number; readonly body: Record<string, unknown> }> {
    const response = await request(testApp.httpServer)
      .post('/berechnung/laeufe')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idempotencyKey())
      .send(body);
    return { status: response.status, body: response.body as Record<string, unknown> };
  }

  describe('Happy Path — voller Lauf', () => {
    it('legt einen Berechnungslauf inkl. Monatsergebnis an, GET liefert dieselben Werte zurueck', async () => {
      const endkundeId = await legeEndkundeAn('Happy');
      const mvetId = await legeMvetAn(endkundeId);

      const { status, body } = await starteLauf(laufBody(endkundeId, mvetId));

      expect(status).toBe(201);
      expect(body).toMatchObject({
        endkundeId,
        mvetId,
        energietraeger: 'gas',
        verfahrenCode: 'witterung_gtz_vdi3807',
        grundlastAnteil: 0.2,
      });
      const ergebnisse = body['ergebnisse'] as { monat: string; referenzKwh: number; gtzIst: number }[];
      expect(ergebnisse).toHaveLength(1);
      expect(new Date(ergebnisse[0]?.monat as string).toISOString().slice(0, 10)).toBe('2027-01-01');
      // Ohne Zaehler/Messwerte ist der Monat vollstaendig "fehlend" -> nicht_ausweisbar,
      // referenzKwh bleibt trotzdem > 0 (die Formel rechnet unabhaengig von der Abdeckung).
      expect(ergebnisse[0]?.referenzKwh).toBeGreaterThan(0);
      expect(body['qualitaetsStufeMin']).toBe('nicht_ausweisbar');

      const laufId = body['id'] as string;
      const getResponse = await request(testApp.httpServer)
        .get(`/berechnung/laeufe/${laufId}`)
        .set('Authorization', `Bearer ${betriebToken}`);
      expect(getResponse.status).toBe(200);
      expect(getResponse.body).toEqual(body);

      // A7 — Retention-Bookkeeping wird beim Lauf-Insert IMMER angelegt.
      const retentionRow = await dbClient.query(
        'SELECT nachweis_gebunden, legal_hold FROM analytics.lauf_retention_status WHERE lauf_id = $1',
        [laufId],
      );
      expect(retentionRow.rowCount).toBe(1);
      expect(retentionRow.rows[0]).toMatchObject({ nachweis_gebunden: false, legal_hold: false });

      // Klimadaten wurden AUTOMATISCH synthetisch nachgefuellt (Prioritaet 7).
      const klimaRows = await dbClient.query(
        "SELECT count(*)::int AS anzahl FROM analytics.klima_tag WHERE quelle = 'synthetic_dev'",
      );
      expect((klimaRows.rows[0] as { anzahl: number }).anzahl).toBeGreaterThan(0);

      // Audit-Nachweis: angefordert + abgeschlossen, kontext.synthetic=true, KEIN Wert-Key.
      // Auf den (pro Test frischen, eindeutigen) Endkunden gescoped — `angefordert`
      // trägt KEINE objekt_ref (die Lauf-ID existiert bei der Emission noch nicht),
      // beide Events aber `kontext.endkunde_id`. Ohne dieses Scoping akkumuliert die
      // append-only `audit.event` über alle Tests der Datei und die exakte
      // Zwei-Zeilen-Erwartung wäre reihenfolgenabhängig (flaky, .claude/rules/tests.md).
      const auditRows = await dbClient.query(
        `SELECT event_typ, ergebnis, objekt_ref, kontext FROM audit.event
          WHERE event_typ LIKE 'berechnungslauf.bereinigung.%' AND kontext->>'endkunde_id' = $1
          ORDER BY seq ASC`,
        [endkundeId],
      );
      expect(auditRows.rows.map((r: { event_typ: string }) => r.event_typ)).toEqual([
        'berechnungslauf.bereinigung.angefordert',
        'berechnungslauf.bereinigung.abgeschlossen',
      ]);
      const abgeschlossenRow = auditRows.rows[1] as { objekt_ref: string; kontext: Record<string, unknown> };
      expect(abgeschlossenRow.objekt_ref).toBe(laufId);
      expect(abgeschlossenRow.kontext['synthetic']).toBe(true);
      expect(Object.keys(abgeschlossenRow.kontext)).not.toContain('baseline_wert_kwh');
    });
  });

  describe('A10 — Sperr-Check', () => {
    it('gesperrter Endkunde -> 409, KEIN Berechnungslauf wird angelegt', async () => {
      const endkundeId = await legeEndkundeAn('Gesperrt');
      const mvetId = await legeMvetAn(endkundeId);

      // Art.-18-Sperre ueber die Aktions-Route mit Pflicht-Grund (ADR-0007
      // A11.1) — vormals `DELETE /stammdaten/endkunden/{id}` ohne Body.
      const sperrResponse = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${endkundeId}/sperren`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        // `neuerhebungFortsetzen` (Auflage C-8): bei lit. b Pflichtangabe.
        // `true` = waehrend der Klaerung wird weiter gemessen — fuer diesen
        // Test irrelevant, er prueft den Sperr-Check des Berechnungslaufs.
        .send({ grund: 'art18_1b_unrechtmaessig', neuerhebungFortsetzen: true });
      expect(sperrResponse.status).toBe(200);

      const { status } = await starteLauf(laufBody(endkundeId, mvetId));
      expect(status).toBe(409);

      const laeufe = await dbClient.query('SELECT count(*)::int AS anzahl FROM analytics.berechnungslauf WHERE endkunde_id = $1', [
        endkundeId,
      ]);
      expect((laeufe.rows[0] as { anzahl: number }).anzahl).toBe(0);
    });
  });

  describe('Snapshot-Dedup (B2, content-addressed)', () => {
    it('zwei Laeufe mit IDENTISCHEN Eingaben (gleicher stationRef) verwenden DENSELBEN klima_snapshot_id', async () => {
      const endkundeId = await legeEndkundeAn('Dedup');
      const mvetId = await legeMvetAn(endkundeId);
      const stationRef = `DEDUP-${randomUUID()}`;

      const erster = await starteLauf(laufBody(endkundeId, mvetId, { stationRef }));
      expect(erster.status).toBe(201);
      const zweiter = await starteLauf(laufBody(endkundeId, mvetId, { stationRef }));
      expect(zweiter.status).toBe(201);

      expect(erster.body['id']).not.toBe(zweiter.body['id']); // append-only: zwei EIGENSTAENDIGE Laeufe

      const snapshotRow = await dbClient.query(
        'SELECT klima_snapshot_id, messwert_snapshot_id FROM analytics.berechnungslauf WHERE id = ANY($1)',
        [[erster.body['id'], zweiter.body['id']]],
      );
      const [a, b] = snapshotRow.rows as { klima_snapshot_id: string; messwert_snapshot_id: string }[];
      expect(a?.klima_snapshot_id).toBe(b?.klima_snapshot_id);
      expect(a?.messwert_snapshot_id).toBe(b?.messwert_snapshot_id);
    });
  });

  describe('Einflussgrößen-Snapshot (ADR-0006 D7/A5/B7, V0027/V0028)', () => {
    async function legeSystemAn(endkundeId: string, bezeichnung: string): Promise<string> {
      const response = await request(testApp.httpServer)
        .post('/stammdaten/systeme')
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ endkundeId, bezeichnung, systemgrenze: 'Gebäude Musterhalle' });
      expect(response.status).toBe(201);
      return (response.body as { id: string }).id;
    }

    /** V0028 hat (bewusst) noch KEINEN eigenen Endpoint — Zuordnung wird direkt per SQL gepflegt (Muster: Test-Fixtures greifen bereits an mehreren Stellen auf SQL zurück, wo kein Endpoint existiert). */
    async function ordneSystemMvetZu(mvetId: string, systemId: string, endkundeId: string): Promise<void> {
      await dbClient.query(
        `INSERT INTO energy.messkonzept_version_energietraeger_system (mvet_id, system_id, endkunde_id) VALUES ($1, $2, $3)`,
        [mvetId, systemId, endkundeId],
      );
    }

    /** Offenes Intervall (`gueltigBisMonat` NICHT gesetzt) ab `gueltigAbMonat` — überlappt damit JEDEN künftigen Lauf-Zeitraum (`daterange(..., NULL)`-Semantik, V0020-EXCLUDE-Muster). */
    async function erfasseEinflussgroesse(
      systemId: string,
      overrides: Record<string, unknown> = {},
    ): Promise<{ readonly status: number; readonly body: Record<string, unknown> }> {
      const response = await request(testApp.httpServer)
        .post(`/stammdaten/systeme/${systemId}/einflussgroessen`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({
          groesseCode: 'personenanzahl',
          wertNum: 3,
          gueltigAbMonat: '2020-01-01',
          betroffenerTyp: 'endkunde',
          quelleTyp: 'endkunde',
          rechtsgrundlage: 'art6_1b',
          ...overrides,
        });
      return { status: response.status, body: response.body as Record<string, unknown> };
    }

    it('KEINE Zuordnung (mvet -> System) -> einflussgroesse_snapshot_id bleibt NULL (Regelfall)', async () => {
      const endkundeId = await legeEndkundeAn('EinflussKeineZuordnung');
      const mvetId = await legeMvetAn(endkundeId);

      const { status, body } = await starteLauf(laufBody(endkundeId, mvetId));
      expect(status).toBe(201);

      const laufRow = await dbClient.query('SELECT einflussgroesse_snapshot_id FROM analytics.berechnungslauf WHERE id = $1', [body['id']]);
      expect(laufRow.rows[0]).toMatchObject({ einflussgroesse_snapshot_id: null });
    });

    it('Zuordnung vorhanden, aber KEINE einfluss.intervall-Zeilen -> einflussgroesse_snapshot_id bleibt NULL', async () => {
      const endkundeId = await legeEndkundeAn('EinflussZuordnungOhneIntervall');
      const mvetId = await legeMvetAn(endkundeId);
      const systemId = await legeSystemAn(endkundeId, 'System ohne Einflussgrößen');
      await ordneSystemMvetZu(mvetId, systemId, endkundeId);

      const { status, body } = await starteLauf(laufBody(endkundeId, mvetId));
      expect(status).toBe(201);

      const laufRow = await dbClient.query('SELECT einflussgroesse_snapshot_id FROM analytics.berechnungslauf WHERE id = $1', [body['id']]);
      expect(laufRow.rows[0]).toMatchObject({ einflussgroesse_snapshot_id: null });
    });

    it('Zuordnung + gültiges Intervall -> Snapshot wird eingefroren, GENAU die sechs Projektionsspalten erreichen analytics (kein Verwaltungsfeld)', async () => {
      const endkundeId = await legeEndkundeAn('EinflussHappy');
      const mvetId = await legeMvetAn(endkundeId);
      const systemId = await legeSystemAn(endkundeId, 'System mit Einflussgrößen');
      await ordneSystemMvetZu(mvetId, systemId, endkundeId);
      const erfasst = await erfasseEinflussgroesse(systemId);
      expect(erfasst.status).toBe(201);

      const { status, body } = await starteLauf(laufBody(endkundeId, mvetId));
      expect(status).toBe(201);

      const laufRow = await dbClient.query('SELECT einflussgroesse_snapshot_id FROM analytics.berechnungslauf WHERE id = $1', [body['id']]);
      const snapshotId = (laufRow.rows[0] as { einflussgroesse_snapshot_id: string | null }).einflussgroesse_snapshot_id;
      expect(snapshotId).not.toBeNull();

      const snapshotRow = await dbClient.query('SELECT art, endkunde_id, zeilen_anzahl FROM analytics.eingang_snapshot WHERE id = $1', [snapshotId]);
      expect(snapshotRow.rows[0]).toMatchObject({ art: 'einflussgroesse', endkunde_id: endkundeId, zeilen_anzahl: 1 });

      const projektionsRow = await dbClient.query(
        'SELECT system_id, groesse_code, wert_num, wert_code, gueltig_ab_monat, gueltig_bis_monat FROM analytics.eingang_einflussgroesse WHERE snapshot_id = $1',
        [snapshotId],
      );
      expect(projektionsRow.rows).toHaveLength(1);
      expect(projektionsRow.rows[0]).toMatchObject({
        system_id: systemId,
        groesse_code: 'personenanzahl',
        wert_code: null,
        gueltig_bis_monat: null,
      });
      expect(Number((projektionsRow.rows[0] as { wert_num: string }).wert_num)).toBe(3);

      // Struktureller DB-Beleg (nicht nur "Code liest die Felder nicht"): die
      // Tabelle SELBST hat KEINE Spalte für betroffener_typ/quelle_typ/
      // rechtsgrundlage/abwaegung_ref/art14_information_at/anlass_code — die
      // Verwaltungsfelder aus `einfluss.intervall` können den Namensraum
      // `analytics` GAR NICHT erreichen, unabhängig von der Anwendungslogik.
      const spalten = await dbClient.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'analytics' AND table_name = 'eingang_einflussgroesse' ORDER BY column_name`,
      );
      const spaltenNamen = spalten.rows.map((r: { column_name: string }) => r.column_name).sort();
      expect(spaltenNamen).toEqual(
        ['gueltig_ab_monat', 'gueltig_bis_monat', 'groesse_code', 'snapshot_id', 'system_id', 'wert_code', 'wert_num'].sort(),
      );
      for (const verbotenesFeld of ['betroffener_typ', 'quelle_typ', 'rechtsgrundlage', 'abwaegung_ref', 'art14_information_at', 'anlass_code', 'endkunde_id']) {
        expect(spaltenNamen).not.toContain(verbotenesFeld);
      }

      // rohdaten_hash — DRITTE Komponente NUR bei vorhandenem Einflussgrößen-Snapshot
      // (Entscheidung (b), s. finale Antwort): direkt gegen die tatsächlich
      // eingefrorenen Snapshot-Hashes DERSELBEN Zeile nachgerechnet, keine
      // Formel-Duplizierung "auf Verdacht".
      const laufMitHashes = await dbClient.query(
        `SELECT bl.rohdaten_hash, mw.inhalt_hash AS messwert_hash, kl.inhalt_hash AS klima_hash, ef.inhalt_hash AS einfluss_hash
           FROM analytics.berechnungslauf bl
           JOIN analytics.eingang_snapshot mw ON mw.id = bl.messwert_snapshot_id
           JOIN analytics.eingang_snapshot kl ON kl.id = bl.klima_snapshot_id
           JOIN analytics.eingang_snapshot ef ON ef.id = bl.einflussgroesse_snapshot_id
          WHERE bl.id = $1`,
        [body['id']],
      );
      const zeile = laufMitHashes.rows[0] as { rohdaten_hash: Buffer; messwert_hash: Buffer; klima_hash: Buffer; einfluss_hash: Buffer };
      const erwarteterRohdatenHash = sha256Canonical([
        zeile.messwert_hash.toString('hex'),
        zeile.klima_hash.toString('hex'),
        zeile.einfluss_hash.toString('hex'),
      ]);
      expect(zeile.rohdaten_hash.equals(erwarteterRohdatenHash)).toBe(true);
    });

    it('Dedup (B2): zwei Laeufe mit IDENTISCHER Systemzuordnung/IDENTISCHEM Intervall im GLEICHEN Zeitraum verwenden DENSELBEN einflussgroesse_snapshot_id', async () => {
      const endkundeId = await legeEndkundeAn('EinflussDedup');
      const mvetId = await legeMvetAn(endkundeId);
      const systemId = await legeSystemAn(endkundeId, 'System Dedup');
      await ordneSystemMvetZu(mvetId, systemId, endkundeId);
      await erfasseEinflussgroesse(systemId);

      const erster = await starteLauf(laufBody(endkundeId, mvetId));
      expect(erster.status).toBe(201);
      const zweiter = await starteLauf(laufBody(endkundeId, mvetId));
      expect(zweiter.status).toBe(201);
      expect(erster.body['id']).not.toBe(zweiter.body['id']);

      const rows = await dbClient.query('SELECT einflussgroesse_snapshot_id FROM analytics.berechnungslauf WHERE id = ANY($1)', [
        [erster.body['id'], zweiter.body['id']],
      ]);
      const [a, b] = rows.rows as { einflussgroesse_snapshot_id: string | null }[];
      expect(a?.einflussgroesse_snapshot_id).not.toBeNull();
      expect(a?.einflussgroesse_snapshot_id).toBe(b?.einflussgroesse_snapshot_id);

      // Dedup wirkt auch auf der Detail-Tabelle: EINE Snapshot-Zeile, nicht zwei.
      const detailRows = await dbClient.query('SELECT count(*)::int AS anzahl FROM analytics.eingang_einflussgroesse WHERE snapshot_id = $1', [
        a?.einflussgroesse_snapshot_id,
      ]);
      expect((detailRows.rows[0] as { anzahl: number }).anzahl).toBe(1);
    });
  });

  describe('Append-only-Nachweis (edms_app-DB-Rolle, 42501)', () => {
    it('UPDATE/DELETE auf analytics.berechnungslauf schlaegt fuer edms_app fehl', async () => {
      const endkundeId = await legeEndkundeAn('AppendOnly');
      const mvetId = await legeMvetAn(endkundeId);
      const { status, body } = await starteLauf(laufBody(endkundeId, mvetId));
      expect(status).toBe(201);
      const laufId = body['id'] as string;

      const appClient = new Client({ connectionString: testApp.container.getConnectionUri() });
      await appClient.connect();
      try {
        await appClient.query('SET ROLE edms_app');

        await expect(
          appClient.query("UPDATE analytics.berechnungslauf SET ausloeser = 'job' WHERE id = $1", [laufId]),
        ).rejects.toMatchObject({ code: '42501' });

        await expect(appClient.query('DELETE FROM analytics.berechnungslauf WHERE id = $1', [laufId])).rejects.toMatchObject({
          code: '42501',
        });
      } finally {
        await appClient.query('RESET ROLE').catch(() => undefined);
        await appClient.end();
      }
    });
  });

  describe('ABAC-Matrix', () => {
    it('anonym (kein Token) -> 401 (POST + GET)', async () => {
      const postResponse = await request(testApp.httpServer)
        .post('/berechnung/laeufe')
        .set('Idempotency-Key', idempotencyKey())
        .send(laufBody(randomUUID(), randomUUID()));
      expect(postResponse.status).toBe(401);

      const getResponse = await request(testApp.httpServer).get(`/berechnung/laeufe/${randomUUID()}`);
      expect(getResponse.status).toBe(401);
    });

    it('admin -> 403 (admin ist KEINE Betriebs-/Auswerte-Rolle)', async () => {
      const endkundeId = await legeEndkundeAn('ABACAdmin');
      const mvetId = await legeMvetAn(endkundeId);

      const { status } = await starteLauf(laufBody(endkundeId, mvetId), adminToken);
      expect(status).toBe(403);
    });

    it('compliance-auditor -> 403 auf POST (create:berechnungslauf ist KEINE Lese-Aktion)', async () => {
      const endkundeId = await legeEndkundeAn('ABACAuditorCreate');
      const mvetId = await legeMvetAn(endkundeId);

      const { status } = await starteLauf(laufBody(endkundeId, mvetId), auditorToken);
      expect(status).toBe(403);
    });

    it('compliance-auditor -> 200 auf GET (reine Lese-Aktion, analog read:standort)', async () => {
      const endkundeId = await legeEndkundeAn('ABACAuditorRead');
      const mvetId = await legeMvetAn(endkundeId);
      const { status: postStatus, body } = await starteLauf(laufBody(endkundeId, mvetId));
      expect(postStatus).toBe(201);

      const response = await request(testApp.httpServer)
        .get(`/berechnung/laeufe/${body['id'] as string}`)
        .set('Authorization', `Bearer ${auditorToken}`);
      expect(response.status).toBe(200);
    });
  });

  describe('Liste je Endkunde (GET /berechnung/endkunden/{id}/laeufe)', () => {
    async function liste(
      endkundeId: string,
      query: string = '',
      token: string = betriebToken,
    ): Promise<{ readonly status: number; readonly body: Record<string, unknown> }> {
      const response = await request(testApp.httpServer)
        .get(`/berechnung/endkunden/${endkundeId}/laeufe${query}`)
        .set('Authorization', `Bearer ${token}`);
      return { status: response.status, body: response.body as Record<string, unknown> };
    }

    it('listet die Laeufe eines Endkunden PII-frei (ohne Monatszeilen)', async () => {
      const endkundeId = await legeEndkundeAn('Liste');
      const mvetId = await legeMvetAn(endkundeId);
      await starteLauf(laufBody(endkundeId, mvetId, { periodeVon: '2027-01-01', periodeBis: '2027-02-01' }));
      await starteLauf(laufBody(endkundeId, mvetId, { periodeVon: '2027-02-01', periodeBis: '2027-03-01' }));

      const { status, body } = await liste(endkundeId);
      expect(status).toBe(200);
      const daten = body['daten'] as Record<string, unknown>[];
      expect(daten).toHaveLength(2);
      // PII-frei + reine Zusammenfassung: keine Monatszeilen, keine Baseline-/Wert-Felder.
      expect(daten[0]).not.toHaveProperty('ergebnisse');
      expect(daten[0]).not.toHaveProperty('baselineWertKwh');
      expect(daten[0]).not.toHaveProperty('endkundeId');
      expect(daten[0]).toHaveProperty('qualitaetsStufeMin');
      expect((body['seite'] as { naechsterCursor: string | null }).naechsterCursor).toBeNull();
    });

    it('paginiert per Cursor (limit=1 liefert Cursor, Folgeseite den Rest)', async () => {
      const endkundeId = await legeEndkundeAn('ListePage');
      const mvetId = await legeMvetAn(endkundeId);
      await starteLauf(laufBody(endkundeId, mvetId, { periodeVon: '2027-01-01', periodeBis: '2027-02-01' }));
      await starteLauf(laufBody(endkundeId, mvetId, { periodeVon: '2027-02-01', periodeBis: '2027-03-01' }));

      const seite1 = await liste(endkundeId, '?limit=1');
      expect((seite1.body['daten'] as unknown[]).length).toBe(1);
      const cursor = (seite1.body['seite'] as { naechsterCursor: string | null }).naechsterCursor;
      expect(cursor).not.toBeNull();

      const seite2 = await liste(endkundeId, `?limit=1&cursor=${encodeURIComponent(cursor as string)}`);
      expect((seite2.body['daten'] as unknown[]).length).toBe(1);
      const id1 = (seite1.body['daten'] as { id: string }[])[0]?.id;
      const id2 = (seite2.body['daten'] as { id: string }[])[0]?.id;
      expect(id1).not.toBe(id2);
    });

    it('liefert 404 fuer einen nicht existierenden Endkunden', async () => {
      const { status } = await liste(randomUUID());
      expect(status).toBe(404);
    });

    it('compliance-auditor darf die Liste lesen (read:berechnungslauf)', async () => {
      const endkundeId = await legeEndkundeAn('ListeAuditor');
      const mvetId = await legeMvetAn(endkundeId);
      await starteLauf(laufBody(endkundeId, mvetId));

      const { status } = await liste(endkundeId, '', auditorToken);
      expect(status).toBe(200);
    });
  });

  describe('Validierung', () => {
    it('mvetId gehoert zu einem ANDEREN Endkunden als der Request -> 400', async () => {
      const endkundeA = await legeEndkundeAn('ValidierungA');
      const endkundeB = await legeEndkundeAn('ValidierungB');
      const mvetVonA = await legeMvetAn(endkundeA);

      const { status } = await starteLauf(laufBody(endkundeB, mvetVonA));
      expect(status).toBe(400);
    });

    it('baseline_einheit != kWh -> 400 (fail-closed, keine stille Umrechnung)', async () => {
      const endkundeId = await legeEndkundeAn('ValidierungEinheit');
      const response = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${endkundeId}/messkonzept/versionen`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({
          typ: 'vereinfacht',
          systemgrenze: 'Gebäude',
          systembeschreibung: 'Test',
          bereinigungsverfahren: 'Gradtagzahlverfahren',
          messgeraeteWahl: 'Fernauslesbare Zähler',
          geraeteerkennungsVerfahren: 'Direktmessung',
          energietraeger: [{ energietraeger: 'gas', baselineWert: 2000, baselineEinheit: 'MWh' }],
        });
      expect(response.status).toBe(201);
      const mvetRow = await dbClient.query(
        `SELECT mvet.id FROM energy.messkonzept_version_energietraeger mvet
           JOIN energy.messkonzept_version mv ON mv.id = mvet.messkonzept_version_id
           JOIN energy.messkonzept mk ON mk.id = mv.messkonzept_id
          WHERE mk.endkunde_id = $1`,
        [endkundeId],
      );
      const mvetId = (mvetRow.rows[0] as { id: string }).id;

      const { status } = await starteLauf(laufBody(endkundeId, mvetId));
      expect(status).toBe(400);
    });

    it('g<1 OHNE Baseline-Periode UND OHNE gtzBaseOverride -> 400 (GTZ_base nicht ermittelbar)', async () => {
      const endkundeId = await legeEndkundeAn('ValidierungGtzBase');
      const mvetId = await legeMvetAn(endkundeId);

      const { status } = await starteLauf(laufBody(endkundeId, mvetId, { gtzBaseOverride: undefined }));
      expect(status).toBe(400);
    });

    it('g=1 (reiner Grundlast-Verbraucher) funktioniert OHNE Baseline-Periode/gtzBaseOverride', async () => {
      const endkundeId = await legeEndkundeAn('ValidierungG1');
      const mvetId = await legeMvetAn(endkundeId, { baselineWert: 3000, energietraeger: 'strom' });

      const { status, body } = await starteLauf(
        laufBody(endkundeId, mvetId, { grundlastAnteil: 1, gtzBaseOverride: undefined }),
      );
      expect(status).toBe(201);
      const ergebnisse = body['ergebnisse'] as { referenzKwh: number }[];
      expect(ergebnisse[0]?.referenzKwh).toBeCloseTo(3000 * (31 / 365.25), 3);
    });

    it('nimmt eine Periode an, die MITTEN im Monat beginnt — und rechnet den Randmonat anteilig', async () => {
      // Frueher ein 400 ("v1-Einschraenkung: Monatsanfaenge"). Ein Foerderjahr
      // stammt aber aus dem Bewilligungsbescheid und beginnt selten am Ersten;
      // Kap. 9.1 des Technischen Merkblatts v2.2 verlangt ausdruecklich die
      // zeitanteilige Ermittlung. Der angeschnittene Januar (15.-31., 17 Tage)
      // muss deshalb 17/365,25 der Jahres-Baseline tragen, nicht 31/365,25.
      const endkundeId = await legeEndkundeAn('TaggenauerBeginn');
      const mvetId = await legeMvetAn(endkundeId);

      const { status, body } = await starteLauf(
        laufBody(endkundeId, mvetId, {
          periodeVon: '2027-01-15',
          periodeBis: '2027-02-01',
          grundlastAnteil: 1,
          gtzBaseOverride: undefined,
        }),
      );

      expect(status).toBe(201);
      const ergebnisse = body['ergebnisse'] as { monat: string; referenzKwh: number; tageGesamt: number }[];
      expect(ergebnisse).toHaveLength(1);
      // Die Zeile heisst weiterhin nach dem Monatsersten — das ist ihre
      // Kennung in `analytics.laufergebnis`, nicht ihr erster Tag.
      expect(ergebnisse[0]?.monat).toBe('2027-01-01');
      expect(ergebnisse[0]?.tageGesamt).toBe(17);
      // Baseline 20 000 kWh/a (Default in `legeMvetAn`), reine Grundlast:
      // 17 von 365,25 Tagen — nicht 31.
      expect(ergebnisse[0]?.referenzKwh).toBeCloseTo(20000 * (17 / 365.25), 3);
    });

    it('lehnt ab (400), wenn periodeVon nicht VOR periodeBis liegt', async () => {
      const endkundeId = await legeEndkundeAn('ValidierungReihenfolge');
      const mvetId = await legeMvetAn(endkundeId);

      const { status } = await starteLauf(
        laufBody(endkundeId, mvetId, { periodeVon: '2027-02-01', periodeBis: '2027-02-01' }),
      );
      expect(status).toBe(400);
    });

    it('lehnt ab (404), wenn die Endkunde-ID nicht existiert', async () => {
      const { status } = await starteLauf(laufBody(randomUUID(), randomUUID()));
      expect(status).toBe(404);
    });

    // M1 (security-auditor, Phase 5) — Resource-Exhaustion-Schutz.
    it('lehnt eine Periode > 120 Monate ab (400, M1 Ressourcenschutz)', async () => {
      const endkundeId = await legeEndkundeAn('ValidierungSpanne');
      const mvetId = await legeMvetAn(endkundeId);

      // 2016-01 .. 2027-02 = 133 Monate > MAX_LAUF_MONATE (120).
      const { status } = await starteLauf(
        laufBody(endkundeId, mvetId, { periodeVon: '2016-01-01', periodeBis: '2027-02-01' }),
      );
      expect(status).toBe(400);
    });

    // M2 (security-auditor, Phase 5) — stationRef-Whitelist gegen Path-/URL-Injection.
    it('lehnt einen stationRef mit unerlaubten Zeichen ab (400, M2)', async () => {
      const endkundeId = await legeEndkundeAn('ValidierungStationRef');
      const mvetId = await legeMvetAn(endkundeId);

      const { status } = await starteLauf(
        laufBody(endkundeId, mvetId, { stationRef: '../../etc/passwd' }),
      );
      expect(status).toBe(400);
    });
  });
});
