import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import request from 'supertest';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { startTestPostgres } from '../health/test-support/testcontainer-postgres';
import { migrateTestPostgres } from '../stammdaten/test-support/migrate-test-postgres';
import { startStammdatenTestApp, stopStammdatenTestApp } from '../stammdaten/test-support/stammdaten-test-app';
import type { StammdatenTestApp } from '../stammdaten/test-support/stammdaten-test-app';
import { startTestMosquitto, stopTestMosquitto } from '../ingest-worker/test-support/testcontainer-mosquitto';
import type { StartedTestMosquitto } from '../ingest-worker/test-support/testcontainer-mosquitto';
import {
  buildIngestWorkerConnectionString,
  ensureIngestWorkerLoginRole,
} from '../ingest-worker/test-support/ingest-worker-role.test-support';
import { SYNTHETISCH_REFERENZ_V1_GERAETETYP } from '../ingest-worker/decoder/synthetisch-referenz-v1.decoder';
import { startIngestWorkerTestApp, stopIngestWorkerTestApp } from '../ingest-worker/test-support/ingest-worker-test-app';
import type { IngestWorkerTestApp } from '../ingest-worker/test-support/ingest-worker-test-app';
import { SyntheticUplinkPublisherService } from '../ingest-worker/synthetic-publisher/synthetic-uplink-publisher.service';
import { SyntheticOnlyConfigService } from '../stammdaten/synthetic/synthetic-only.config';
import { buildSyntheticUplink } from '../ingest-worker/synthetic-publisher/synthetic-uplink-fixture';
import { IngestFlowService } from '../ingest-worker/ingest-flow/ingest-flow.service';
import {
  berechnungslaufBody,
  betriebSecurityContext,
  idempotencyKey,
  legeEndkundeAn,
  legeMvetAn,
  legeSystemAn,
  mitTransaktion,
  starteBerechnungslauf,
  verknuepfeMvetMitSystem,
} from '../nachweis/test-support/nachweis-test-fixtures';
import { PreflightService } from '../nachweis/preflight.service';
import { EinsparlaufService } from '../nachweis/einsparlauf.service';
import { fensterAusMonaten, NachweisFoerderjahrRepository } from '../nachweis/persistence/nachweis-foerderjahr.repository';

/**
 * Seit der A-1-Freigabe (2026-09-09) ohne Modul-Mock: `FJ-08` feuert nicht
 * mehr, weil der DWD-Quellenvermerk kein Platzhalter mehr ist.
 */

/**
 * **Die Kette von der Nachricht bis zum Nachweis.**
 *
 * Jedes Modul dieser Plattform hat eigene Integrationstests — und genau das
 * war die Lücke: Jede Suite legt ihre Ausgangslage mit eigenen Fixtures an,
 * meist per direktem SQL. Der Ist-Verbrauch eines Berechnungslaufs wurde so
 * immer gegen Messwerte geprüft, die der Test selbst in die Tabelle
 * geschrieben hatte, nie gegen welche, die durch den Ingest gekommen sind.
 * Ein Bruch AN den Modulgrenzen — ein Kanal, den der Ingest anders auflöst
 * als die Berechnung ihn sucht; eine Untermessung, die der eine Pfad
 * ausschließt und der andere nicht; ein Zeitstempel, den der Nachlauf
 * verwirft — bleibt in getrennten Suiten unsichtbar.
 *
 * Dieser Test lässt EINEN Endkunden durch die vollständige Kette laufen:
 *
 *   Gerät provisioniert → Messkonzept + Systemgrenze → Gerätegruppen-Zuordnung
 *   → MQTT-Uplink über einen echten Broker → Nachlauf eines ganzen Monats
 *   → gespeicherte Messwerte → Verbrauchsanzeige → Berechnungslauf
 *   → Monatsbericht → Nachweis-Export
 *
 * und prüft an JEDEM Übergang dieselbe Zahl. Die Zahl ist nachrechenbar und
 * nicht „was herauskommt": 31 Januartage à 100 kWh = 3100 kWh.
 *
 * Infrastruktur: EIN Postgres-Container für BEIDE Anwendungen (HTTP-App und
 * Ingest-Worker) plus ein echter Mosquitto — kein Mock an keiner Stelle der
 * Kette.
 */
