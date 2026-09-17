import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import { ClsService } from 'nestjs-cls';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StammdatenTestApp } from '../stammdaten/test-support/stammdaten-test-app';
import { startStammdatenTestApp, stopStammdatenTestApp } from '../stammdaten/test-support/stammdaten-test-app';
import { MesswertVerdichtungService } from './messwert-verdichtung.service';
import { AnalyticsMesswertMonatRepository } from '../berechnung/persistence/analytics-messwert-monat.repository';

/**
 * Integrationstests (ECHTER Postgres+TimescaleDB-Testcontainer, ALLE
 * `migrations/**`, kein DB-Mock — `.claude/rules/tests.md`) für die
 * Verdichtung auf Tagesgranularität (Stufe-B-Bestand, Retention O2).
 *
 * **Der wichtigste Test ist der letzte.** Nach dem Stufe-A-`drop_chunks` ist
 * `measurement.messwert_tag` der einzige verbliebene Zeuge. Weicht sein
 * Inhalt von dem ab, was die Berechnung aus denselben Rohwerten gebildet
 * hätte, widerspricht er dem eingereichten Nachweis — und der Unterschied
 * wäre nicht mehr aufklärbar, weil die Rohwerte fort sind. Deshalb wird die
 * Gleichheit hier gegen die ECHTE Berechnungsabfrage geprüft, nicht gegen
 * eine im Test nachgebaute Erwartung.
 *
 * Testdaten sind ausschliesslich synthetisch.
 */
