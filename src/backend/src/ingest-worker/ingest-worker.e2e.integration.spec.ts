import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { startTestPostgres } from '../health/test-support/testcontainer-postgres';
import { migrateTestPostgres } from '../stammdaten/test-support/migrate-test-postgres';
import { startTestMosquitto, stopTestMosquitto } from './test-support/testcontainer-mosquitto';
import type { StartedTestMosquitto } from './test-support/testcontainer-mosquitto';
import {
  buildIngestWorkerConnectionString,
  ensureIngestWorkerLoginRole,
  INGEST_WORKER_TEST_LOGIN_ROLE,
} from './test-support/ingest-worker-role.test-support';
import { provisioniereTestGeraet } from './test-support/device-fixture.test-support';
import type { ProvisioniertesTestGeraet } from './test-support/device-fixture.test-support';
import { startIngestWorkerTestApp, stopIngestWorkerTestApp } from './test-support/ingest-worker-test-app';
import type { IngestWorkerTestApp } from './test-support/ingest-worker-test-app';
import { SyntheticOnlyConfigService } from '../stammdaten/synthetic/synthetic-only.config';
import { SyntheticUplinkPublisherService } from './synthetic-publisher/synthetic-uplink-publisher.service';
import { buildSyntheticUplink } from './synthetic-publisher/synthetic-uplink-fixture';
import { IngestFlowService } from './ingest-flow/ingest-flow.service';
import { EnergyStammdatenLookupRepository } from './persistence/energy-stammdaten-lookup.repository';

interface MesswertRow {
  readonly wert: string;
  readonly qualitaet: number;
  readonly herkunft: number;
  readonly ts: string;
}

interface KanalStatusRow {
  readonly letzter_ts: string;
  readonly updated_at: string;
}

interface QuarantaeneRow {
  readonly grund: string;
  readonly rohpayload_redacted: unknown;
  readonly payload_laenge: number | null;
  readonly payload_hash: Buffer | null;
}

