import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StammdatenTestApp } from '../stammdaten/test-support/stammdaten-test-app';
import { startStammdatenTestApp, stopStammdatenTestApp } from '../stammdaten/test-support/stammdaten-test-app';

/**
 * Integrationstests (ECHTER Postgres+TimescaleDB-Testcontainer, ALLE
 * `migrations/**`-Dateien, KEIN DB-Mock, `.claude/rules/tests.md`) für den
 * Verbrauchs-/Messwert-Endpoint (letztes fehlendes Ausliefer-Stück).
 *
 * Deckt gezielt den fachlichen Kern des Arbeitsauftrags ab: Differenzbildung
 * bei kumulativen Zählerständen, direkte Summierung bei
 * `intervall_verbrauch`, Zählerwechsel/-überlauf (negative Differenz wird
 * NICHT als negativer Verbrauch ausgegeben), Aggregation über mehrere
 * Zähler, Vererbung über Ebenen (D6-Subtree), Zeitscheiben-Korrektheit (D3),
 * gemischte Einheiten (werden NIE addiert) sowie die ABAC-Matrix beider
 * Routen. `measurement.messwert`-Zeilen werden — mangels erreichbarem
 * Ingest-Endpoint in diesem Testkontext (Out-of-Scope: ChirpStack/MQTT,
 * ADR-0005) — direkt per SQL eingefügt, exakt wie der bestehende
 * `standort.integration.spec.ts`-Präzedenzfall für DB-seitige
 * Fixture-/Verifikationszugriffe.
 *
 * Testdaten sind ausschließlich synthetisch (F6-Bedingung 2/M6).
 */