describe('Energiekette Ende-zu-Ende: MQTT → Messwert → Verbrauch → Einsparung → Monatsbericht → Nachweis', () => {
  let pgContainer: StartedPostgreSqlContainer;
  let mosquitto: StartedTestMosquitto;
  let workerApp: IngestWorkerTestApp;
  let testApp: StammdatenTestApp;
  let dbClient: Client;
  let betriebToken: string;
  let publisher: SyntheticUplinkPublisherService;
  let ingestFlow: IngestFlowService;

  /** 31 Januartage à 100 kWh — die Zahl, die durch die ganze Kette laufen muss. */
  const KWH_PRO_TAG = 100;
  const TAGE_IM_JANUAR = 31;
  const ERWARTETER_IST_VERBRAUCH = TAGE_IM_JANUAR * KWH_PRO_TAG;

  beforeAll(async () => {
    // Dev-Schluesselmaterial NUR aus der Umgebung, pro Testlauf zufaellig
    // (ADR-0008 §19 / ADR-0005 §26.3). Beide Anwendungen konstruieren ihre
    // Krypto-Dienste beim Bootstrap eager — fehlt der Wert, bricht Nest schon
    // in der Initialisierung ab.
    process.env['EDMS_DEV_KMS_MASTER_KEY'] ??= randomBytes(32).toString('base64');
    process.env['EDMS_DEV_BLIND_INDEX_PEPPER'] ??= randomBytes(32).toString('hex');

    pgContainer = await startTestPostgres();
    await migrateTestPostgres(pgContainer);
    await ensureIngestWorkerLoginRole(pgContainer);

    mosquitto = await startTestMosquitto();
    process.env['EDMS_INGEST_DATABASE_URL'] = buildIngestWorkerConnectionString(pgContainer);
    process.env['EDMS_INGEST_MQTT_URL'] = mosquitto.url;
    process.env['EDMS_SYNTHETIC_PUBLISHER_MQTT_URL'] = mosquitto.url;

    workerApp = await startIngestWorkerTestApp();
    ingestFlow = workerApp.app.get(IngestFlowService);

    // Der Publisher gehoert NICHT zum Worker-Objektgraphen (er ist die
    // Gegenseite) — er wird wie im bestehenden Ingest-E2E direkt konstruiert.
    publisher = new SyntheticUplinkPublisherService(new SyntheticOnlyConfigService());
    await publisher.connect();

    // DIESELBE Datenbank wie der Worker — sonst prüfte der Test zwei
    // Weltbilder gegeneinander statt einer Kette.
    testApp = await startStammdatenTestApp({ container: pgContainer });
    betriebToken = await testApp.signToken('betrieb-kette', ['betrieb']);

    dbClient = new Client({ connectionString: pgContainer.getConnectionUri() });
    await dbClient.connect();
  }, 240_000);

  afterAll(async () => {
    // Defensiv: schlaegt der Aufbau in der Mitte fehl, sind die spaeteren
    // Handles undefined — der Abbau darf daran nicht ein zweites Mal
    // scheitern und die eigentliche Ursache verdecken.
    await dbClient?.end().catch(() => undefined);
    await publisher?.disconnect().catch(() => undefined);
    if (testApp !== undefined) {
      await stopStammdatenTestApp(testApp).catch(() => undefined);
    }
    if (workerApp !== undefined) {
      await stopIngestWorkerTestApp(workerApp).catch(() => undefined);
    }
    if (mosquitto !== undefined) {
      await stopTestMosquitto(mosquitto).catch(() => undefined);
    }
    await pgContainer?.stop().catch(() => undefined);
  }, 60_000);

  async function pollUntil<T>(check: () => Promise<T | undefined>, timeoutMs = 20_000): Promise<T> {
    const start = Date.now();
    for (;;) {
      const ergebnis = await check();
      if (ergebnis !== undefined) {
        return ergebnis;
      }
      if (Date.now() - start > timeoutMs) {
        throw new Error('pollUntil: Zeitlimit ueberschritten, Bedingung nie erfuellt.');
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  async function anzahlMesswerte(messkanalKey: number): Promise<number> {
    const zeilen = await dbClient.query<{ anzahl: string }>(
      'SELECT count(*)::text AS anzahl FROM measurement.messwert WHERE messkanal_key = $1',
      [messkanalKey],
    );
    return Number.parseInt(zeilen.rows[0]?.anzahl ?? '0', 10);
  }

  it('trägt dieselbe, nachrechenbare Zahl durch alle Module — 3100 kWh von der MQTT-Nachricht bis in den Nachweis-Export', async () => {
    // FESTES, VERGANGENES Jahr — nicht `neuesTestJahr()`. Dessen Zaehler
    // beginnt bei 2030, also in der Zukunft; der Nachlauf lehnt kuenftige
    // Zeitstempel zu Recht ab (ein Messwert von morgen fuellte einen Monat,
    // den es noch nicht gab). Kollisionsfrei ist das trotzdem: Jede
    // Spec-Datei bekommt einen eigenen Container, und in dieser Datei laeuft
    // genau ein Test.
    const jahr = 2022;
    const januar = `${String(jahr)}-01-01`;

    // ---- 1. Kunde, System, Zähler, Messkanal — ueber die API, wie ein
    //         Bediener sie anlegt (kein SQL-Fixture, das Luecken verdecken
    //         koennte: die PII-Zeile des Endkunden entsteht nur hier). ----
    const endkundeId = await legeEndkundeAn(testApp, betriebToken, `Kette-${randomUUID().slice(0, 8)}`);
    const systemId = await legeSystemAn(testApp, betriebToken, endkundeId, 'Musterhalle');

    const zaehler = await request(testApp.httpServer)
      .post('/stammdaten/zaehler')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ systemId, geraetetyp: SYNTHETISCH_REFERENZ_V1_GERAETETYP, energietraeger: 'strom' });
    expect(zaehler.status, JSON.stringify(zaehler.body)).toBe(201);
    const zaehlerId = (zaehler.body as { id: string }).id;

    const messkanal = await request(testApp.httpServer)
      .post(`/stammdaten/zaehler/${zaehlerId}/messkanaele`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ messgroesse: 'wirkarbeit', einheit: 'kWh', art: 'kumulativ_zaehlerstand' });
    expect(messkanal.status, JSON.stringify(messkanal.body)).toBe(201);
    const messkanalId = (messkanal.body as { id: string }).id;
    const kanalKeyZeile = await dbClient.query<{ kanal_key: number }>(
      'SELECT kanal_key FROM energy.messkanal WHERE id = $1',
      [messkanalId],
    );
    const messkanalKey = kanalKeyZeile.rows[0]!.kanal_key;

    // Die DevEUI-Zuordnung ist der Uebergang von der Stammdatenwelt in die
    // Messwelt: Ohne sie loest der Ingest den Uplink nicht auf.
    const devEui = 'AA-AA-AA-AA-AA-AA-CE-01';
    const geraetZuordnung = await request(testApp.httpServer)
      .post(`/stammdaten/zaehler/${zaehlerId}/geraet-zuordnungen`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ devEui });
    expect(geraetZuordnung.status, JSON.stringify(geraetZuordnung.body)).toBe(201);

    // ---- 2. Messkonzept + Systemgrenze (V0028) ----
    const mvetId = await legeMvetAn(testApp, betriebToken, dbClient, endkundeId, {
      baselineWert: 20_000,
      energietraeger: 'strom',
    });
    await verknuepfeMvetMitSystem(dbClient, mvetId, systemId);

    // ---- 3. Gerätezuordnung (TB-05): der Kanal gehört zu einer Gerätegruppe ----
    const gruppe = await request(testApp.httpServer)
      .post('/geraeteerkennung/gruppen')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ endkundeId: endkundeId, bezeichnung: 'Heizung' });
    expect(gruppe.status).toBe(201);

    const zuordnung = await request(testApp.httpServer)
      .post('/geraeteerkennung/zuordnungen')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({
        geraetegruppeId: (gruppe.body as { id: string }).id,
        messkanalId: messkanalId,
        methode: 'direktmessung',
        gueltigVon: januar,
      });
    expect(zuordnung.status).toBe(201);

    // ---- 4. Standort + Verortung (Voraussetzung der Verbrauchsanzeige) ----
    const standort = await request(testApp.httpServer)
      .post(`/stammdaten/endkunden/${endkundeId}/standorte`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ typ: 'liegenschaft', bezeichnung: 'Musterhalle', adresse: 'Teststrasse 1' });
    expect(standort.status, JSON.stringify(standort.body)).toBe(201);
    const standortId = (standort.body as { id: string }).id;

    const verortung = await request(testApp.httpServer)
      .post(`/stammdaten/zaehler/${zaehlerId}/verortung`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ standortId, gueltigVon: `${String(jahr - 1)}-01-01` });
    expect(verortung.status).toBe(201);

    // ---- 5. Nachlauf eines ganzen Monats durch den ECHTEN Ingest-Flow ----
    // 32 Zählerstände vom 31.12. bis zum 31.01., je 100 kWh Zuwachs. Der
    // Stand vom 31.12. ist der Vorwert des 1. Januar — ohne ihn hätte der
    // erste Monatstag keine Differenz und fiele aus der Rechnung.
    //
    // Der Weg ist bewusst der Nachlauf und nicht ein SQL-INSERT: Genau hier
    // sitzen die Übergänge, die getrennte Fixtures verdecken — DevEUI-
    // Auflösung, Kanalsuche über Messgröße/Einheit, Monotonie, Idempotenz.
    for (let tag = 0; tag < 32; tag += 1) {
      const zeitpunkt = new Date(Date.UTC(jahr - 1, 11, 31 + tag, 6, 0, 0)).toISOString();
      const uplink = buildSyntheticUplink({
        devEui: devEui,
        wertRoh: (tag + 1) * KWH_PRO_TAG,
        deviceTimestampIso: zeitpunkt,
      });
      await ingestFlow.verarbeiteUplink({
        topicRedacted: 'nachlauf/kette',
        payload: uplink.payload,
        herkunft: 'backfill',
      });
    }

    // Nichts darf in der Quarantäne gelandet sein — ein stiller Verlust hier
    // wäre im Ergebnis nur als "etwas weniger Verbrauch" sichtbar.
    const quarantaene = await dbClient.query<{ anzahl: string; grund: string | null }>(
      'SELECT count(*)::text AS anzahl, max(grund) AS grund FROM ingest.eingang_quarantaene',
    );
    expect(quarantaene.rows[0]?.anzahl, `Quarantaenegrund: ${String(quarantaene.rows[0]?.grund)}`).toBe('0');
    expect(await anzahlMesswerte(messkanalKey)).toBe(32);

    // ---- 6. Live-Uplink über den ECHTEN Broker (Mosquitto) ----
    // Beweist die Strecke Publisher → MQTT → Worker → Datenbank. Der
    // Zeitpunkt liegt in der Gegenwart und damit AUSSERHALB der Januar-
    // Periode: Er darf den Monatswert nicht verändern.
    const liveTs = new Date().toISOString();
    await publisher.publishUplink({
      devEui: devEui,
      wertRoh: 99_999,
      deviceTimestampIso: liveTs,
    });
    await pollUntil(async () => {
      const anzahl = await anzahlMesswerte(messkanalKey);
      return anzahl === 33 ? anzahl : undefined;
    });

    // ---- 7. Verbrauchsanzeige: 31 × 100 kWh ----
    const verbrauch = await request(testApp.httpServer)
      .get(`/messwerte/standorte/${standortId}/verbrauch`)
      .query({ von: `${januar}T00:00:00.000Z`, bis: `${String(jahr)}-02-01T00:00:00.000Z`, aufloesung: 'monat' })
      .set('Authorization', `Bearer ${betriebToken}`);
    expect(verbrauch.status).toBe(200);
    const verbrauchKoerper = verbrauch.body as { zeitreihe: { messgroesse: string; einheit: string; wert: number }[] };
    const zeitreihe = verbrauchKoerper.zeitreihe;
    expect(zeitreihe).toHaveLength(1);
    expect(zeitreihe[0]?.einheit).toBe('kWh');
    expect(zeitreihe[0]?.wert).toBeCloseTo(ERWARTETER_IST_VERBRAUCH, 3);

    // ---- 8. Berechnungslauf: derselbe Ist-Verbrauch ----
    const lauf = await starteBerechnungslauf(testApp, betriebToken, berechnungslaufBody(endkundeId, mvetId, jahr));
    expect(lauf.status).toBe(201);
    const laufId = lauf.body['id'] as string;

    const laufZeile = await dbClient.query<{ ist_kwh: string; referenz_kwh: string; tage_fehlend: number }>(
      'SELECT ist_kwh, referenz_kwh, tage_fehlend FROM analytics.laufergebnis WHERE lauf_id = $1 AND monat = $2::date',
      [laufId, januar],
    );
    expect(laufZeile.rows).toHaveLength(1);
    const istKwh = Number.parseFloat(laufZeile.rows[0]!.ist_kwh);
    expect(istKwh).toBeCloseTo(ERWARTETER_IST_VERBRAUCH, 3);
    // Lückenlos: jeder Januartag hat seinen Wert aus dem Nachlauf.
    expect(laufZeile.rows[0]!.tage_fehlend).toBe(0);

    // Die Systemgrenze wurde über die V0028-Zuordnung aufgelöst, nicht über
    // den kundenweiten Fallback.
    const auditQuelle = await dbClient.query<{ kontext: Record<string, unknown> }>(
      `SELECT kontext FROM audit.event WHERE objekt_ref = $1 AND kontext ? 'systemgrenze_quelle'`,
      [laufId],
    );
    expect(auditQuelle.rows[0]?.kontext['systemgrenze_quelle']).toBe('mvet_system');

    // ---- 9. Monatsbericht: dieselbe Zahl wie der Lauf ----
    const nutzerinfoLauf = await request(testApp.httpServer)
      .post('/nutzerinfo/laeufe')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      // `ausfuehren` hat bewusst keinen Default — ohne das Flag bleibt es ein
      // Probelauf, der nur zaehlt.
      .send({ monat: januar, ausfuehren: true });
    expect(nutzerinfoLauf.status, JSON.stringify(nutzerinfoLauf.body)).toBe(200);
    expect(nutzerinfoLauf.body, 'Nutzerinfo-Lauf-Bilanz').toMatchObject({
      anzahlPaare: 1,
      anzahlErzeugt: 1,
      ohneBerechnung: 0,
      uebersprungenGesperrt: 0,
      uebersprungenWiderspruch: 0,
    });

    const informationen = await request(testApp.httpServer)
      .get('/nutzerinfo/informationen')
      .query({ endkundeId })
      .set('Authorization', `Bearer ${betriebToken}`);
    expect(informationen.status, JSON.stringify(informationen.body)).toBe(200);
    const meine = (informationen.body as { id: string; monat: string }[]).find(
      (eintrag) => eintrag.monat === januar,
    );
    expect(meine, `Monatsbericht fuer ${januar}: ${JSON.stringify(informationen.body)}`).toBeDefined();

    const bericht = await request(testApp.httpServer)
      .get(`/nutzerinfo/informationen/${meine!.id}`)
      .set('Authorization', `Bearer ${betriebToken}`);
    expect(bericht.status).toBe(200);
    expect((bericht.body as { istKwh: number }).istKwh).toBeCloseTo(istKwh, 3);
    expect((bericht.body as { referenzKwh: number }).referenzKwh).toBeCloseTo(
      Number.parseFloat(laufZeile.rows[0]!.referenz_kwh),
      3,
    );

    // ---- 10. Nachweis-Export: dieselbe Zahl an die Bewilligungsbehörde ----
    const foerderjahrId = await mitTransaktion(testApp, async () => {
      const repo = testApp.app.get(NachweisFoerderjahrRepository);
      const fj = await repo.insert({
        id: randomUUID(),
        code: `FJ-KETTE-${String(jahr)}`,
        vorhabenRef: 'AZ-TEST-KETTE',
        nummer: 1,
        ...fensterAusMonaten(januar, januar),
        definitionQuelle: 'kalenderjahr',
        bescheidRef: null,
      });
      return fj.id;
    });

    const preflight = await mitTransaktion(testApp, () =>
      testApp.app
        .get(PreflightService)
        .ausfuehren({ foerderjahrId, profilCode: 'foerderjahr_preflight_de02' }, betriebSecurityContext(), false),
    );
    expect(
      preflight.preflight.ergebnis,
      `Preflight-Befunde: ${JSON.stringify(preflight.befunde)}`,
    ).toBe('gruen');

    const einsparlauf = await mitTransaktion(testApp, () =>
      testApp.app
        .get(EinsparlaufService)
        .starten(
          { foerderjahrId, preflightId: preflight.preflight.id, art: 'foerderjahr_nachweis' },
          betriebSecurityContext(),
          false,
        ),
    );

    const exportAntwort = await request(testApp.httpServer)
      .post(`/nachweis/einsparlaeufe/${einsparlauf.id}/exporte`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({});
    expect(exportAntwort.status).toBe(201);
    const exportId = (exportAntwort.body as { id: string }).id;

    const monatsdatei = await request(testApp.httpServer)
      .get(`/nachweis/exporte/${exportId}/dateien/einspardaten_monat.csv`)
      .set('Authorization', `Bearer ${betriebToken}`);
    expect(monatsdatei.status).toBe(200);

    // Der Ist-Verbrauch der Kette steht im Export — pseudonymisiert, aber
    // zahlengleich mit Lauf und Monatsbericht.
    expect(monatsdatei.text).toContain(istKwh.toFixed(3));
    expect(monatsdatei.text).not.toContain(endkundeId);
  }, 240_000);
});