async function pollUntil<T>(check: () => Promise<T | undefined>, timeoutMs = 15_000, intervalMs = 150): Promise<T> {
  const start = Date.now();
  for (;;) {
    const result = await check();
    if (result !== undefined) {
      return result;
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error('pollUntil: Zeitlimit ueberschritten, Bedingung nie erfuellt.');
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

describe('Ingest-Worker End-to-End (ADR-0005 Phase-4 Teil 3 — Testcontainer PG + eclipse-mosquitto)', () => {
  let pgContainer: StartedPostgreSqlContainer;
  let mosquitto: StartedTestMosquitto;
  let adminClient: Client;
  let workerApp: IngestWorkerTestApp;
  let publisher: SyntheticUplinkPublisherService;

  beforeAll(async () => {
    process.env['EDMS_DEV_KMS_MASTER_KEY'] ??= randomBytes(32).toString('base64');
    process.env['EDMS_DEV_BLIND_INDEX_PEPPER'] ??= randomBytes(32).toString('hex');
    // EDMS_ENV_CLASS/EDMS_SYNTHETIC_ONLY/EDMS_INGEST_BROKER_MODE bleiben auf
    // ihren sicheren Defaults (dev/true/synthetic) — bewusst NICHT gesetzt.

    pgContainer = await startTestPostgres();
    await migrateTestPostgres(pgContainer);
    await ensureIngestWorkerLoginRole(pgContainer);

    mosquitto = await startTestMosquitto();

    process.env['EDMS_INGEST_DATABASE_URL'] = buildIngestWorkerConnectionString(pgContainer);
    process.env['EDMS_INGEST_MQTT_URL'] = mosquitto.url;
    process.env['EDMS_SYNTHETIC_PUBLISHER_MQTT_URL'] = mosquitto.url;

    adminClient = new Client({ connectionString: pgContainer.getConnectionUri() });
    await adminClient.connect();

    workerApp = await startIngestWorkerTestApp();

    publisher = new SyntheticUplinkPublisherService(new SyntheticOnlyConfigService());
    await publisher.connect();
  }, 120_000);

  afterAll(async () => {
    await publisher.disconnect().catch(() => undefined);
    await stopIngestWorkerTestApp(workerApp).catch(() => undefined);
    await adminClient.end().catch(() => undefined);
    await stopTestMosquitto(mosquitto).catch(() => undefined);
    await pgContainer.stop().catch(() => undefined);
  }, 60_000);

  async function findMesswert(messkanalKey: number, ts: string): Promise<MesswertRow | undefined> {
    const result = await adminClient.query<MesswertRow>(
      `SELECT wert, qualitaet, herkunft, ts FROM measurement.messwert WHERE messkanal_key = $1 AND ts = $2`,
      [messkanalKey, ts],
    );
    return result.rows[0];
  }

  async function findKanalStatus(messkanalKey: number): Promise<KanalStatusRow | undefined> {
    const result = await adminClient.query<KanalStatusRow>(
      `SELECT letzter_ts, updated_at FROM ingest.kanal_status WHERE messkanal_key = $1`,
      [messkanalKey],
    );
    return result.rows[0];
  }

  it('Ende-zu-Ende: Publisher -> Mosquitto -> Worker -> measurement.messwert (korrekt korreliert) + Freshness', async () => {
    const geraet: ProvisioniertesTestGeraet = await provisioniereTestGeraet(pgContainer, {
      devEui: 'AA-AA-AA-AA-AA-AA-AA-E1',
    });

    const ts = new Date().toISOString();
    await publisher.publishUplink({ devEui: geraet.devEui, wertRoh: 111.5, deviceTimestampIso: ts });

    const geschrieben = await pollUntil(() => findMesswert(geraet.messkanalKey, ts));
    expect(Number(geschrieben.wert)).toBeCloseTo(111.5, 3);
    expect(geschrieben.qualitaet).toBe(0); // gemessen
    expect(geschrieben.herkunft).toBe(0); // ingest_live

    const kanalStatus = await pollUntil(() => findKanalStatus(geraet.messkanalKey));
    expect(new Date(kanalStatus.letzter_ts).toISOString()).toBe(new Date(ts).toISOString());
  });

  it('Idempotenz: derselbe Uplink zweimal fuehrt zu GENAU EINER Zeile', async () => {
    const geraet = await provisioniereTestGeraet(pgContainer, { devEui: 'AA-AA-AA-AA-AA-AA-AA-E2' });
    const ts = new Date().toISOString();

    await publisher.publishUplink({ devEui: geraet.devEui, wertRoh: 50, deviceTimestampIso: ts });
    await pollUntil(() => findMesswert(geraet.messkanalKey, ts));
    const statusVorZweitemUplink = await findKanalStatus(geraet.messkanalKey);

    // Zweite, IDENTISCHE Zustellung desselben Uplinks (Backfill-/Retry-Fall,
    // M2) — da beide Uplinks IDENTISCH sind, aendert sich `letzter_ts` nicht,
    // aber `ingest.kanal_status.updated_at` tickt bei JEDEM erfolgreich
    // verarbeiteten Uplink weiter (GREATEST-Upsert laeuft unbedingt, s.
    // messwert-schreibpfad.repository.ts) — das ist das zuverlaessige Signal,
    // dass die ZWEITE Zustellung vollstaendig (committet) verarbeitet wurde,
    // ohne auf eine feste Wartezeit angewiesen zu sein.
    await publisher.publishUplink({ devEui: geraet.devEui, wertRoh: 50, deviceTimestampIso: ts });
    await pollUntil(async () => {
      const status = await findKanalStatus(geraet.messkanalKey);
      const fortgeschritten =
        status !== undefined &&
        statusVorZweitemUplink !== undefined &&
        new Date(status.updated_at).getTime() > new Date(statusVorZweitemUplink.updated_at).getTime();
      return fortgeschritten ? status : undefined;
    });

    const anzahl = await adminClient.query<{ anzahl: string }>(
      `SELECT count(*)::text AS anzahl FROM measurement.messwert WHERE messkanal_key = $1 AND ts = $2`,
      [geraet.messkanalKey, ts],
    );
    expect(anzahl.rows[0]?.anzahl).toBe('1');
  });

  it('Vorrang: hoeher-rangiger Uplink (ingest_live) gewinnt gegen einen bereits geschriebenen niedriger-rangigen (backfill), reihenfolge-invariant', async () => {
    const geraet = await provisioniereTestGeraet(pgContainer, { devEui: 'AA-AA-AA-AA-AA-AA-AA-E3' });
    const ts = new Date().toISOString();
    const ingestFlowService = workerApp.app.get(IngestFlowService);

    // Reihenfolge A: zuerst backfill (niedrigerer Rang), danach live (hoeherer Rang) -> live gewinnt.
    const backfillPayload = buildSyntheticUplink({ devEui: geraet.devEui, wertRoh: 10, deviceTimestampIso: ts });
    await ingestFlowService.verarbeiteUplink({
      topicRedacted: 'direct/backfill-test',
      payload: backfillPayload.payload,
      herkunft: 'backfill',
    });

    await publisher.publishUplink({ devEui: geraet.devEui, wertRoh: 20, deviceTimestampIso: ts });
    const nachLive = await pollUntil(async () => {
      const row = await findMesswert(geraet.messkanalKey, ts);
      return row !== undefined && row.herkunft === 0 ? row : undefined;
    });
    expect(Number(nachLive.wert)).toBeCloseTo(20, 3);
    expect(nachLive.herkunft).toBe(0); // ingest_live gewinnt gegen backfill

    // Reihenfolge B (auf einem ZWEITEN, unabhaengigen Kanal): zuerst live,
    // danach ein zahlenmaessig HOEHERER, aber rang-NIEDRIGERER backfill-Wert
    // darf NICHT gewinnen (rang()-Vergleich, NICHT Wertvergleich).
    const geraetB = await provisioniereTestGeraet(pgContainer, { devEui: 'AA-AA-AA-AA-AA-AA-AA-E4' });
    const tsB = new Date().toISOString();

    await publisher.publishUplink({ devEui: geraetB.devEui, wertRoh: 200, deviceTimestampIso: tsB });
    await pollUntil(() => findMesswert(geraetB.messkanalKey, tsB));

    const backfillPayloadB = buildSyntheticUplink({
      devEui: geraetB.devEui,
      wertRoh: 999, // numerisch hoeher, aber herkunft=backfill hat den NIEDRIGEREN Rang
      deviceTimestampIso: tsB,
    });
    await ingestFlowService.verarbeiteUplink({
      topicRedacted: 'direct/backfill-test-b',
      payload: backfillPayloadB.payload,
      herkunft: 'backfill',
    });

    const endzustandB = await findMesswert(geraetB.messkanalKey, tsB);
    expect(Number(endzustandB?.wert)).toBeCloseTo(200, 3); // live (200) bleibt bestehen, backfill (999) wird abgewiesen
    expect(endzustandB?.herkunft).toBe(0);
  });

  it('Dead-Letter: unbekannte DevEUI erzeugt eine Quarantaene-Zeile OHNE Klartext-DevEUI', async () => {
    const unbekannteDevEui = 'AA-AA-AA-AA-AA-AA-AA-FF';
    await publisher.publishUplink({ devEui: unbekannteDevEui, wertRoh: 1, deviceTimestampIso: new Date().toISOString() });

    const quarantaeneZeile = await pollUntil(async () => {
      const result = await adminClient.query<QuarantaeneRow>(
        `SELECT grund, rohpayload_redacted, payload_laenge, payload_hash
           FROM ingest.eingang_quarantaene
          WHERE grund = 'devEUI_unbekannt'
          ORDER BY empfangen_at DESC LIMIT 1`,
      );
      return result.rows[0];
    });

    expect(quarantaeneZeile.grund).toBe('devEUI_unbekannt');
    const serialisiert = JSON.stringify(quarantaeneZeile.rohpayload_redacted);
    expect(serialisiert).not.toContain(unbekannteDevEui);
    expect(serialisiert).not.toContain('AAAAAAAAAAAAFF');
  });

  it('QA-5(a) DSGVO-Invariante: eine INAKTIVE/GESCHREDDERTE Geraete-Zuordnung erzeugt am Worker-Forward-Lookup KEINEN Treffer (devEUI_unbekannt statt Korrelation)', async () => {
    const geraet = await provisioniereTestGeraet(pgContainer, { devEui: 'AA-AA-AA-AA-AA-AA-AA-E6' });

    // Simuliert Krypto-Shredding (Art. 17 DSGVO)/Deaktivierung — D-KANON
    // (V0010): status<>'aktiv' UND gueltig_bis MUESSEN immer gekoppelt
    // gesetzt sein; deveui_blind_index wird beim VOLLSTAENDIGEN Shredding
    // zusaetzlich genullt (GB-C, V0010-Spaltenkommentar) — alle drei vom
    // Auftrag genannten Merkmale (status<>'aktiv' / gueltig_bis gesetzt /
    // deveui_blind_index IS NULL) treffen hier gleichzeitig zu, weil sie in
    // der Praxis gemeinsam auftreten (ein-und-dieselbe Shred-Operation).
    await adminClient.query(
      `UPDATE device.geraet_zuordnung
          SET status = 'geschreddert', gueltig_bis = now(), deveui_blind_index = NULL
        WHERE zaehler_id = $1`,
      [geraet.zaehlerId],
    );

    const ts = new Date().toISOString();
    await publisher.publishUplink({ devEui: geraet.devEui, wertRoh: 999, deviceTimestampIso: ts });

    const quarantaeneZeile = await pollUntil(async () => {
      const result = await adminClient.query<QuarantaeneRow>(
        `SELECT grund, rohpayload_redacted, payload_laenge, payload_hash
           FROM ingest.eingang_quarantaene
          WHERE grund = 'devEUI_unbekannt'
          ORDER BY empfangen_at DESC LIMIT 1`,
      );
      return result.rows[0];
    });

    expect(quarantaeneZeile.grund).toBe('devEUI_unbekannt');
    // KEIN Messwert wurde fuer den (jetzt entkoppelten) Kanal geschrieben —
    // die inaktive Zuordnung darf strukturell nie zu einer Korrelation fuehren.
    const messwert = await findMesswert(geraet.messkanalKey, ts);
    expect(messwert).toBeUndefined();
  });

  it('QA-5(c): ein STILLGELEGTER Messkanal nimmt trotz aktiver Geraete-Zuordnung keine neuen Werte an (kanal_unbekannt)', async () => {
    const geraet = await provisioniereTestGeraet(pgContainer, { devEui: 'AA-AA-AA-AA-AA-AA-AA-E7' });
    await adminClient.query(`UPDATE energy.messkanal SET status = 'stillgelegt' WHERE id = $1`, [geraet.messkanalId]);

    const ts = new Date().toISOString();
    await publisher.publishUplink({ devEui: geraet.devEui, wertRoh: 42, deviceTimestampIso: ts });

    const quarantaeneZeile = await pollUntil(async () => {
      const result = await adminClient.query<QuarantaeneRow>(
        `SELECT grund, rohpayload_redacted, payload_laenge, payload_hash
           FROM ingest.eingang_quarantaene
          WHERE grund = 'kanal_unbekannt'
          ORDER BY empfangen_at DESC LIMIT 1`,
      );
      return result.rows[0];
    });

    expect(quarantaeneZeile.grund).toBe('kanal_unbekannt');
    const messwert = await findMesswert(geraet.messkanalKey, ts);
    expect(messwert).toBeUndefined();
  });

  it('QA-5(b): findAktivenMesskanal matched eine echte obis_kennzahl=NULL-Spalte ueber IS NOT DISTINCT FROM (kein NULL=NULL-Fallstrick)', async () => {
    const geraet = await provisioniereTestGeraet(pgContainer, {
      devEui: 'AA-AA-AA-AA-AA-AA-AA-E8',
      obisKennzahl: null, // energy.messkanal.obis_kennzahl bleibt NULL — nur Strom traegt eine OBIS-Kennzahl.
    });
    const energyRepository = workerApp.app.get(EnergyStammdatenLookupRepository);

    const treffer = await energyRepository.findAktivenMesskanal(geraet.zaehlerId, 'wirkarbeit', undefined);
    expect(treffer?.kanalKey).toBe(geraet.messkanalKey);
    expect(treffer?.einheit).toBe('kWh');
    expect(treffer?.art).toBe('kumulativ_zaehlerstand');

    // Gegenprobe: eine ABWEICHENDE, nicht-NULL OBIS-Kennzahl darf NICHT
    // gegen die NULL-Spalte matchen (sonst waere `IS NOT DISTINCT FROM`
    // fehlerhaft implementiert/verwendet).
    const keinTreffer = await energyRepository.findAktivenMesskanal(geraet.zaehlerId, 'wirkarbeit', '1.8.0');
    expect(keinTreffer).toBeUndefined();
  });

  it('RL-1: die Worker-DB-Rolle kann deveui_enc/device.schluessel NICHT lesen (negativ getestet)', async () => {
    const geraet = await provisioniereTestGeraet(pgContainer, { devEui: 'AA-AA-AA-AA-AA-AA-AA-E5' });

    const workerRoleClient = new Client({ connectionString: buildIngestWorkerConnectionString(pgContainer) });
    await workerRoleClient.connect();
    try {
      // Positiv-Kontrolle: die spaltenscharf erlaubte Spalte funktioniert.
      await expect(
        workerRoleClient.query(`SELECT zaehler_id FROM device.geraet_zuordnung WHERE zaehler_id = $1`, [geraet.zaehlerId]),
      ).resolves.toBeDefined();

      // Negativ: deveui_enc ist NICHT Teil des spaltenscharfen Grants (V0010).
      await expect(
        workerRoleClient.query(`SELECT deveui_enc FROM device.geraet_zuordnung WHERE zaehler_id = $1`, [geraet.zaehlerId]),
      ).rejects.toMatchObject({ code: '42501' });

      // Negativ: device.schluessel hat GAR KEIN Grant fuer edms_ingest_worker.
      await expect(workerRoleClient.query(`SELECT * FROM device.schluessel LIMIT 1`)).rejects.toMatchObject({
        code: '42501',
      });

      // Negativ: identity.* ist fuer den Worker unerreichbar (kein GRANT, V0010-Datei-Kopf).
      await expect(workerRoleClient.query(`SELECT * FROM identity.subjekt_schluessel LIMIT 1`)).rejects.toMatchObject({
        code: '42501',
      });
    } finally {
      await workerRoleClient.end();
    }
  });

  it('die Test-Login-Rolle ist tatsaechlich Mitglied von edms_ingest_worker (Setup-Sanity-Check)', async () => {
    const result = await adminClient.query<{ rolname: string }>(
      `SELECT r.rolname
         FROM pg_auth_members m
         JOIN pg_roles r ON r.oid = m.roleid
         JOIN pg_roles member ON member.oid = m.member
        WHERE member.rolname = $1`,
      [INGEST_WORKER_TEST_LOGIN_ROLE],
    );
    expect(result.rows.map((row) => row.rolname)).toContain('edms_ingest_worker');
  });
});
