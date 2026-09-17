import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Client } from 'pg';
import type { StammdatenTestApp } from '../test-support/stammdaten-test-app';
import { startStammdatenTestApp, stopStammdatenTestApp } from '../test-support/stammdaten-test-app';

/**
 * Die Baseline-Bezugszeiträume eines Messkonzept-Energieträgers (V0073).
 *
 * **Warum das ein eigener Erfassungsweg sein muss.** Aus diesen Zeiträumen
 * bildet `BerechnungslaufService` GTZ_base als **Mittelwert der
 * Gradtagzahl-Summen je Periode** — den Nenner der Witterungsbereinigung.
 * `energy.baseline_periode` stand seit V0019 im Schema, aber
 * `AnalyticsBaselinePeriodeRepository` kann nur LESEN: Die Tabelle war
 * ausschließlich per SQL zu füllen. Wer das nicht konnte, musste GTZ_base
 * über `gtzBaseOverride` von Hand angeben — eine geratene Gradtagzahl, die
 * jede Einsparzahl still verfälscht.
 */
describe('Baseline-Bezugszeitraeume — Integrationstests (V0073)', () => {
  let testApp: StammdatenTestApp;
  let dbClient: Client;
  let betriebToken: string;
  let auditorToken: string;

  beforeAll(async () => {
    testApp = await startStammdatenTestApp();
    dbClient = new Client({ connectionString: testApp.container.getConnectionUri() });
    await dbClient.connect();
    betriebToken = await testApp.signToken('betrieb-baseline', ['betrieb']);
    auditorToken = await testApp.signToken('auditor-baseline', ['compliance-auditor']);
  }, 180_000);

  afterAll(async () => {
    await dbClient?.end().catch(() => undefined);
    await stopStammdatenTestApp(testApp);
  });

  function key(): string {
    return randomUUID();
  }

  function pfad(mvetId: string): string {
    return `/stammdaten/messkonzept-energietraeger/${mvetId}/baseline-perioden`;
  }

  /** Endkunde mit einem Messkonzept (Wärme, Baseline 120 000 kWh aus 3 Abrechnungen). */
  async function bestand(
    baseline: { wert?: number; einheit?: string; abrechnungen?: number } = {},
  ): Promise<{ endkundeId: string; mvetId: string }> {
    const endkunde = await request(testApp.httpServer)
      .post('/stammdaten/endkunden')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({ stammdatenPii: { name: `Baseline ${randomUUID().slice(0, 8)}`, anschrift: 'Teststrasse 1' } });
    expect(endkunde.status).toBe(201);
    const endkundeId = (endkunde.body as { id: string }).id;

    const version = await request(testApp.httpServer)
      .post(`/stammdaten/endkunden/${endkundeId}/messkonzept/versionen`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({
        typ: 'vereinfacht',
        systemgrenze: 'Test',
        systembeschreibung: 'Test',
        bereinigungsverfahren: 'Gradtagzahlverfahren',
        messgeraeteWahl: 'Test',
        geraeteerkennungsVerfahren: 'Test',
        energietraeger: [
          {
            energietraeger: 'waerme',
            baselineWert: baseline.wert ?? 120_000,
            baselineEinheit: baseline.einheit ?? 'kWh',
            ...(baseline.abrechnungen === undefined
              ? {}
              : { baselineAbrechnungenAnzahl: baseline.abrechnungen }),
          },
        ],
      });
    expect(version.status).toBe(201);
    const mvetId = (version.body as { energietraeger: { mvetId: string }[] }).energietraeger[0]!.mvetId;

    return { endkundeId, mvetId };
  }

  const DREI_JAHRE = [
    { von: '2021-01-01', bis: '2022-01-01', menge: 118_000, einheit: 'kWh' },
    { von: '2022-01-01', bis: '2023-01-01', menge: 120_000, einheit: 'kWh' },
    { von: '2023-01-01', bis: '2024-01-01', menge: 122_000, einheit: 'kWh' },
  ];

  it('meldet einen leeren Bestand als NICHT ermittelbar — sonst raet jemand die Gradtagzahl', async () => {
    const { mvetId } = await bestand();

    const antwort = await request(testApp.httpServer).get(pfad(mvetId)).set('Authorization', `Bearer ${betriebToken}`);

    expect(antwort.status).toBe(200);
    expect(antwort.body).toMatchObject({ gtzBaseErmittelbar: false, energietraeger: 'waerme' });
    expect((antwort.body as { perioden: unknown[] }).perioden).toHaveLength(0);
  }, 120_000);

  it('nimmt die Perioden an und rechnet Tage und letzten enthaltenen Tag zurueck', async () => {
    // `bis` ist AUSSCHLIESSLICH. Wer das mit dem letzten Tag verwechselt,
    // verliert ein Jahr und merkt es erst an der Einsparzahl.
    const { mvetId } = await bestand();

    const antwort = await request(testApp.httpServer)
      .put(pfad(mvetId))
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({ perioden: DREI_JAHRE });

    expect(antwort.status).toBe(200);
    expect(antwort.body).toMatchObject({ gtzBaseErmittelbar: true });
    const perioden = (antwort.body as { perioden: { von: string; tage: number; letzterTag: string }[] }).perioden;
    expect(perioden).toHaveLength(3);
    expect(perioden[0]).toMatchObject({ von: '2021-01-01', tage: 365, letzterTag: '2021-12-31' });
    // 2024 ist ein Schaltjahr — die Periode 2023 selbst hat 365 Tage.
    expect(perioden[2]).toMatchObject({ von: '2023-01-01', tage: 365, letzterTag: '2023-12-31' });
  }, 120_000);

  it('ERSETZT die Menge, statt zu ergaenzen — die Perioden wirken nur gemeinsam', async () => {
    const { mvetId } = await bestand();

    await request(testApp.httpServer)
      .put(pfad(mvetId))
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({ perioden: DREI_JAHRE });

    const antwort = await request(testApp.httpServer)
      .put(pfad(mvetId))
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({ perioden: [DREI_JAHRE[2]] });

    expect(antwort.status).toBe(200);
    expect((antwort.body as { perioden: unknown[] }).perioden).toHaveLength(1);
  }, 120_000);

  it('ist idempotent — zweimal dasselbe aendert nichts', async () => {
    const { mvetId } = await bestand();
    const senden = (): request.Test =>
      request(testApp.httpServer)
        .put(pfad(mvetId))
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', key())
        .send({ perioden: DREI_JAHRE });

    await senden();
    const zweite = await senden();

    expect(zweite.status).toBe(200);
    expect((zweite.body as { perioden: unknown[] }).perioden).toHaveLength(3);
  }, 120_000);

  it('weist UEBERSCHNEIDUNGEN ab (400) — sie zaehlen Tage doppelt in den Mittelwert', async () => {
    const { mvetId } = await bestand();

    const antwort = await request(testApp.httpServer)
      .put(pfad(mvetId))
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({
        perioden: [
          { von: '2022-01-01', bis: '2023-01-01' },
          { von: '2022-07-01', bis: '2023-07-01' },
        ],
      });

    expect(antwort.status).toBe(400);
    expect((antwort.body as { detail: string }).detail).toMatch(/ueberschneiden sich/);
  }, 120_000);

  it('laesst LUECKENLOS aneinandergrenzende Zeitraeume zu — `bis` ist ausschliesslich', async () => {
    // Der Folgezeitraum beginnt AM Tag des vorigen `bis`. Das ist keine
    // Ueberschneidung, sondern der Regelfall.
    const { mvetId } = await bestand();

    const antwort = await request(testApp.httpServer)
      .put(pfad(mvetId))
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({ perioden: DREI_JAHRE });

    expect(antwort.status).toBe(200);
  }, 120_000);

  it('weist `bis` vor `von` als erklaerten Fehler ab, nicht als 500 aus dem DB-CHECK', async () => {
    const { mvetId } = await bestand();

    const antwort = await request(testApp.httpServer)
      .put(pfad(mvetId))
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({ perioden: [{ von: '2023-01-01', bis: '2022-01-01' }] });

    expect(antwort.status).toBe(400);
    expect((antwort.body as { detail: string }).detail).toMatch(/ausschliesslich/);
  }, 120_000);

  it('markiert eine unterjaehrige Periode, ohne sie abzulehnen', async () => {
    // Ein unterjaehriger Abrechnungszeitraum (Einzug, Versorgerwechsel) ist
    // ein echter Fall — er soll nur nicht unbemerkt bleiben, weil der
    // Mittelwert der Gradtagzahl-Summen ihn NICHT auf ein Jahr normiert.
    const { mvetId } = await bestand();

    const antwort = await request(testApp.httpServer)
      .put(pfad(mvetId))
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({ perioden: [{ von: '2023-01-01', bis: '2023-07-01' }] });

    expect(antwort.status).toBe(200);
    expect((antwort.body as { perioden: { laengeAuffaellig: boolean }[] }).perioden[0]?.laengeAuffaellig).toBe(true);
  }, 120_000);

  it('stellt den Mittelwert der Mengen neben die Baseline — TB-02 verlangt genau ihn', async () => {
    const { mvetId } = await bestand({ wert: 120_000, einheit: 'kWh' });

    const antwort = await request(testApp.httpServer)
      .put(pfad(mvetId))
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({ perioden: DREI_JAHRE });

    expect(antwort.body).toMatchObject({ mengeMittel: 120_000, baselineWert: 120_000 });
  }, 120_000);

  it('liefert KEINEN Mittelwert, wenn eine Menge fehlt — ein Teilmittel waere keine Baseline', async () => {
    const { mvetId } = await bestand();

    const antwort = await request(testApp.httpServer)
      .put(pfad(mvetId))
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({ perioden: [DREI_JAHRE[0], { von: '2022-01-01', bis: '2023-01-01' }] });

    expect(antwort.body).toMatchObject({ mengeMittel: null });
  }, 120_000);

  it('liefert KEINEN Mittelwert bei gemischten Einheiten', async () => {
    const { mvetId } = await bestand({ einheit: 'kWh' });

    const antwort = await request(testApp.httpServer)
      .put(pfad(mvetId))
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({
        perioden: [
          { von: '2022-01-01', bis: '2023-01-01', menge: 12_000, einheit: 'm³' },
          { von: '2023-01-01', bis: '2024-01-01', menge: 120_000, einheit: 'kWh' },
        ],
      });

    expect(antwort.body).toMatchObject({ mengeMittel: null });
  }, 120_000);

  it('weist eine unbekannte Einheit ab — sonst stuenden „kwh" und „kWh" nebeneinander', async () => {
    const { mvetId } = await bestand();

    const antwort = await request(testApp.httpServer)
      .put(pfad(mvetId))
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({ perioden: [{ von: '2022-01-01', bis: '2023-01-01', menge: 1, einheit: 'kwh' }] });

    expect(antwort.status).toBe(400);
  }, 120_000);

  it('laesst den Weg zurueck zu „keine erfasst" offen', async () => {
    const { mvetId } = await bestand();

    await request(testApp.httpServer)
      .put(pfad(mvetId))
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({ perioden: DREI_JAHRE });

    const antwort = await request(testApp.httpServer)
      .put(pfad(mvetId))
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({ perioden: [] });

    expect(antwort.status).toBe(200);
    expect(antwort.body).toMatchObject({ gtzBaseErmittelbar: false });
  }, 120_000);

  it('antwortet auf eine unbekannte mvet mit 404, nicht mit einer leeren Liste', async () => {
    const antwort = await request(testApp.httpServer)
      .get(pfad(randomUUID()))
      .set('Authorization', `Bearer ${betriebToken}`);

    expect(antwort.status).toBe(404);
  }, 120_000);

  it('laesst den Auditor lesen, aber nicht setzen', async () => {
    const { mvetId } = await bestand();

    expect(
      (await request(testApp.httpServer).get(pfad(mvetId)).set('Authorization', `Bearer ${auditorToken}`)).status,
    ).toBe(200);
    expect(
      (
        await request(testApp.httpServer)
          .put(pfad(mvetId))
          .set('Authorization', `Bearer ${auditorToken}`)
          .set('Idempotency-Key', key())
          .send({ perioden: DREI_JAHRE })
      ).status,
    ).toBe(403);
  }, 120_000);

  it('protokolliert die Erfassung mit Anzahl vorher und nachher', async () => {
    // „von 0 auf 3" ist eine Ersteinrichtung, „von 3 auf 1" eine Korrektur,
    // die den Nenner der Witterungsbereinigung verschiebt.
    const { mvetId } = await bestand();

    await request(testApp.httpServer)
      .put(pfad(mvetId))
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({ perioden: DREI_JAHRE });
    await request(testApp.httpServer)
      .put(pfad(mvetId))
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({ perioden: [DREI_JAHRE[0]] });

    const zeilen = await dbClient.query<{ kontext: Record<string, unknown> }>(
      `SELECT kontext FROM audit.event
        WHERE event_typ = 'messkonzept.baseline_periode.erfasst' AND objekt_ref = $1
        ORDER BY ts ASC`,
      [mvetId],
    );

    expect(zeilen.rows).toHaveLength(2);
    expect(zeilen.rows[0]?.kontext).toMatchObject({
      energietraeger: 'waerme',
      perioden_anzahl: 3,
      vorher_anzahl: 0,
    });
    expect(zeilen.rows[1]?.kontext).toMatchObject({ perioden_anzahl: 1, vorher_anzahl: 3 });
  }, 120_000);
});