describe('Verbrauchs-/Messwert-Endpoint — Integrationstests', () => {
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
      .send({ stammdatenPii: { name: `Testkunde Messwerte ${namenSuffix}`, anschrift: 'Musterstraße 1' } });
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

  async function legeMesskanalAn(
    zaehlerId: string,
    input: {
      messgroesse: string;
      einheit: string;
      art: 'kumulativ_zaehlerstand' | 'intervall_verbrauch';
      istUntermessung?: boolean;
    },
  ): Promise<string> {
    const response = await request(testApp.httpServer)
      .post(`/stammdaten/zaehler/${zaehlerId}/messkanaele`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send(input);
    expect(response.status).toBe(201);
    return (response.body as { id: string }).id;
  }

  async function legeStandortAn(
    endkundeId: string,
    body: { typ: string; parentId?: string; bezeichnung: string; adresse?: string },
  ): Promise<string> {
    const response = await request(testApp.httpServer)
      .post(`/stammdaten/endkunden/${endkundeId}/standorte`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send(body);
    expect(response.status).toBe(201);
    return (response.body as { id: string }).id;
  }

  async function veorteZaehler(zaehlerId: string, standortId: string, gueltigVon: string): Promise<void> {
    const response = await request(testApp.httpServer)
      .post(`/stammdaten/zaehler/${zaehlerId}/verortung`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ standortId, gueltigVon });
    expect(response.status).toBe(201);
  }

  async function insertMesswert(
    messkanalId: string,
    ts: string,
    wert: number,
    qualitaet = 0,
    herkunft = 0,
  ): Promise<void> {
    const kanalKeyRow = await dbClient.query('SELECT kanal_key FROM energy.messkanal WHERE id = $1', [messkanalId]);
    const kanalKey = (kanalKeyRow.rows[0] as { kanal_key: number }).kanal_key;
    await dbClient.query(
      `INSERT INTO measurement.messwert (messkanal_key, ts, wert, qualitaet, herkunft)
       VALUES ($1, $2::timestamptz, $3, $4, $5)
       ON CONFLICT (messkanal_key, ts) DO NOTHING`,
      [kanalKey, ts, wert, qualitaet, herkunft],
    );
  }

  async function holeVerbrauch(
    standortId: string,
    query: Record<string, string>,
    token: string = betriebToken,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const response = await request(testApp.httpServer)
      .get(`/messwerte/standorte/${standortId}/verbrauch`)
      .query(query)
      .set('Authorization', `Bearer ${token}`);
    return { status: response.status, body: response.body as Record<string, unknown> };
  }

  describe('Route A — aggregierter Verbrauch (read:verbrauch_aggregat)', () => {
    it('Differenzbildung bei kumulativen Zählerständen: Verbrauch = Differenz aufeinanderfolgender Stände, NICHT der Rohwert', async () => {
      const endkundeId = await legeEndkundeAn('Diff');
      const zaehlerId = await legeZaehlerAn(endkundeId, 'Diff');
      const messkanalId = await legeMesskanalAn(zaehlerId, { messgroesse: 'wirkarbeit', einheit: 'kWh', art: 'kumulativ_zaehlerstand' });
      const standortId = await legeStandortAn(endkundeId, { typ: 'liegenschaft', bezeichnung: 'Diff-Standort', adresse: 'Weg 1' });
      await veorteZaehler(zaehlerId, standortId, '2026-03-01T00:00:00.000Z');

      await insertMesswert(messkanalId, '2026-03-01T09:00:00.000Z', 100); // Vorlaufwert VOR dem Fenster
      await insertMesswert(messkanalId, '2026-03-01T10:00:00.000Z', 150);
      await insertMesswert(messkanalId, '2026-03-01T11:00:00.000Z', 170);

      const { status, body } = await holeVerbrauch(standortId, {
        von: '2026-03-01T10:00:00.000Z',
        bis: '2026-03-01T12:00:00.000Z',
        aufloesung: 'stunde',
      });

      expect(status).toBe(200);
      const zeitreihe = body['zeitreihe'] as { zeitpunkt: string; wert: number; messgroesse: string; einheit: string }[];
      expect(zeitreihe).toEqual([
        expect.objectContaining({ wert: 50, messgroesse: 'wirkarbeit', einheit: 'kWh' }),
        expect.objectContaining({ wert: 20, messgroesse: 'wirkarbeit', einheit: 'kWh' }),
      ]);
      expect(new Date(zeitreihe[0]?.zeitpunkt as string).toISOString()).toBe('2026-03-01T10:00:00.000Z');
      expect(new Date(zeitreihe[1]?.zeitpunkt as string).toISOString()).toBe('2026-03-01T11:00:00.000Z');
      expect(body['metadaten']).toMatchObject({ einbezogeneZaehler: 1, einbezogeneKanaele: 1, erkannteLuecken: 0 });
    });

    it('intervall_verbrauch wird direkt SUMMIERT (keine Differenzbildung)', async () => {
      const endkundeId = await legeEndkundeAn('Intervall');
      const zaehlerId = await legeZaehlerAn(endkundeId, 'Intervall');
      const messkanalId = await legeMesskanalAn(zaehlerId, { messgroesse: 'volumen', einheit: 'm3', art: 'intervall_verbrauch' });
      const standortId = await legeStandortAn(endkundeId, { typ: 'liegenschaft', bezeichnung: 'Intervall-Standort', adresse: 'Weg 2' });
      await veorteZaehler(zaehlerId, standortId, '2026-03-01T00:00:00.000Z');

      await insertMesswert(messkanalId, '2026-03-01T10:00:00.000Z', 3);
      await insertMesswert(messkanalId, '2026-03-01T10:15:00.000Z', 4);
      await insertMesswert(messkanalId, '2026-03-01T10:45:00.000Z', 2);

      const { status, body } = await holeVerbrauch(standortId, {
        von: '2026-03-01T10:00:00.000Z',
        bis: '2026-03-01T11:00:00.000Z',
        aufloesung: 'stunde',
      });

      expect(status).toBe(200);
      const zeitreihe = body['zeitreihe'] as { wert: number }[];
      expect(zeitreihe).toHaveLength(1);
      expect(zeitreihe[0]?.wert).toBe(9); // 3+4+2, KEINE Differenzbildung
    });

    it('negative Differenz (Zählerwechsel/-überlauf) wird NICHT als negativer Verbrauch ausgegeben — die betroffene Zeitscheibe wird zur Lücke, andere Buckets bleiben unberührt', async () => {
      const endkundeId = await legeEndkundeAn('Rollover');
      const zaehlerId = await legeZaehlerAn(endkundeId, 'Rollover');
      const messkanalId = await legeMesskanalAn(zaehlerId, { messgroesse: 'wirkarbeit', einheit: 'kWh', art: 'kumulativ_zaehlerstand' });
      const standortId = await legeStandortAn(endkundeId, { typ: 'liegenschaft', bezeichnung: 'Rollover-Standort', adresse: 'Weg 3' });
      await veorteZaehler(zaehlerId, standortId, '2026-03-01T00:00:00.000Z');

      await insertMesswert(messkanalId, '2026-03-01T09:00:00.000Z', 100); // Vorlauf
      await insertMesswert(messkanalId, '2026-03-01T10:00:00.000Z', 150); // Bucket 10: 150-100=50
      await insertMesswert(messkanalId, '2026-03-01T11:00:00.000Z', 30); // Zaehlerwechsel: 30-150=-120 -> Luecke, NICHT -120
      await insertMesswert(messkanalId, '2026-03-01T12:00:00.000Z', 80); // Bucket 12: 80-30=50 (ab neuem Zaehlerstand)

      const { status, body } = await holeVerbrauch(standortId, {
        von: '2026-03-01T10:00:00.000Z',
        bis: '2026-03-01T13:00:00.000Z',
        aufloesung: 'stunde',
      });

      expect(status).toBe(200);
      const zeitreihe = body['zeitreihe'] as { zeitpunkt: string; wert: number }[];
      expect(zeitreihe.every((punkt) => punkt.wert >= 0)).toBe(true);
      expect(zeitreihe.map((p) => ({ stunde: new Date(p.zeitpunkt).toISOString(), wert: p.wert }))).toEqual([
        { stunde: '2026-03-01T10:00:00.000Z', wert: 50 },
        { stunde: '2026-03-01T12:00:00.000Z', wert: 50 },
      ]);
      expect(body['metadaten']).toMatchObject({ erkannteLuecken: 1 }); // GENAU der 11:00-Bucket fehlt, nicht als 0.
    });

    it('Aggregation über MEHRERE Zähler unter demselben Knoten summiert deren gleichartige Kanäle', async () => {
      const endkundeId = await legeEndkundeAn('MehrereZaehler');
      const zaehlerA = await legeZaehlerAn(endkundeId, 'MehrereZaehlerA');
      const zaehlerB = await legeZaehlerAn(endkundeId, 'MehrereZaehlerB');
      const kanalA = await legeMesskanalAn(zaehlerA, { messgroesse: 'wirkarbeit', einheit: 'kWh', art: 'kumulativ_zaehlerstand' });
      const kanalB = await legeMesskanalAn(zaehlerB, { messgroesse: 'wirkarbeit', einheit: 'kWh', art: 'kumulativ_zaehlerstand' });
      const standortId = await legeStandortAn(endkundeId, { typ: 'liegenschaft', bezeichnung: 'Mehrere-Zaehler-Standort', adresse: 'Weg 4' });
      await veorteZaehler(zaehlerA, standortId, '2026-03-01T00:00:00.000Z');
      await veorteZaehler(zaehlerB, standortId, '2026-03-01T00:00:00.000Z');

      await insertMesswert(kanalA, '2026-03-01T09:00:00.000Z', 0);
      await insertMesswert(kanalA, '2026-03-01T10:00:00.000Z', 10);
      await insertMesswert(kanalB, '2026-03-01T09:00:00.000Z', 0);
      await insertMesswert(kanalB, '2026-03-01T10:00:00.000Z', 7);

      const { status, body } = await holeVerbrauch(standortId, {
        von: '2026-03-01T10:00:00.000Z',
        bis: '2026-03-01T11:00:00.000Z',
        aufloesung: 'stunde',
      });

      expect(status).toBe(200);
      const zeitreihe = body['zeitreihe'] as { wert: number }[];
      expect(zeitreihe).toHaveLength(1);
      expect(zeitreihe[0]?.wert).toBe(17); // 10 + 7
      expect(body['metadaten']).toMatchObject({ einbezogeneZaehler: 2, einbezogeneKanaele: 2 });
    });

    it('Untermessungen zaehlen NICHT mit — sonst stuende derselbe Verbrauch zweimal in der Kurve', async () => {
      // Eine Untermessung (V0058) misst eine TEILMENGE der Hauptmessung
      // desselben Systems. Summierte die Anzeige beide, zeigte sie 17 kWh, wo
      // 10 kWh verbraucht wurden — und der Bediener vergliche diese zu hohe
      // Zahl mit dem korrekt gerechneten Ist-Verbrauch eines Laufs, der die
      // Untermessung auslaesst. Die ausgelassenen Kanaele werden ausgewiesen,
      // damit die Differenz zur Kanalzahl der Stammdaten erklaerbar bleibt.
      const endkundeId = await legeEndkundeAn('Untermessung');
      const zaehlerId = await legeZaehlerAn(endkundeId, 'Untermessung');
      const hauptkanal = await legeMesskanalAn(zaehlerId, {
        messgroesse: 'wirkarbeit',
        einheit: 'kWh',
        art: 'kumulativ_zaehlerstand',
      });
      const unterkanal = await legeMesskanalAn(zaehlerId, {
        messgroesse: 'wirkarbeit_teilbereich',
        einheit: 'kWh',
        art: 'kumulativ_zaehlerstand',
        istUntermessung: true,
      });
      const standortId = await legeStandortAn(endkundeId, {
        typ: 'liegenschaft',
        bezeichnung: 'Untermessungs-Standort',
        adresse: 'Weg 9',
      });
      await veorteZaehler(zaehlerId, standortId, '2026-03-01T00:00:00.000Z');

      await insertMesswert(hauptkanal, '2026-03-01T09:00:00.000Z', 0);
      await insertMesswert(hauptkanal, '2026-03-01T10:00:00.000Z', 10);
      await insertMesswert(unterkanal, '2026-03-01T09:00:00.000Z', 0);
      await insertMesswert(unterkanal, '2026-03-01T10:00:00.000Z', 7);

      const { status, body } = await holeVerbrauch(standortId, {
        von: '2026-03-01T10:00:00.000Z',
        bis: '2026-03-01T11:00:00.000Z',
        aufloesung: 'stunde',
      });

      expect(status).toBe(200);
      const zeitreihe = body['zeitreihe'] as { wert: number }[];
      expect(zeitreihe).toHaveLength(1);
      expect(zeitreihe[0]?.wert).toBe(10);
      expect(body['metadaten']).toMatchObject({
        einbezogeneZaehler: 1,
        einbezogeneKanaele: 1,
        ausgelasseneUntermessungen: 1,
      });
    });

    it('Vererbung über Ebenen: ein Zähler an "einheit" erscheint bei Abfrage auf das übergeordnete "gebaeude" (inklusiveUnterknoten), NICHT bei inklusiveUnterknoten=false', async () => {
      const endkundeId = await legeEndkundeAn('Vererbung');
      const zaehlerId = await legeZaehlerAn(endkundeId, 'Vererbung');
      const messkanalId = await legeMesskanalAn(zaehlerId, { messgroesse: 'wirkarbeit', einheit: 'kWh', art: 'kumulativ_zaehlerstand' });
      const gebaeudeId = await legeStandortAn(endkundeId, { typ: 'gebaeude', bezeichnung: 'Gebaeude', adresse: 'Weg 5' });
      const einheitId = await legeStandortAn(endkundeId, { typ: 'einheit', parentId: gebaeudeId, bezeichnung: 'Einheit 3' });
      await veorteZaehler(zaehlerId, einheitId, '2026-03-01T00:00:00.000Z');

      await insertMesswert(messkanalId, '2026-03-01T09:00:00.000Z', 0);
      await insertMesswert(messkanalId, '2026-03-01T10:00:00.000Z', 5);

      const query = { von: '2026-03-01T10:00:00.000Z', bis: '2026-03-01T11:00:00.000Z', aufloesung: 'stunde' };

      const aufEinheit = await holeVerbrauch(einheitId, query);
      expect((aufEinheit.body['zeitreihe'] as { wert: number }[])[0]?.wert).toBe(5);

      const aufGebaeudeInklusive = await holeVerbrauch(gebaeudeId, query);
      expect((aufGebaeudeInklusive.body['zeitreihe'] as { wert: number }[])[0]?.wert).toBe(5);

      const aufGebaeudeExklusive = await holeVerbrauch(gebaeudeId, { ...query, inklusiveUnterknoten: 'false' });
      expect(aufGebaeudeExklusive.body['zeitreihe']).toEqual([]);
      expect(aufGebaeudeExklusive.body['metadaten']).toMatchObject({ einbezogeneZaehler: 0, einbezogeneKanaele: 0 });
    });

    it('Zeitscheiben-Korrektheit: ein zum Stichtag ANDERSWO verorteter Zähler zählt NICHT mit', async () => {
      const endkundeId = await legeEndkundeAn('Zeitscheibe');
      const zaehlerId = await legeZaehlerAn(endkundeId, 'Zeitscheibe');
      const messkanalId = await legeMesskanalAn(zaehlerId, { messgroesse: 'wirkarbeit', einheit: 'kWh', art: 'kumulativ_zaehlerstand' });
      const standortA = await legeStandortAn(endkundeId, { typ: 'liegenschaft', bezeichnung: 'Standort A', adresse: 'Weg A' });
      const standortB = await legeStandortAn(endkundeId, { typ: 'liegenschaft', bezeichnung: 'Standort B', adresse: 'Weg B' });

      await veorteZaehler(zaehlerId, standortA, '2026-01-01T00:00:00.000Z');
      // "Umsetzen" (ADR-0010 D3): der ZWEITE Aufruf schließt die offene
      // Vorgänger-Verortung automatisch an der neuen Startzeit — kein
      // separater `beenden()`-Aufruf nötig (analog `standort.integration.spec.ts`).
      await veorteZaehler(zaehlerId, standortB, '2026-02-01T00:00:00.000Z');

      await insertMesswert(messkanalId, '2026-01-14T00:00:00.000Z', 0);
      await insertMesswert(messkanalId, '2026-01-15T00:00:00.000Z', 8);

      // Stichtag WÄHREND der Zuordnung zu Standort A (15. Januar) -> zaehlt bei A, NICHT bei B.
      const beiA = await holeVerbrauch(standortA, {
        von: '2026-01-15T00:00:00.000Z',
        bis: '2026-01-16T00:00:00.000Z',
        aufloesung: 'tag',
        stichtag: '2026-01-15T12:00:00.000Z',
      });
      expect((beiA.body['zeitreihe'] as { wert: number }[])[0]?.wert).toBe(8);

      const beiB = await holeVerbrauch(standortB, {
        von: '2026-01-15T00:00:00.000Z',
        bis: '2026-01-16T00:00:00.000Z',
        aufloesung: 'tag',
        stichtag: '2026-01-15T12:00:00.000Z',
      });
      expect(beiB.body['zeitreihe']).toEqual([]);
      expect(beiB.body['metadaten']).toMatchObject({ einbezogeneZaehler: 0 });
    });

    it('gemischte Einheiten/Messgrößen werden NIE stumm addiert — zwei Kanäle desselben Zählers bleiben getrennte Punkte', async () => {
      const endkundeId = await legeEndkundeAn('GemischteEinheiten');
      const zaehlerId = await legeZaehlerAn(endkundeId, 'GemischteEinheiten');
      const kanalStrom = await legeMesskanalAn(zaehlerId, { messgroesse: 'wirkarbeit', einheit: 'kWh', art: 'kumulativ_zaehlerstand' });
      const kanalGas = await legeMesskanalAn(zaehlerId, { messgroesse: 'volumen', einheit: 'm3', art: 'kumulativ_zaehlerstand' });
      const standortId = await legeStandortAn(endkundeId, { typ: 'liegenschaft', bezeichnung: 'Gemischt-Standort', adresse: 'Weg 6' });
      await veorteZaehler(zaehlerId, standortId, '2026-03-01T00:00:00.000Z');

      await insertMesswert(kanalStrom, '2026-03-01T09:00:00.000Z', 0);
      await insertMesswert(kanalStrom, '2026-03-01T10:00:00.000Z', 10);
      await insertMesswert(kanalGas, '2026-03-01T09:00:00.000Z', 0);
      await insertMesswert(kanalGas, '2026-03-01T10:00:00.000Z', 3);

      const { status, body } = await holeVerbrauch(standortId, {
        von: '2026-03-01T10:00:00.000Z',
        bis: '2026-03-01T11:00:00.000Z',
        aufloesung: 'stunde',
      });

      expect(status).toBe(200);
      const zeitreihe = body['zeitreihe'] as { messgroesse: string; einheit: string; wert: number }[];
      expect(zeitreihe).toHaveLength(2);
      expect(zeitreihe).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ messgroesse: 'wirkarbeit', einheit: 'kWh', wert: 10 }),
          expect.objectContaining({ messgroesse: 'volumen', einheit: 'm3', wert: 3 }),
        ]),
      );
      // Insbesondere NICHT 13 (10+3) als ein einzelner Punkt.
      expect(zeitreihe.map((p) => p.wert)).not.toContain(13);
    });

    it('Monatsauflösung (time_bucket über Kalendermonate, Apache-2-konform) summiert intervall_verbrauch korrekt', async () => {
      const endkundeId = await legeEndkundeAn('Monat');
      const zaehlerId = await legeZaehlerAn(endkundeId, 'Monat');
      const messkanalId = await legeMesskanalAn(zaehlerId, { messgroesse: 'volumen', einheit: 'm3', art: 'intervall_verbrauch' });
      const standortId = await legeStandortAn(endkundeId, { typ: 'liegenschaft', bezeichnung: 'Monat-Standort', adresse: 'Weg 7' });
      await veorteZaehler(zaehlerId, standortId, '2026-01-01T00:00:00.000Z');

      await insertMesswert(messkanalId, '2026-03-05T00:00:00.000Z', 4);
      await insertMesswert(messkanalId, '2026-03-20T00:00:00.000Z', 6);

      const { status, body } = await holeVerbrauch(standortId, {
        von: '2026-03-01T00:00:00.000Z',
        bis: '2026-04-01T00:00:00.000Z',
        aufloesung: 'monat',
      });

      expect(status).toBe(200);
      const zeitreihe = body['zeitreihe'] as { wert: number }[];
      expect(zeitreihe).toHaveLength(1);
      expect(zeitreihe[0]?.wert).toBe(10);
    });

    it('lehnt ab (400), wenn von nicht VOR bis liegt', async () => {
      const endkundeId = await legeEndkundeAn('UngueltigesFenster');
      const standortId = await legeStandortAn(endkundeId, { typ: 'liegenschaft', bezeichnung: 'X', adresse: 'Y' });

      const response = await holeVerbrauch(standortId, {
        von: '2026-03-02T00:00:00.000Z',
        bis: '2026-03-01T00:00:00.000Z',
        aufloesung: 'tag',
      });
      expect(response.status).toBe(400);
    });

    it('lehnt ab (404), wenn der Standort nicht existiert', async () => {
      const response = await holeVerbrauch(randomUUID(), {
        von: '2026-03-01T00:00:00.000Z',
        bis: '2026-03-02T00:00:00.000Z',
        aufloesung: 'tag',
      });
      expect(response.status).toBe(404);
    });
  });

  describe('ABAC-Matrix — Route A (read:verbrauch_aggregat, KEIN break-glass)', () => {
    it('anonym (kein Token) -> 401', async () => {
      const response = await request(testApp.httpServer)
        .get(`/messwerte/standorte/${randomUUID()}/verbrauch`)
        .query({ von: '2026-03-01T00:00:00.000Z', bis: '2026-03-02T00:00:00.000Z', aufloesung: 'tag' });
      expect(response.status).toBe(401);
    });

    it('betrieb -> 200 (Referenz-Happy-Path, keine Zweckpflicht)', async () => {
      const endkundeId = await legeEndkundeAn('ABACBetriebAggregat');
      const standortId = await legeStandortAn(endkundeId, { typ: 'liegenschaft', bezeichnung: 'X', adresse: 'Y' });
      const { status } = await holeVerbrauch(standortId, { von: '2026-03-01T00:00:00.000Z', bis: '2026-03-02T00:00:00.000Z', aufloesung: 'tag' });
      expect(status).toBe(200);
    });

    it('compliance-auditor -> 200 (aggregiert/PII-frei, analog read:monitoring — KEIN Detailverbrauch)', async () => {
      const endkundeId = await legeEndkundeAn('ABACAuditorAggregat');
      const standortId = await legeStandortAn(endkundeId, { typ: 'liegenschaft', bezeichnung: 'X', adresse: 'Y' });
      const { status } = await holeVerbrauch(
        standortId,
        { von: '2026-03-01T00:00:00.000Z', bis: '2026-03-02T00:00:00.000Z', aufloesung: 'tag' },
        auditorToken,
      );
      expect(status).toBe(200);
    });

    it('admin -> 403 (admin ist KEINE Stammdaten-/Betriebs-Rolle)', async () => {
      const endkundeId = await legeEndkundeAn('ABACAdminAggregat');
      const standortId = await legeStandortAn(endkundeId, { typ: 'liegenschaft', bezeichnung: 'X', adresse: 'Y' });
      const { status } = await holeVerbrauch(
        standortId,
        { von: '2026-03-01T00:00:00.000Z', bis: '2026-03-02T00:00:00.000Z', aufloesung: 'tag' },
        adminToken,
      );
      expect(status).toBe(403);
    });
  });

  describe('Route B — Roh-Zeitreihe je Messkanal (read:verbrauch_detail, break-glass wiederverwendet)', () => {
    async function holeZeitreihe(
      messkanalId: string,
      query: Record<string, string>,
      token: string,
      zweckHeader?: { zweckCode: string; zaehlerId: string; von: string; bis: string },
    ): Promise<{ status: number; body: unknown }> {
      const req = request(testApp.httpServer)
        .get(`/messwerte/messkanaele/${messkanalId}`)
        .query(query)
        .set('Authorization', `Bearer ${token}`);
      if (zweckHeader !== undefined) {
        req
          .set('X-Edms-Zugriffszweck', zweckHeader.zweckCode)
          .set('X-Edms-Zugriffszweck-Zaehler-Id', zweckHeader.zaehlerId)
          .set('X-Edms-Zugriffszweck-Von', zweckHeader.von)
          .set('X-Edms-Zugriffszweck-Bis', zweckHeader.bis);
      }
      const response = await req;
      return { status: response.status, body: response.body as unknown };
    }

    it('betrieb OHNE Zweck-Header -> 403 (break_glass_erforderlich, deny by default)', async () => {
      const endkundeId = await legeEndkundeAn('DetailOhneZweck');
      const zaehlerId = await legeZaehlerAn(endkundeId, 'DetailOhneZweck');
      const messkanalId = await legeMesskanalAn(zaehlerId, { messgroesse: 'wirkarbeit', einheit: 'kWh', art: 'kumulativ_zaehlerstand' });

      const { status } = await holeZeitreihe(
        messkanalId,
        { von: '2026-03-01T00:00:00.000Z', bis: '2026-03-02T00:00:00.000Z' },
        betriebToken,
      );
      expect(status).toBe(403);
    });

    it('betrieb MIT vollständigem, whitelisted, fenster-konformem Zweck -> 200, liefert Rohwerte inkl. qualitaet/herkunft, auditiert (permit)', async () => {
      const endkundeId = await legeEndkundeAn('DetailMitZweck');
      const zaehlerId = await legeZaehlerAn(endkundeId, 'DetailMitZweck');
      const messkanalId = await legeMesskanalAn(zaehlerId, { messgroesse: 'wirkarbeit', einheit: 'kWh', art: 'kumulativ_zaehlerstand' });
      await insertMesswert(messkanalId, '2026-03-01T10:00:00.000Z', 42, 0, 0);

      const { status, body } = await holeZeitreihe(
        messkanalId,
        { von: '2026-03-01T00:00:00.000Z', bis: '2026-03-02T00:00:00.000Z' },
        betriebToken,
        {
          zweckCode: 'stoerungsdiagnose',
          zaehlerId,
          von: '2026-03-01T00:00:00.000Z',
          bis: '2026-03-02T00:00:00.000Z',
        },
      );

      expect(status).toBe(200);
      expect(body).toMatchObject({
        messkanalId,
        messgroesse: 'wirkarbeit',
        einheit: 'kWh',
        art: 'kumulativ_zaehlerstand',
        werte: [expect.objectContaining({ wert: 42, qualitaet: 'gemessen', herkunft: 'ingest_live' })],
      });
      const werte = (body as { werte: { ts: string }[] }).werte;
      expect(typeof werte[0]?.ts).toBe('string');

      const auditRows = await dbClient.query(
        "SELECT ergebnis, kontext FROM audit.event WHERE event_typ = 'stammdaten.verbrauch_detail.einsicht' AND objekt_ref = $1",
        [messkanalId],
      );
      expect(auditRows.rowCount).toBe(1);
      const row = auditRows.rows[0] as { ergebnis: string; kontext: Record<string, unknown> };
      expect(row.ergebnis).toBe('ok');
      expect(row.kontext['zweck_code']).toBe('stoerungsdiagnose');
      expect(row.kontext['zaehler_ref']).toBe(zaehlerId);
      expect(row.kontext['fenster_tage']).toBe(1);
    });

    it('betrieb MIT nicht-whitelisted Zweck-Code -> 403 (zweck_fehlt), auditiert als denied', async () => {
      const endkundeId = await legeEndkundeAn('DetailUngueltigerZweck');
      const zaehlerId = await legeZaehlerAn(endkundeId, 'DetailUngueltigerZweck');
      const messkanalId = await legeMesskanalAn(zaehlerId, { messgroesse: 'wirkarbeit', einheit: 'kWh', art: 'kumulativ_zaehlerstand' });

      const { status } = await holeZeitreihe(
        messkanalId,
        { von: '2026-03-01T00:00:00.000Z', bis: '2026-03-02T00:00:00.000Z' },
        betriebToken,
        { zweckCode: 'neugier', zaehlerId, von: '2026-03-01T00:00:00.000Z', bis: '2026-03-02T00:00:00.000Z' },
      );
      expect(status).toBe(403);

      const auditRows = await dbClient.query(
        "SELECT ergebnis FROM audit.event WHERE event_typ = 'stammdaten.verbrauch_detail.einsicht' AND objekt_ref = $1",
        [messkanalId],
      );
      expect(auditRows.rowCount).toBe(1);
      expect((auditRows.rows[0] as { ergebnis: string }).ergebnis).toBe('denied');
    });

    it('betrieb MIT überzogenem Zeitfenster (> MAX_FENSTER_TAGE) -> 403 (break_glass_grenzen_verletzt)', async () => {
      const endkundeId = await legeEndkundeAn('DetailZuGrossesFenster');
      const zaehlerId = await legeZaehlerAn(endkundeId, 'DetailZuGrossesFenster');
      const messkanalId = await legeMesskanalAn(zaehlerId, { messgroesse: 'wirkarbeit', einheit: 'kWh', art: 'kumulativ_zaehlerstand' });

      const { status } = await holeZeitreihe(
        messkanalId,
        { von: '2026-03-01T00:00:00.000Z', bis: '2026-03-20T00:00:00.000Z' },
        betriebToken,
        { zweckCode: 'stoerungsdiagnose', zaehlerId, von: '2026-03-01T00:00:00.000Z', bis: '2026-03-20T00:00:00.000Z' },
      );
      expect(status).toBe(403);
    });

    it('compliance-auditor MIT vollständigem Zweck -> 200 (derselbe auditierte break-glass-Pfad, KEIN Dauerrecht, ADR-0008 §6.5)', async () => {
      const endkundeId = await legeEndkundeAn('DetailAuditor');
      const zaehlerId = await legeZaehlerAn(endkundeId, 'DetailAuditor');
      const messkanalId = await legeMesskanalAn(zaehlerId, { messgroesse: 'wirkarbeit', einheit: 'kWh', art: 'kumulativ_zaehlerstand' });

      const { status } = await holeZeitreihe(
        messkanalId,
        { von: '2026-03-01T00:00:00.000Z', bis: '2026-03-02T00:00:00.000Z' },
        auditorToken,
        { zweckCode: 'stoerungsdiagnose', zaehlerId, von: '2026-03-01T00:00:00.000Z', bis: '2026-03-02T00:00:00.000Z' },
      );
      expect(status).toBe(200);
    });

    it('anonym (kein Token) -> 401', async () => {
      const response = await request(testApp.httpServer)
        .get(`/messwerte/messkanaele/${randomUUID()}`)
        .query({ von: '2026-03-01T00:00:00.000Z', bis: '2026-03-02T00:00:00.000Z' });
      expect(response.status).toBe(401);
    });

    it('admin -> 403 (admin ist KEINE Stammdaten-/Betriebs-Rolle) — VOR jeder break-glass-Prüfung', async () => {
      const { status } = await holeZeitreihe(
        randomUUID(),
        { von: '2026-03-01T00:00:00.000Z', bis: '2026-03-02T00:00:00.000Z' },
        adminToken,
      );
      expect(status).toBe(403);
    });

    it('nicht existierender Messkanal -> 403 (NICHT 404): resolveViaMesskanal() liefert resource===undefined, die break-glass-Deny-by-default-Regel (PDP-Blocker 2, ADR-0008 §16) greift VOR jedem Service-Aufruf — dieselbe, bereits etablierte Reihenfolge wie bei jeder anderen break-glass-Ressource (kein Informations-Leck, ob eine ID existiert)', async () => {
      const fremderZaehler = randomUUID();
      const { status } = await holeZeitreihe(
        randomUUID(),
        { von: '2026-03-01T00:00:00.000Z', bis: '2026-03-02T00:00:00.000Z' },
        betriebToken,
        { zweckCode: 'stoerungsdiagnose', zaehlerId: fremderZaehler, von: '2026-03-01T00:00:00.000Z', bis: '2026-03-02T00:00:00.000Z' },
      );
      expect(status).toBe(403);
    });
  });
});
