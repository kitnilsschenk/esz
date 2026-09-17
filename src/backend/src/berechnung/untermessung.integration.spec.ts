import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StammdatenTestApp } from '../stammdaten/test-support/stammdaten-test-app';
import { startStammdatenTestApp, stopStammdatenTestApp } from '../stammdaten/test-support/stammdaten-test-app';
import {
  berechnungslaufBody,
  idempotencyKey,
  legeEndkundeAn,
  legeMvetAn,
  legeSystemAn,
  starteBerechnungslauf,
} from '../nachweis/test-support/nachweis-test-fixtures';

/**
 * Untermessungen in der Einsparberechnung (V0058).
 *
 * **Der Fehler, den dieser Test festhält.** Die Einsparberechnung summierte
 * ALLE aktiven Messkanäle der Zähler eines Systems. Misst ein Kanal eine
 * Untermessung — also einen TEIL dessen, was die Hauptmessung ohnehin schon
 * erfasst —, zählte sie denselben Strom mehrfach. Der Ist-Verbrauch fiel
 * dadurch zu hoch aus und die ausgewiesene Einsparung zu niedrig; bei einem
 * Demo-Bestand mit einer Hauptmessung und zwei Untermessungen kippte sie
 * trotz 12 Prozent WENIGER Verbrauch auf MINUS 18 154 kWh.
 *
 * **Warum keine bestehende Prüfung das gefunden hat.** Sämtliche Fixtures
 * legten je System genau EINEN Messkanal an. Bei einem Kanal ist die Summe
 * über alle Kanäle richtig — der Fehler ist erst ab dem zweiten sichtbar, und
 * zwar nur, wenn der zweite eine Teilmenge des ersten misst. Genau diese
 * Konstellation baut dieser Test.
 *
 * Die Messwerte werden direkt geschrieben: Geprüft wird, was die Berechnung
 * AUS ihnen macht, nicht der Ingest-Weg (der hat seinen eigenen Test).
 */
