import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StammdatenTestApp } from '../test-support/stammdaten-test-app';
import { startStammdatenTestApp, stopStammdatenTestApp } from '../test-support/stammdaten-test-app';

/**
 * Integrationstests (ECHTER Postgres-Testcontainer, ALLE `migrations/**`
 * inkl. V0011 [`ingest.kanal_status`/`ingest.ausfall_vorgang`] dynamisch
 * angewendet, KEIN DB-Mock, `.claude/rules/tests.md`) für Backend-Lücke 2
 * (Betriebs-UI-Konzept, ADR-0005 §27/TB-04): `GET /monitoring/ausfaelle`
 * (Dashboard-Kachel) und `GET /stammdaten/zaehler/{zaehlerId}/freshness`
 * (Zähler-Detailseite).
 *
 * Kein Endpoint schreibt `ingest.kanal_status`/`ingest.ausfall_vorgang` —
 * das ist Aufgabe des Ingest-Workers (separate Rohbytes-Pipeline, ADR-0005).
 * Diese Tests seeden die beiden Tabellen daher DIREKT über den rohen
 * `pg`-Client (analog `standort.integration.spec.ts`, das ebenfalls direkt
 * gegen `identity.standort_pii` liest/schreibt) — 1:1 die Semantik des
 * `GREATEST`-Upserts aus `messwert-schreibpfad.repository.ts`, hier aber
 * mit einem BEWUSST in der Vergangenheit liegenden `letzter_ts` (simuliert
 * einen Kanal, der zuletzt vor N Stunden gesendet hat).
 */