describe('Messwert-Verdichtung — Integrationstests (Stufe-B-Bestand)', () => {
  let testApp: StammdatenTestApp;
  let betriebToken: string;
  let dbClient: Client;
  let service: MesswertVerdichtungService;
  let berechnung: AnalyticsMesswertMonatRepository;
  let cls: ClsService;

  beforeAll(async () => {
    testApp = await startStammdatenTestApp();
    betriebToken = await testApp.signToken('betrieb-sub', ['betrieb']);

    dbClient = new Client({ connectionString: testApp.container.getConnectionUri() });
    await dbClient.connect();

    service = testApp.app.get(MesswertVerdichtungService);
    berechnung = testApp.app.get(AnalyticsMesswertMonatRepository);
    cls = testApp.app.get(ClsService);
  }, 120_000);

  afterAll(async () => {
    await dbClient?.end().catch(() => undefined);
    await stopStammdatenTestApp(testApp);
  });

  function idempotencyKey(): string {
    return randomUUID();
  }

  async function legeKanalAn(
    suffix: string,
    art: 'kumulativ_zaehlerstand' | 'intervall_verbrauch',
  ): Promise<{ zaehlerId: string; kanalKey: number }> {
    const endkunde = await request(testApp.httpServer)
      .post('/stammdaten/endkunden')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ stammdatenPii: { name: `Verdichtung ${suffix}`, anschrift: 'Musterstraße 1' } });
    expect(endkunde.status).toBe(201);

    const system = await request(testApp.httpServer)
      .post('/stammdaten/systeme')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({
        endkundeId: (endkunde.body as { id: string }).id,
        bezeichnung: `System ${suffix}`,
        systemgrenze: 'Gebäude Musterhalle',
      });
    expect(system.status).toBe(201);

    const zaehler = await request(testApp.httpServer)
      .post('/stammdaten/zaehler')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ systemId: (system.body as { id: string }).id, geraetetyp: 'Testzaehler', energietraeger: 'strom' });
    expect(zaehler.status).toBe(201);
    const zaehlerId = (zaehler.body as { id: string }).id;

    const kanal = await request(testApp.httpServer)
      .post(`/stammdaten/zaehler/${zaehlerId}/messkanaele`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ messgroesse: 'wirkarbeit', einheit: 'kWh', art });
    expect(kanal.status).toBe(201);

    const row = await dbClient.query('SELECT kanal_key FROM energy.messkanal WHERE id = $1', [
      (kanal.body as { id: string }).id,
    ]);
    return { zaehlerId, kanalKey: (row.rows[0] as { kanal_key: number }).kanal_key };
  }

  async function insertMesswert(kanalKey: number, tsIso: string, wert: number): Promise<void> {
    await dbClient.query(
      `INSERT INTO measurement.messwert (messkanal_key, ts, wert, qualitaet, herkunft)
       VALUES ($1, $2::timestamptz, $3, 0, 0)
       ON CONFLICT (messkanal_key, ts) DO NOTHING`,
      [kanalKey, tsIso, wert],
    );
  }

  async function tageszeilen(kanalKey: number): Promise<
    { tag: string; verbrauch: number; anzahl: number; zeitzone: string }[]
  > {
    const result = await dbClient.query(
      `SELECT tag::text AS tag, verbrauch_kwh::float8 AS verbrauch, anzahl_messwerte AS anzahl, zeitzone
         FROM measurement.messwert_tag WHERE messkanal_key = $1 ORDER BY tag`,
      [kanalKey],
    );
    return result.rows as { tag: string; verbrauch: number; anzahl: number; zeitzone: string }[];
  }

  /** Führt den Lauf bis zum Ende durch (der Aufrufer wiederholt, s. Service). */
  async function verdichte(vonTag: string, bisTag: string): Promise<number> {
    return cls.run(async () => {
      let nachKanalKey = 0;
      let summe = 0;
      for (;;) {
        const ergebnis = await service.fuehreAus({ vonTag, bisTag, nachKanalKey });
        summe += ergebnis.anzahlTageszeilen;
        if (!ergebnis.weitere) {
          return summe;
        }
        nachKanalKey = ergebnis.letzterKanalKey;
      }
    });
  }

  it('bildet aus kumulativen Zaehlerstaenden Tagesverbraeuche', async () => {
    const { kanalKey } = await legeKanalAn('kumulativ', 'kumulativ_zaehlerstand');
    // Berliner Zeit im Maerz = UTC+1 (vor der Zeitumstellung).
    await insertMesswert(kanalKey, '2026-03-01T09:00:00Z', 100);
    await insertMesswert(kanalKey, '2026-03-01T10:00:00Z', 110);
    await insertMesswert(kanalKey, '2026-03-01T11:00:00Z', 130);
    await insertMesswert(kanalKey, '2026-03-02T09:00:00Z', 160);

    await verdichte('2026-03-01', '2026-03-03');

    const zeilen = await tageszeilen(kanalKey);
    expect(zeilen).toHaveLength(2);
    // 1. Maerz: (110-100) + (130-110) = 30. Der erste Wert hat keinen
    // Vorgaenger und traegt nichts bei -- er zaehlt aber als Messwert.
    expect(zeilen[0]).toMatchObject({ tag: '2026-03-01', verbrauch: 30, anzahl: 3 });
    // 2. Maerz: 160-130 = 30 -- der Vorgaenger liegt am Vortag.
    expect(zeilen[1]).toMatchObject({ tag: '2026-03-02', verbrauch: 30, anzahl: 1 });
  });

  it('summiert Intervallwerte, statt zu differenzieren', async () => {
    const { kanalKey } = await legeKanalAn('intervall', 'intervall_verbrauch');
    await insertMesswert(kanalKey, '2026-03-01T09:00:00Z', 5);
    await insertMesswert(kanalKey, '2026-03-01T10:00:00Z', 7);

    await verdichte('2026-03-01', '2026-03-02');

    expect(await tageszeilen(kanalKey)).toEqual([
      expect.objectContaining({ tag: '2026-03-01', verbrauch: 12, anzahl: 2 }),
    ]);
  });

  it('schreibt fuer einen Tag ohne gueltige Differenz KEINE 0-Zeile', async () => {
    const { kanalKey } = await legeKanalAn('ohne-vorwert', 'kumulativ_zaehlerstand');
    // Einziger Wert des Kanals: kein Vorgaenger, keine Differenz.
    await insertMesswert(kanalKey, '2026-03-01T09:00:00Z', 500);

    await verdichte('2026-03-01', '2026-03-02');

    // Eine 0 behauptet „nichts verbraucht"; die Wahrheit ist „nicht
    // ermittelbar". Das sind zwei verschiedene Aussagen im Nachweis.
    expect(await tageszeilen(kanalKey)).toHaveLength(0);
  });

  it('ist fensterunabhaengig — der Vorlaufwert kommt aus dem Vortag', async () => {
    const { kanalKey } = await legeKanalAn('fenster', 'kumulativ_zaehlerstand');
    await insertMesswert(kanalKey, '2026-03-01T09:00:00Z', 200);
    await insertMesswert(kanalKey, '2026-03-02T09:00:00Z', 260);

    // NUR der zweite Tag wird verdichtet — der Vorgaenger liegt ausserhalb.
    await verdichte('2026-03-02', '2026-03-03');

    expect(await tageszeilen(kanalKey)).toEqual([
      expect.objectContaining({ tag: '2026-03-02', verbrauch: 60, anzahl: 1 }),
    ]);
  });

  it('schneidet den Tag in der LOKALEN Zeitzone, nicht in UTC', async () => {
    const { kanalKey } = await legeKanalAn('zeitzone', 'intervall_verbrauch');
    // 23:30Z am 1. Maerz ist in Berlin bereits der 2. Maerz, 00:30 Uhr.
    await insertMesswert(kanalKey, '2026-03-01T12:00:00Z', 4);
    await insertMesswert(kanalKey, '2026-03-01T23:30:00Z', 9);

    await verdichte('2026-03-01', '2026-03-03');

    const zeilen = await tageszeilen(kanalKey);
    expect(zeilen).toHaveLength(2);
    expect(zeilen[0]).toMatchObject({ tag: '2026-03-01', verbrauch: 4 });
    expect(zeilen[1]).toMatchObject({ tag: '2026-03-02', verbrauch: 9 });
    expect(zeilen[0]?.zeitzone).toBe('Europe/Berlin');
  });

  it('ersetzt eine bestehende Zeile NICHT durch eine mit duennerer Basis', async () => {
    const { kanalKey } = await legeKanalAn('schutz', 'intervall_verbrauch');
    await insertMesswert(kanalKey, '2026-03-01T09:00:00Z', 3);
    await insertMesswert(kanalKey, '2026-03-01T10:00:00Z', 4);
    await insertMesswert(kanalKey, '2026-03-01T11:00:00Z', 5);

    await verdichte('2026-03-01', '2026-03-02');
    expect(await tageszeilen(kanalKey)).toEqual([
      expect.objectContaining({ verbrauch: 12, anzahl: 3 }),
    ]);

    // Genau der Fall, den Stufe A erzeugt: Ein Teil der Rohwerte ist fort.
    await dbClient.query(
      `DELETE FROM measurement.messwert WHERE messkanal_key = $1 AND ts < '2026-03-01T11:00:00Z'`,
      [kanalKey],
    );
    await verdichte('2026-03-01', '2026-03-02');

    // Der Tageswert bleibt der vollstaendige. Ohne diese Sicherung stuende
    // hier 5 aus einem Rohwert — ein still falscher Nachweis.
    expect(await tageszeilen(kanalKey)).toEqual([
      expect.objectContaining({ verbrauch: 12, anzahl: 3 }),
    ]);
  });

  it('stimmt mit der Rechenvorschrift der BERECHNUNG ueberein', async () => {
    const { zaehlerId, kanalKey } = await legeKanalAn('gleichheit', 'kumulativ_zaehlerstand');
    // Bewusst unbequem: Lueckenhafte Reihe, ein Zaehlerueberlauf (negative
    // Differenz) und ein Tageswechsel.
    await insertMesswert(kanalKey, '2026-03-01T08:00:00Z', 1000);
    await insertMesswert(kanalKey, '2026-03-01T09:00:00Z', 1015);
    await insertMesswert(kanalKey, '2026-03-01T14:00:00Z', 1060);
    await insertMesswert(kanalKey, '2026-03-02T08:00:00Z', 40); // Ueberlauf/Geraetetausch
    await insertMesswert(kanalKey, '2026-03-02T09:00:00Z', 55);

    await verdichte('2026-03-01', '2026-03-03');
    const verdichtet = await tageszeilen(kanalKey);

    const ausBerechnung = await cls.run(() =>
      berechnung.berechneTagesaggregation({
        zaehlerIds: [zaehlerId],
        von: '2026-03-01T00:00:00+01:00',
        bis: '2026-03-03T00:00:00+01:00',
        zeitzone: 'Europe/Berlin',
      }),
    );

    expect(verdichtet).toHaveLength(ausBerechnung.length);
    for (const [i, erwartet] of ausBerechnung.entries()) {
      expect(verdichtet[i]?.tag).toBe(erwartet.tag);
      expect(verdichtet[i]?.verbrauch).toBeCloseTo(erwartet.wertKwh, 3);
      expect(verdichtet[i]?.anzahl).toBe(erwartet.anzahlMesswerte);
    }
  });
});
