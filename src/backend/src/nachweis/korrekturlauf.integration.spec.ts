import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import request from 'supertest';
import type { StammdatenTestApp } from '../stammdaten/test-support/stammdaten-test-app';
import { startStammdatenTestApp, stopStammdatenTestApp } from '../stammdaten/test-support/stammdaten-test-app';
import {
  berechnungslaufBody,
  idempotencyKey,
  legeEndkundeAn,
  legeMvetAn,
  legeSystemAn,
  mitTransaktion,
  starteBerechnungslauf,
  verknuepfeMvetMitSystem,
} from './test-support/nachweis-test-fixtures';
import { AnalyticsLaufLookupRepository } from './persistence/analytics-lauf-lookup.repository';

/**
 * **Der Weg, einen falsch gerechneten Lauf zu korrigieren.**
 *
 * V0019 legt die Regel fest: maßgeblich ist „der jüngste Lauf je
 * Bezugsobjekt+Periode, DER SELBST NICHT ERSETZT WURDE". Ein Korrekturlauf
 * entsteht, indem man einen neuen Lauf mit `ersetztLaufId` auf den alten
 * anlegt — die Referenz steht dabei am NEUEN Lauf und zeigt auf den alten.
 *
 * Genau daran scheiterte die Auswahl: Sie filterte
 * `bl.ersetzt_lauf_id IS NULL`, also „dieser Lauf ersetzt selbst keinen
 * anderen". Das ist die Umkehrung der Regel — es behielt jeden ÜBERHOLTEN
 * Lauf und schloss jede KORREKTUR aus. Ein falsch gerechneter, bereits in
 * einen Nachweis gebundener Lauf ließ sich damit nicht richtigstellen: Der
 * neue Lauf entstand, wurde quittiert, und blieb ohne jede Wirkung.
 *
 * Diese Datei hält beide Seiten fest — die Auswahl selbst und ihre Folge in
 * der Nachweis-Bindung.
 */
