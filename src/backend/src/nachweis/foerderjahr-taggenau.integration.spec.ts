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
import { scheibenDesFoerderjahres } from './zeit.util';

/**
 * Taggenaue Förderjahre und der GETEILTE MONAT (V0070/V0071).
 *
 * **Worum es geht.** Ein Förderjahr aus dem Bewilligungsbescheid beginnt
 * selten am Monatsersten. Zwei aufeinanderfolgende teilen sich damit einen
 * Kalendermonat: Das eine endet am 11.10., das nächste beginnt am 12.10.
 * Solange die Bindung nur den Monatsersten kannte, fand das ZWEITE Förderjahr
 * für „Oktober" den Berechnungslauf des ERSTEN — und rechnete elf fremde Tage
 * mit, ohne dass irgendetwas rot wurde.
 *
 * Das Technische Merkblatt v2.2 verlangt in Kap. 9.1 ausdrücklich, die
 * Einsparung zeitanteilig zu ermitteln, wenn der relevante Zeitraum kleiner
 * ist als das Förderjahr. Genau das prüft dieser Test an der Stelle, an der
 * es vorher schiefging.
 */
describe('Foerderjahr taggenau — geteilter Monat (V0070)', () => {
  let testApp: StammdatenTestApp;
  let dbClient: Client;
  let betriebToken: string;

  beforeAll(async () => {
    testApp = await startStammdatenTestApp();
    dbClient = new Client({ connectionString: testApp.container.getConnectionUri() });
    await dbClient.connect();
    betriebToken = await testApp.signToken('betrieb-taggenau', ['betrieb']);
  }, 180_000);

  afterAll(async () => {
    await dbClient?.end().catch(() => undefined);
    await stopStammdatenTestApp(testApp);
  });

  /** Ein Jahr Tagesverbräuche als kumulative Zählerstände ab `abTag`. */
  async function legeMessreiheAn(systemId: string, abTag: string, tage: number): Promise<void> {
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

    const keyZeile = await dbClient.query<{ kanal_key: number }>(
      'SELECT kanal_key FROM energy.messkanal WHERE id = $1',
      [(kanal.body as { id: string }).id],
    );
    await dbClient.query(
      `INSERT INTO measurement.messwert (messkanal_key, ts, wert, qualitaet, herkunft)
       SELECT $1, ($2::date + (n || ' days')::interval)::timestamptz, (n + 1) * 50, 0, 0
         FROM generate_series(0, $3::int) AS n`,
      [keyZeile.rows[0]!.kanal_key, abTag, tage],
    );
  }

  it('zerlegt ein Foerderjahr vom 12.10. bis 11.10. in 13 Scheiben mit 365 Tagen', () => {
    const scheiben = scheibenDesFoerderjahres('2018-10-12', '2019-10-12');

    expect(scheiben).toHaveLength(13);
    expect(scheiben.reduce((summe, s) => summe + s.tageImZeitraum, 0)).toBe(365);
  });

  it('bindet den geteilten Oktober an den RICHTIGEN Lauf — je Foerderjahr an seinen eigenen', async () => {
    const endkundeId = await legeEndkundeAn(testApp, betriebToken, `TAG-${randomUUID().slice(0, 8)}`);
    const systemId = await legeSystemAn(testApp, betriebToken, endkundeId, 'Halle');
    const mvetId = await legeMvetAn(testApp, betriebToken, dbClient, endkundeId, { baselineWert: 20_000 });
    await verknuepfeMvetMitSystem(dbClient, mvetId, systemId);
    await legeMessreiheAn(systemId, '2020-09-30', 800);

    // Zwei Foerderjahre, die sich den Oktober 2021 teilen.
    const antwortFj1 = await starteBerechnungslauf(
      testApp,
      betriebToken,
      berechnungslaufBody(endkundeId, mvetId, 2020, { periodeVon: '2020-10-12', periodeBis: '2021-10-12' }),
    );
    const antwortFj2 = await starteBerechnungslauf(
      testApp,
      betriebToken,
      berechnungslaufBody(endkundeId, mvetId, 2021, { periodeVon: '2021-10-12', periodeBis: '2022-10-12' }),
    );

    expect(antwortFj1.status).toBe(201);
    expect(antwortFj2.status).toBe(201);
    const laufFj1 = antwortFj1.body['id'] as string;
    const laufFj2 = antwortFj2.body['id'] as string;

    const oktoberFj1 = scheibenDesFoerderjahres('2020-10-12', '2021-10-12').find((s) => s.monat === '2021-10-01');
    const oktoberFj2 = scheibenDesFoerderjahres('2021-10-12', '2022-10-12').find((s) => s.monat === '2021-10-01');

    // Derselbe Kalendermonat, zwei verschiedene Zeitraeume.
    expect(oktoberFj1).toMatchObject({ von: '2021-10-01', bis: '2021-10-12' });
    expect(oktoberFj2).toMatchObject({ von: '2021-10-12', bis: '2021-11-01' });

    const kandidatenFj1 = await mitTransaktion(testApp, () =>
      testApp.app.get(AnalyticsLaufLookupRepository).findKandidatenFuerScheibe(endkundeId, 'gas', oktoberFj1!),
    );
    const kandidatenFj2 = await mitTransaktion(testApp, () =>
      testApp.app.get(AnalyticsLaufLookupRepository).findKandidatenFuerScheibe(endkundeId, 'gas', oktoberFj2!),
    );

    // GENAU EIN Kandidat je Scheibe — und je der eigene Lauf.
    expect(kandidatenFj1.map((k) => k.berechnungslaufId)).toEqual([laufFj1]);
    expect(kandidatenFj2.map((k) => k.berechnungslaufId)).toEqual([laufFj2]);
  }, 120_000);

  it('haelt den geteilten Monat von der MONATLICHEN Nutzerinformation fern', async () => {
    // Der Nachweis will die angeschnittene Scheibe (Kap. 9.1, zeitanteilig).
    // Die monatliche Information (TB-06) will den GANZEN Monat — bekaeme sie
    // die Scheibe, meldete sie dem Kunden elf Tage Verbrauch als Monatswert.
    // Nach der Zustellung wird das nicht mehr korrigiert.
    const endkundeId = await legeEndkundeAn(testApp, betriebToken, `NUI-${randomUUID().slice(0, 8)}`);
    const systemId = await legeSystemAn(testApp, betriebToken, endkundeId, 'Halle');
    const mvetId = await legeMvetAn(testApp, betriebToken, dbClient, endkundeId, { baselineWert: 20_000 });
    await verknuepfeMvetMitSystem(dbClient, mvetId, systemId);
    await legeMessreiheAn(systemId, '2020-09-30', 800);

    await starteBerechnungslauf(
      testApp,
      betriebToken,
      berechnungslaufBody(endkundeId, mvetId, 2020, { periodeVon: '2020-10-12', periodeBis: '2021-10-12' }),
    );

    const lookup = testApp.app.get(AnalyticsLaufLookupRepository);

    // Oktober 2021 ist im Lauf nur bis zum 11. enthalten — kein Kandidat.
    const geteilterMonat = await mitTransaktion(testApp, () =>
      lookup.findKandidatenFuerMonat(endkundeId, 'gas', '2021-10-01'),
    );
    expect(geteilterMonat).toHaveLength(0);

    // Ein voller Monat mitten im Zeitraum bleibt selbstverstaendlich nutzbar.
    const vollerMonat = await mitTransaktion(testApp, () =>
      lookup.findKandidatenFuerMonat(endkundeId, 'gas', '2021-03-01'),
    );
    expect(vollerMonat).toHaveLength(1);
  }, 120_000);

  it('rechnet die beiden Oktober-Anteile zeitanteilig — zusammen ergeben sie den vollen Monat', async () => {
    const endkundeId = await legeEndkundeAn(testApp, betriebToken, `ANT-${randomUUID().slice(0, 8)}`);
    const systemId = await legeSystemAn(testApp, betriebToken, endkundeId, 'Halle');
    const mvetId = await legeMvetAn(testApp, betriebToken, dbClient, endkundeId, { baselineWert: 20_000 });
    await verknuepfeMvetMitSystem(dbClient, mvetId, systemId);
    await legeMessreiheAn(systemId, '2020-09-30', 800);

    await starteBerechnungslauf(
      testApp,
      betriebToken,
      berechnungslaufBody(endkundeId, mvetId, 2020, {
        periodeVon: '2020-10-12',
        periodeBis: '2021-10-12',
        grundlastAnteil: 1,
        gtzBaseOverride: undefined,
      }),
    );
    await starteBerechnungslauf(
      testApp,
      betriebToken,
      berechnungslaufBody(endkundeId, mvetId, 2021, {
        periodeVon: '2021-10-12',
        periodeBis: '2022-10-12',
        grundlastAnteil: 1,
        gtzBaseOverride: undefined,
      }),
    );

    const zeilen = await dbClient.query<{ tage_gesamt: number; referenz_kwh: string }>(
      `SELECT le.tage_gesamt, le.referenz_kwh
         FROM analytics.laufergebnis le
         JOIN analytics.berechnungslauf bl ON bl.id = le.lauf_id
        WHERE bl.endkunde_id = $1 AND le.monat = '2021-10-01'
        ORDER BY le.tage_gesamt`,
      [endkundeId],
    );

    expect(zeilen.rows.map((r) => r.tage_gesamt)).toEqual([11, 20]);
    // 11 + 20 = 31 — kein Tag doppelt, keiner verloren.
    expect(zeilen.rows.reduce((s, r) => s + r.tage_gesamt, 0)).toBe(31);
    // Und die Referenz folgt den Tagen: reine Grundlast, 20 000 kWh/a.
    expect(Number(zeilen.rows[0]?.referenz_kwh)).toBeCloseTo(20_000 * (11 / 365.25), 2);
    expect(Number(zeilen.rows[1]?.referenz_kwh)).toBeCloseTo(20_000 * (20 / 365.25), 2);
  }, 120_000);
});