describe('Untermessung in der Einsparberechnung — Integrationstests (V0058)', () => {
  let testApp: StammdatenTestApp;
  let betriebToken: string;
  let dbClient: Client;

  /** Testjahr in der Vergangenheit — der Lauf rechnet ueber abgeschlossene Monate. */
  const JAHR = 2024;

  beforeAll(async () => {
    testApp = await startStammdatenTestApp();
    betriebToken = await testApp.signToken('betrieb-sub', ['betrieb']);
    dbClient = new Client({ connectionString: testApp.container.getConnectionUri() });
    await dbClient.connect();
  }, 180_000);

  afterAll(async () => {
    await dbClient?.end().catch(() => undefined);
    await stopStammdatenTestApp(testApp);
  });

  async function legeKanalAn(systemId: string, istUntermessung: boolean): Promise<number> {
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
      .send({ messgroesse: 'Wirkarbeit', einheit: 'kWh', art: 'kumulativ_zaehlerstand', istUntermessung });
    expect(kanal.status).toBe(201);

    const keyRow = await dbClient.query('SELECT kanal_key FROM energy.messkanal WHERE id = $1', [
      (kanal.body as { id: string }).id,
    ]);
    return (keyRow.rows[0] as { kanal_key: number }).kanal_key;
  }

  /** Kumulative Zaehlerstaende: `tage` Tageswerte ab `abTag`, je `kwhProTag` Zuwachs. */
  async function schreibeMesswerte(
    kanalKey: number,
    abTag: string,
    tage: number,
    kwhProTag: number,
  ): Promise<void> {
    await dbClient.query(
      `INSERT INTO measurement.messwert (messkanal_key, ts, wert, qualitaet, herkunft)
       SELECT $1,
              ($2::date + (n || ' days')::interval)::timestamptz,
              (n + 1) * $4,
              0, 0
         FROM generate_series(0, $3::int - 1) AS n`,
      [kanalKey, abTag, tage, kwhProTag],
    );
  }

  interface Monatszeile {
    readonly ist_kwh: string | null;
  }

  async function istVerbrauchDesLaufs(laufId: string): Promise<number> {
    const rows = await dbClient.query<Monatszeile>(
      'SELECT ist_kwh FROM analytics.laufergebnis WHERE lauf_id = $1',
      [laufId],
    );
    return rows.rows.reduce((summe, zeile) => summe + Number.parseFloat(zeile.ist_kwh ?? '0'), 0);
  }

  async function baueSzene(name: string, mitUntermessung: boolean): Promise<string> {
    const endkundeId = await legeEndkundeAn(testApp, betriebToken, `UM-${name}-${randomUUID().slice(0, 8)}`);
    const systemId = await legeSystemAn(testApp, betriebToken, endkundeId, `System ${name}`);
    const mvetId = await legeMvetAn(testApp, betriebToken, dbClient, endkundeId);

    // 31 Tageswerte im Januar, damit ein voller Monat entsteht.
    const haupt = await legeKanalAn(systemId, false);
    await schreibeMesswerte(haupt, `${String(JAHR)}-01-01`, 32, 100);

    if (mitUntermessung) {
      const unter = await legeKanalAn(systemId, true);
      await schreibeMesswerte(unter, `${String(JAHR)}-01-01`, 32, 40);
    }

    const lauf = await starteBerechnungslauf(
      testApp,
      betriebToken,
      berechnungslaufBody(endkundeId, mvetId, JAHR, {
        periodeVon: `${String(JAHR)}-01-01`,
        periodeBis: `${String(JAHR)}-02-01`,
      }),
    );
    expect(lauf.status).toBe(201);
    return lauf.body['id'] as string;
  }

  it('zaehlt den Verbrauch einer Untermessung NICHT zusaetzlich zum Ist-Verbrauch', async () => {
    // Zwei Bestaende, die denselben Strom verbrauchen: einer misst ihn mit
    // einem Zaehler, der andere zusaetzlich mit einer Untermessung. Sie
    // MUESSEN denselben Ist-Verbrauch ausweisen — die zweite Messstelle
    // veraendert die Physik nicht, nur die Sicht darauf.
    const ohneLaufId = await baueSzene('Ohne', false);
    const mitLaufId = await baueSzene('Mit', true);

    const ohne = await istVerbrauchDesLaufs(ohneLaufId);
    const mit = await istVerbrauchDesLaufs(mitLaufId);

    expect(mit).toBeGreaterThan(0);
    expect(mit).toBeCloseTo(ohne, 3);
  });

  it('zaehlt die Untermessung mit, sobald sie als eigene Messstelle gefuehrt wird', async () => {
    // Die Gegenprobe: Ohne das Kennzeichen ist der Kanal eine eigene
    // Messstelle, sein Verbrauch steckt nirgends sonst — dann MUSS er
    // hinzukommen. Ohne diesen Test wuerde ein pauschales „zweiter Kanal
    // zaehlt nie" genauso gruen aussehen.
    const endkundeId = await legeEndkundeAn(testApp, betriebToken, `UM-Eigen-${randomUUID().slice(0, 8)}`);
    const systemId = await legeSystemAn(testApp, betriebToken, endkundeId, 'System Eigen');
    const mvetId = await legeMvetAn(testApp, betriebToken, dbClient, endkundeId);

    const haupt = await legeKanalAn(systemId, false);
    await schreibeMesswerte(haupt, `${String(JAHR)}-01-01`, 32, 100);
    const zweite = await legeKanalAn(systemId, false);
    await schreibeMesswerte(zweite, `${String(JAHR)}-01-01`, 32, 40);

    const lauf = await starteBerechnungslauf(
      testApp,
      betriebToken,
      berechnungslaufBody(endkundeId, mvetId, JAHR, {
        periodeVon: `${String(JAHR)}-01-01`,
        periodeBis: `${String(JAHR)}-02-01`,
      }),
    );
    expect(lauf.status).toBe(201);

    const ist = await istVerbrauchDesLaufs(lauf.body['id'] as string);
    const nurHaupt = await istVerbrauchDesLaufs(await baueSzene('Vergleich', false));

    expect(ist).toBeGreaterThan(nurHaupt);
    // 100 + 40 je Tag gegen 100 je Tag — das Verhaeltnis muss 1,4 sein.
    expect(ist / nurHaupt).toBeCloseTo(1.4, 2);
  });
});