describe('Korrekturlauf — der ersetzte Lauf verliert, der Korrekturlauf gewinnt', () => {
  let testApp: StammdatenTestApp;
  let dbClient: Client;
  let betriebToken: string;

  /*
    FESTES, VERGANGENES Jahr statt `neuesTestJahr()`: Dessen Zähler beginnt
    bei 2030, und die Monatsinformation weist einen noch nicht abgeschlossenen
    Monat zu Recht ab („nach der Zustellung wird nicht mehr korrigiert").
    Kollisionsfrei ist das trotzdem — jede Spec-Datei bekommt einen eigenen
    Container.
  */
  const JAHR = 2023;
  const JANUAR = `${String(JAHR)}-01-01`;

  beforeAll(async () => {
    testApp = await startStammdatenTestApp();
    dbClient = new Client({ connectionString: testApp.container.getConnectionUri() });
    await dbClient.connect();
    betriebToken = await testApp.signToken('betrieb-korrektur', ['betrieb']);
  }, 180_000);

  afterAll(async () => {
    await dbClient?.end().catch(() => undefined);
    await stopStammdatenTestApp(testApp);
  });

  /** Kumulative Zählerstände im Januar; `kwhProTag` bestimmt den Ist-Verbrauch. */
  async function legeMessreiheAn(endkundeId: string, systemId: string, kwhProTag: number): Promise<void> {
    const zaehler = await request(testApp.httpServer)
      .post('/stammdaten/zaehler')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ systemId, geraetetyp: 'Testzaehler', energietraeger: 'gas' });
    expect(zaehler.status).toBe(201);

    const kanal = await request(testApp.httpServer)
      .post(`/stammdaten/zaehler/${(zaehler.body as { id: string }).id}/messkanaele`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ messgroesse: 'wirkarbeit', einheit: 'kWh', art: 'kumulativ_zaehlerstand' });
    expect(kanal.status).toBe(201);

    const keyZeile = await dbClient.query<{ kanal_key: number }>('SELECT kanal_key FROM energy.messkanal WHERE id = $1', [
      (kanal.body as { id: string }).id,
    ]);
    // Vom 31.12. an, damit der 1. Januar seinen Vorwert hat.
    await dbClient.query(
      `INSERT INTO measurement.messwert (messkanal_key, ts, wert, qualitaet, herkunft)
       SELECT $1, ($2::date + (n || ' days')::interval)::timestamptz, (n + 1) * $3, 0, 0
         FROM generate_series(0, 31) AS n`,
      [keyZeile.rows[0]!.kanal_key, `${String(JAHR - 1)}-12-31`, kwhProTag],
    );
  }

  it('wählt den Korrekturlauf und nicht mehr den ersetzten — und bindet ihn in den Nachweis', async () => {
    const endkundeId = await legeEndkundeAn(testApp, betriebToken, `KORR-${randomUUID().slice(0, 8)}`);
    const systemId = await legeSystemAn(testApp, betriebToken, endkundeId, 'Halle');
    const mvetId = await legeMvetAn(testApp, betriebToken, dbClient, endkundeId, { baselineWert: 20_000 });
    await verknuepfeMvetMitSystem(dbClient, mvetId, systemId);

    // --- Erster Lauf: 31 × 100 kWh ---
    await legeMessreiheAn(endkundeId, systemId, 100);
    const ersterLauf = await starteBerechnungslauf(
      testApp,
      betriebToken,
      berechnungslaufBody(endkundeId, mvetId, JAHR, { periodeVon: JANUAR, periodeBis: `${String(JAHR)}-02-01` }),
    );
    expect(ersterLauf.status).toBe(201);
    const ersterLaufId = ersterLauf.body['id'] as string;

    // --- Die Zahlen waren falsch: ein zweiter Zähler gehörte dazu ---
    await legeMessreiheAn(endkundeId, systemId, 40);
    const korrekturLauf = await starteBerechnungslauf(
      testApp,
      betriebToken,
      berechnungslaufBody(endkundeId, mvetId, JAHR, {
        periodeVon: JANUAR,
        periodeBis: `${String(JAHR)}-02-01`,
        ersetztLaufId: ersterLaufId,
      }),
    );
    expect(korrekturLauf.status, JSON.stringify(korrekturLauf.body)).toBe(201);
    const korrekturLaufId = korrekturLauf.body['id'] as string;

    // Die Korrektur trägt die Referenz auf den ersetzten Lauf, nicht umgekehrt.
    const referenz = await dbClient.query<{ ersetzt_lauf_id: string | null }>(
      'SELECT ersetzt_lauf_id FROM analytics.berechnungslauf WHERE id = $1',
      [korrekturLaufId],
    );
    expect(referenz.rows[0]?.ersetzt_lauf_id).toBe(ersterLaufId);

    // --- Die Auswahl: der Korrekturlauf gewinnt, der ersetzte ist raus ---
    const kandidaten = await mitTransaktion(testApp, () =>
      testApp.app.get(AnalyticsLaufLookupRepository).findKandidatenFuerMonat(endkundeId, 'gas', JANUAR),
    );

    expect(kandidaten.map((kandidat) => kandidat.berechnungslaufId)).toEqual([korrekturLaufId]);
    // 31 × 140 kWh statt 31 × 100 — die korrigierte Zahl, nicht die alte.
    expect(kandidaten[0]?.istKwh).toBeCloseTo(31 * 140, 3);
  });

  it('trägt die Korrektur bis in den Monatsbericht des Kunden', async () => {
    // Die zweite Strecke mit demselben Prädikat: Die Monatsinformation wählt
    // ihre Kandidatenpaare nach derselben Regel. Ohne den Anti-Join bekäme
    // der Kunde die überholte Zahl zugestellt — und die Auflage wäre mit
    // einer falschen Angabe erfüllt.
    const endkundeId = await legeEndkundeAn(testApp, betriebToken, `MB-${randomUUID().slice(0, 8)}`);
    const systemId = await legeSystemAn(testApp, betriebToken, endkundeId, 'Halle');
    const mvetId = await legeMvetAn(testApp, betriebToken, dbClient, endkundeId, { baselineWert: 20_000 });
    await verknuepfeMvetMitSystem(dbClient, mvetId, systemId);
    await legeMessreiheAn(endkundeId, systemId, 100);

    const ersterLauf = await starteBerechnungslauf(
      testApp,
      betriebToken,
      berechnungslaufBody(endkundeId, mvetId, JAHR, { periodeVon: JANUAR, periodeBis: `${String(JAHR)}-02-01` }),
    );
    expect(ersterLauf.status).toBe(201);

    await legeMessreiheAn(endkundeId, systemId, 40);
    const korrektur = await starteBerechnungslauf(
      testApp,
      betriebToken,
      berechnungslaufBody(endkundeId, mvetId, JAHR, {
        periodeVon: JANUAR,
        periodeBis: `${String(JAHR)}-02-01`,
        ersetztLaufId: ersterLauf.body['id'] as string,
      }),
    );
    expect(korrektur.status).toBe(201);

    const lauf = await request(testApp.httpServer)
      .post('/nutzerinfo/laeufe')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ monat: JANUAR, ausfuehren: true });
    expect(lauf.status, JSON.stringify(lauf.body)).toBe(200);

    const liste = await request(testApp.httpServer)
      .get('/nutzerinfo/informationen')
      .query({ endkundeId })
      .set('Authorization', `Bearer ${betriebToken}`);
    expect(liste.status).toBe(200);
    const januarInfo = (liste.body as { id: string; monat: string }[]).find((eintrag) => eintrag.monat === JANUAR);
    expect(januarInfo, JSON.stringify(liste.body)).toBeDefined();

    const bericht = await request(testApp.httpServer)
      .get(`/nutzerinfo/informationen/${januarInfo!.id}`)
      .set('Authorization', `Bearer ${betriebToken}`);
    expect(bericht.status).toBe(200);
    // 31 × 140 kWh — die korrigierte Zahl. Ohne den Anti-Join stünden hier
    // 31 × 100 aus dem ersetzten Lauf.
    expect((bericht.body as { istKwh: number }).istKwh).toBeCloseTo(31 * 140, 3);
    expect((bericht.body as { berechnungslaufId: string }).berechnungslaufId).toBe(korrektur.body['id']);
  });
  it('rechnet einen Lauf ueber die Neuberechnungs-Route mit UNVERAENDERTEN Parametern neu', async () => {
    // Der Einstieg in die Korrektur. Er nimmt keine Rechenparameter entgegen:
    // Wer korrigiert, soll nichts anderes rechnen koennen als das Original.
    const endkundeId = await legeEndkundeAn(testApp, betriebToken, `NB-${randomUUID().slice(0, 8)}`);
    const systemId = await legeSystemAn(testApp, betriebToken, endkundeId, 'Halle');
    const mvetId = await legeMvetAn(testApp, betriebToken, dbClient, endkundeId, { baselineWert: 20_000 });
    await verknuepfeMvetMitSystem(dbClient, mvetId, systemId);
    await legeMessreiheAn(endkundeId, systemId, 100);

    const original = await starteBerechnungslauf(
      testApp,
      betriebToken,
      berechnungslaufBody(endkundeId, mvetId, JAHR, { periodeVon: JANUAR, periodeBis: `${String(JAHR)}-02-01` }),
    );
    expect(original.status).toBe(201);
    const originalId = original.body['id'] as string;

    // Die Datenlage aendert sich — ein Kanal gehoerte dazu.
    await legeMessreiheAn(endkundeId, systemId, 40);

    const neu = await request(testApp.httpServer)
      .post(`/berechnung/laeufe/${originalId}/neuberechnung`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({});
    expect(neu.status, JSON.stringify(neu.body)).toBe(201);

    const neuerLauf = neu.body as {
      id: string;
      ersetztLaufId: string | null;
      ausloeser: string;
      grundlastAnteil: number;
      gtzBase: number;
      periodeVon: string;
      ergebnisse: { istKwh: number }[];
    };
    expect(neuerLauf.ersetztLaufId).toBe(originalId);
    expect(neuerLauf.ausloeser).toBe('nachlauf_korrektur');

    // Parameter unveraendert uebernommen ...
    const alt = original.body as { grundlastAnteil: number; gtzBase: number; periodeVon: string };
    expect(neuerLauf.grundlastAnteil).toBe(alt.grundlastAnteil);
    expect(neuerLauf.gtzBase).toBe(alt.gtzBase);
    expect(neuerLauf.periodeVon).toBe(alt.periodeVon);

    // ... nur die Zahl ist neu.
    expect(neuerLauf.ergebnisse[0]?.istKwh).toBeCloseTo(31 * 140, 3);
  });

  it('lehnt die Korrektur eines bereits ersetzten Laufs ab', async () => {
    // Sonst haette ein Original zwei Nachfolger, und beide waeren nach der
    // Auswahlregel "nicht ersetzt" — die Korrektur gehoert an den juengsten.
    const endkundeId = await legeEndkundeAn(testApp, betriebToken, `DOPPELT-${randomUUID().slice(0, 8)}`);
    const systemId = await legeSystemAn(testApp, betriebToken, endkundeId, 'Halle');
    const mvetId = await legeMvetAn(testApp, betriebToken, dbClient, endkundeId, { baselineWert: 20_000 });
    await verknuepfeMvetMitSystem(dbClient, mvetId, systemId);
    await legeMessreiheAn(endkundeId, systemId, 100);

    const original = await starteBerechnungslauf(
      testApp,
      betriebToken,
      berechnungslaufBody(endkundeId, mvetId, JAHR, { periodeVon: JANUAR, periodeBis: `${String(JAHR)}-02-01` }),
    );
    const originalId = original.body['id'] as string;

    const ersteKorrektur = await request(testApp.httpServer)
      .post(`/berechnung/laeufe/${originalId}/neuberechnung`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({});
    expect(ersteKorrektur.status).toBe(201);

    const zweiteKorrektur = await request(testApp.httpServer)
      .post(`/berechnung/laeufe/${originalId}/neuberechnung`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({});
    expect(zweiteKorrektur.status).toBe(409);
  });
});