describe('TB-04-Ausfall-/Freshness-Lesepfade — Integrationstests (ADR-0005 §27, Backend-Lücke 2)', () => {
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
      .send({
        stammdatenPii: { name: `Testkunde Ausfall ${namenSuffix}`, anschrift: 'Musterstraße 1, 12345 Musterstadt' },
      });
    expect(response.status).toBe(201);
    return (response.body as { id: string }).id;
  }

  async function legeZaehlerAn(endkundeId: string, namenSuffix: string): Promise<string> {
    const systemResponse = await request(testApp.httpServer)
      .post('/stammdaten/systeme')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ endkundeId, bezeichnung: `Testsystem ${namenSuffix}`, systemgrenze: 'Gebäude Musterhalle' });
    expect(systemResponse.status).toBe(201);
    const systemId = (systemResponse.body as { id: string }).id;

    const zaehlerResponse = await request(testApp.httpServer)
      .post('/stammdaten/zaehler')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ systemId, geraetetyp: 'Testzaehler', energietraeger: 'strom' });
    expect(zaehlerResponse.status).toBe(201);
    return (zaehlerResponse.body as { id: string }).id;
  }

  async function legeMesskanalAn(zaehlerId: string, namenSuffix: string): Promise<string> {
    const response = await request(testApp.httpServer)
      .post(`/stammdaten/zaehler/${zaehlerId}/messkanaele`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ messgroesse: `Wirkarbeit ${namenSuffix}`, einheit: 'kWh', art: 'kumulativ_zaehlerstand' });
    expect(response.status).toBe(201);
    return (response.body as { id: string }).id;
  }

  async function kanalKeyVon(messkanalId: string): Promise<number> {
    const row = await dbClient.query('SELECT kanal_key FROM energy.messkanal WHERE id = $1', [messkanalId]);
    return (row.rows[0] as { kanal_key: number }).kanal_key;
  }

  async function seedeKanalStatus(messkanalId: string, letzterTs: Date): Promise<void> {
    const kanalKey = await kanalKeyVon(messkanalId);
    await dbClient.query(
      `INSERT INTO ingest.kanal_status (messkanal_key, letzter_ts, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (messkanal_key) DO UPDATE SET letzter_ts = EXCLUDED.letzter_ts, updated_at = now()`,
      [kanalKey, letzterTs.toISOString()],
    );
  }

  const STUNDE_MS = 60 * 60 * 1000;
  function vorStunden(stunden: number): Date {
    return new Date(Date.now() - stunden * STUNDE_MS);
  }

  describe('GET /monitoring/ausfaelle — TB-04-Ausfall-Liste', () => {
    it('findet einen Kanal mit ueberfaelliger Freshness (letzter_ts > 60h alt) UND ignoriert einen frischen Kanal (letzter_ts vor 1h)', async () => {
      const endkundeId = await legeEndkundeAn('Ausfall');
      const zaehlerUeberfaellig = await legeZaehlerAn(endkundeId, 'Ueberfaellig');
      const messkanalUeberfaellig = await legeMesskanalAn(zaehlerUeberfaellig, 'Ueberfaellig');
      await seedeKanalStatus(messkanalUeberfaellig, vorStunden(100));

      const zaehlerFrisch = await legeZaehlerAn(endkundeId, 'Frisch');
      const messkanalFrisch = await legeMesskanalAn(zaehlerFrisch, 'Frisch');
      await seedeKanalStatus(messkanalFrisch, vorStunden(1));

      const response = await request(testApp.httpServer)
        .get('/monitoring/ausfaelle')
        .set('Authorization', `Bearer ${betriebToken}`);

      expect(response.status).toBe(200);
      const daten = (response.body as { daten: { messkanalId: string; ueberfaellig: boolean }[] }).daten;
      expect(daten.map((eintrag) => eintrag.messkanalId)).toContain(messkanalUeberfaellig);
      expect(daten.map((eintrag) => eintrag.messkanalId)).not.toContain(messkanalFrisch);

      const eintrag = daten.find((zeile) => zeile.messkanalId === messkanalUeberfaellig);
      expect(eintrag?.ueberfaellig).toBe(true);
    });

    it('ignoriert einen ueberfaelligen Kanal eines STILLGELEGTEN Zaehlers (kein Sanktionsrisiko fuer bewusst beendete Messung)', async () => {
      const endkundeId = await legeEndkundeAn('AusfallStillgelegt');
      const zaehlerId = await legeZaehlerAn(endkundeId, 'Stillgelegt');
      const messkanalId = await legeMesskanalAn(zaehlerId, 'Stillgelegt');
      await seedeKanalStatus(messkanalId, vorStunden(200));

      await request(testApp.httpServer)
        .delete(`/stammdaten/zaehler/${zaehlerId}`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .expect(200);

      const response = await request(testApp.httpServer)
        .get('/monitoring/ausfaelle')
        .set('Authorization', `Bearer ${betriebToken}`);

      expect(response.status).toBe(200);
      const daten = (response.body as { daten: { messkanalId: string }[] }).daten;
      expect(daten.map((eintrag) => eintrag.messkanalId)).not.toContain(messkanalId);
    });

    it('ein Kanal, der noch NIE Daten geliefert hat (kein ingest.kanal_status-Eintrag), erscheint NICHT in der TB-04-Liste', async () => {
      const endkundeId = await legeEndkundeAn('AusfallNieGesendet');
      const zaehlerId = await legeZaehlerAn(endkundeId, 'NieGesendet');
      const messkanalId = await legeMesskanalAn(zaehlerId, 'NieGesendet');

      const response = await request(testApp.httpServer)
        .get('/monitoring/ausfaelle')
        .set('Authorization', `Bearer ${betriebToken}`);

      expect(response.status).toBe(200);
      const daten = (response.body as { daten: { messkanalId: string }[] }).daten;
      expect(daten.map((eintrag) => eintrag.messkanalId)).not.toContain(messkanalId);
    });

    it('M1 — ABAC: anonym -> 401, admin -> 403, compliance-auditor -> 200, betrieb -> 200 (identisch zu /monitoring/vollstaendigkeit)', async () => {
      const anonym = await request(testApp.httpServer).get('/monitoring/ausfaelle');
      expect(anonym.status).toBe(401);

      const admin = await request(testApp.httpServer)
        .get('/monitoring/ausfaelle')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(admin.status).toBe(403);

      const auditor = await request(testApp.httpServer)
        .get('/monitoring/ausfaelle')
        .set('Authorization', `Bearer ${auditorToken}`);
      expect(auditor.status).toBe(200);

      const betrieb = await request(testApp.httpServer)
        .get('/monitoring/ausfaelle')
        .set('Authorization', `Bearer ${betriebToken}`);
      expect(betrieb.status).toBe(200);
    });
  });

  describe('GET /stammdaten/zaehler/{zaehlerId}/freshness — Betriebs-Metadatum, KEIN break-glass', () => {
    it('ist OHNE jeden X-Edms-Zugriffszweck-Header erreichbar (200) — kein break-glass-Zwang fuer schlichtes Betriebsmonitoring', async () => {
      const endkundeId = await legeEndkundeAn('FreshnessKeinBreakGlass');
      const zaehlerId = await legeZaehlerAn(endkundeId, 'KeinBreakGlass');
      const messkanalId = await legeMesskanalAn(zaehlerId, 'KeinBreakGlass');
      await seedeKanalStatus(messkanalId, vorStunden(2));

      // BEWUSST kein `.set('X-Edms-Zugriffszweck', ...)` — genau das
      // beweist, dass dieser Endpunkt NICHT break-glass-gehaertet ist.
      const response = await request(testApp.httpServer)
        .get(`/stammdaten/zaehler/${zaehlerId}/freshness`)
        .set('Authorization', `Bearer ${betriebToken}`);

      expect(response.status).toBe(200);
      const items = response.body as { messkanalId: string; letzteUebertragung: string | null; ueberfaellig: boolean }[];
      const eintrag = items.find((item) => item.messkanalId === messkanalId);
      expect(eintrag?.letzteUebertragung).not.toBeNull();
      expect(eintrag?.ueberfaellig).toBe(false);
    });

    it('liefert letzteUebertragung=null + ueberfaellig=true fuer einen Kanal ohne jeden ingest.kanal_status-Eintrag (Empty-State, KEIN Fehler)', async () => {
      const endkundeId = await legeEndkundeAn('FreshnessLeer');
      const zaehlerId = await legeZaehlerAn(endkundeId, 'Leer');
      const messkanalId = await legeMesskanalAn(zaehlerId, 'Leer');

      const response = await request(testApp.httpServer)
        .get(`/stammdaten/zaehler/${zaehlerId}/freshness`)
        .set('Authorization', `Bearer ${betriebToken}`);

      expect(response.status).toBe(200);
      const items = response.body as { messkanalId: string; letzteUebertragung: string | null; ueberfaellig: boolean }[];
      const eintrag = items.find((item) => item.messkanalId === messkanalId);
      expect(eintrag).toEqual({
        messkanalId,
        letzteUebertragung: null,
        ueberfaellig: true,
        ausfallStatus: null,
        ausfallSeit: null,
      });
    });

    it('lehnt ab (404), wenn der Zaehler nicht existiert', async () => {
      const response = await request(testApp.httpServer)
        .get(`/stammdaten/zaehler/${randomUUID()}/freshness`)
        .set('Authorization', `Bearer ${betriebToken}`);

      expect(response.status).toBe(404);
    });

    it('M1 — ABAC: anonym -> 401, admin -> 403, compliance-auditor -> 200, betrieb -> 200', async () => {
      const endkundeId = await legeEndkundeAn('FreshnessABAC');
      const zaehlerId = await legeZaehlerAn(endkundeId, 'ABAC');

      const anonym = await request(testApp.httpServer).get(`/stammdaten/zaehler/${zaehlerId}/freshness`);
      expect(anonym.status).toBe(401);

      const admin = await request(testApp.httpServer)
        .get(`/stammdaten/zaehler/${zaehlerId}/freshness`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(admin.status).toBe(403);

      const auditor = await request(testApp.httpServer)
        .get(`/stammdaten/zaehler/${zaehlerId}/freshness`)
        .set('Authorization', `Bearer ${auditorToken}`);
      expect(auditor.status).toBe(200);

      const betrieb = await request(testApp.httpServer)
        .get(`/stammdaten/zaehler/${zaehlerId}/freshness`)
        .set('Authorization', `Bearer ${betriebToken}`);
      expect(betrieb.status).toBe(200);
    });
  });
});
