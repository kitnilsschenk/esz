import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StammdatenTestApp } from '../stammdaten/test-support/stammdaten-test-app';
import { startStammdatenTestApp, stopStammdatenTestApp } from '../stammdaten/test-support/stammdaten-test-app';

/**
 * `GET /berechnung/parametervorschlag` — die Lauf-Parameter aus dem Bestand
 * hergeleitet.
 *
 * **Was hier eigentlich geprüft wird.** Der Grundlastanteil `g` entscheidet
 * über die Form der Monatskurve. Ein geratenes `g = 0,25` hat in diesem
 * Projekt jeden Sommermonat als Mehrverbrauch ausgewiesen, während der Kunde
 * tatsächlich eingespart hatte. Die Tests bauen deshalb Messreihen, deren
 * richtiges `g` VORHER feststeht, und prüfen, ob die Herleitung darauf kommt.
 *
 * Messwerte werden direkt geschrieben — geprüft wird, was die Herleitung aus
 * ihnen macht, nicht der Ingest-Weg (der hat seinen eigenen Test).
 */
describe('Parametervorschlag — Integrationstests', () => {
  let testApp: StammdatenTestApp;
  let betriebToken: string;
  let auditorToken: string;
  let dbClient: Client;

  /** Bezugsjahr in der Vergangenheit. */
  const JAHR = 2022;

  beforeAll(async () => {
    testApp = await startStammdatenTestApp();
    betriebToken = await testApp.signToken('betrieb-vorschlag', ['betrieb']);
    auditorToken = await testApp.signToken('auditor-vorschlag', ['compliance-auditor']);
    dbClient = new Client({ connectionString: testApp.container.getConnectionUri() });
    await dbClient.connect();
  }, 180_000);

  afterAll(async () => {
    await dbClient?.end().catch(() => undefined);
    await stopStammdatenTestApp(testApp);
  });

  function key(): string {
    return randomUUID();
  }

  interface Bestand {
    readonly endkundeId: string;
    readonly mvetId: string;
    readonly systemId: string;
    readonly kanalKey: number;
  }

  async function bestand(baselineWert = 100_000): Promise<Bestand> {
    const endkunde = await request(testApp.httpServer)
      .post('/stammdaten/endkunden')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({ stammdatenPii: { name: `Vorschlag ${randomUUID().slice(0, 8)}`, anschrift: 'Teststrasse 1' } });
    expect(endkunde.status).toBe(201);
    const endkundeId = (endkunde.body as { id: string }).id;

    const system = await request(testApp.httpServer)
      .post('/stammdaten/systeme')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({ endkundeId, bezeichnung: 'Halle', systemgrenze: 'Halle', systembeschreibung: 'Test' });
    expect(system.status).toBe(201);
    const systemId = (system.body as { id: string }).id;

    const version = await request(testApp.httpServer)
      .post(`/stammdaten/endkunden/${endkundeId}/messkonzept/versionen`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({
        typ: 'vereinfacht',
        systemgrenze: 'Halle',
        systembeschreibung: 'Test',
        bereinigungsverfahren: 'Gradtagzahlverfahren',
        messgeraeteWahl: 'Test',
        geraeteerkennungsVerfahren: 'Test',
        energietraeger: [{ energietraeger: 'gas', baselineWert, baselineEinheit: 'kWh' }],
      });
    expect(version.status).toBe(201);
    const mvetId = (version.body as { energietraeger: { mvetId: string }[] }).energietraeger[0]!.mvetId;

    const zaehler = await request(testApp.httpServer)
      .post('/stammdaten/zaehler')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({ systemId, geraetetyp: 'Testzaehler', energietraeger: 'gas' });
    expect(zaehler.status).toBe(201);

    const kanal = await request(testApp.httpServer)
      .post(`/stammdaten/zaehler/${(zaehler.body as { id: string }).id}/messkanaele`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({ messgroesse: 'Wirkarbeit', einheit: 'kWh', art: 'intervall_verbrauch', istUntermessung: false });
    expect(kanal.status).toBe(201);
    const keyRow = await dbClient.query<{ kanal_key: number }>(
      'SELECT kanal_key FROM energy.messkanal WHERE id = $1',
      [(kanal.body as { id: string }).id],
    );

    return { endkundeId, mvetId, systemId, kanalKey: keyRow.rows[0]!.kanal_key };
  }

  async function ordneSystemZu(mvetId: string, systemId: string, endkundeId: string): Promise<void> {
    await dbClient.query(
      `INSERT INTO energy.messkonzept_version_energietraeger_system (mvet_id, system_id, endkunde_id)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [mvetId, systemId, endkundeId],
    );
  }

  async function erfassePeriode(mvetId: string, von: string, bis: string): Promise<void> {
    await request(testApp.httpServer)
      .put(`/stammdaten/messkonzept-energietraeger/${mvetId}/baseline-perioden`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({ perioden: [{ von, bis }] })
      .expect(200);
  }

  /**
   * Ein volles Jahr Tageswerte (`intervall_verbrauch`) — im Sommer
   * `sommerKwh`, sonst `winterKwh`.
   *
   * `intervall_verbrauch` statt kumulativer Zählerstände, damit jeder Tag
   * seinen eigenen Wert trägt und das erwartete `g` exakt vorher feststeht.
   */
  async function schreibeJahr(kanalKey: number, jahr: number, winterKwh: number, sommerKwh: number): Promise<void> {
    await dbClient.query(
      `INSERT INTO measurement.messwert (messkanal_key, ts, wert, qualitaet, herkunft)
       SELECT $1,
              (tag + time '12:00') AT TIME ZONE 'Europe/Berlin',
              CASE WHEN extract(month FROM tag) IN (7, 8) THEN $3::numeric ELSE $4::numeric END,
              0, 0
         FROM generate_series($2::date, ($2::date + interval '1 year' - interval '1 day')::date, interval '1 day') AS tag`,
      [kanalKey, `${String(jahr)}-01-01`, sommerKwh, winterKwh],
    );
  }

  async function vorschlag(
    endkundeId: string,
    mvetId: string,
    token: string = betriebToken,
  ): Promise<{ readonly status: number; readonly body: Record<string, unknown> }> {
    const antwort = await request(testApp.httpServer)
      .get('/berechnung/parametervorschlag')
      .query({ endkundeId, mvetId })
      .set('Authorization', `Bearer ${token}`);
    return { status: antwort.status, body: antwort.body as Record<string, unknown> };
  }

  it('leitet g aus Sommer- gegen Jahresmittel her', async () => {
    // 62 Sommertage (Juli + August) à 10 kWh, 303 übrige à 100 kWh.
    // Jahresmittel = (62·10 + 303·100) / 365 = 30 920 / 365 = 84,712 kWh/Tag
    // g = 10 / 84,712 = 0,118
    const b = await bestand();
    await ordneSystemZu(b.mvetId, b.systemId, b.endkundeId);
    await schreibeJahr(b.kanalKey, JAHR, 100, 10);
    await erfassePeriode(b.mvetId, `${String(JAHR)}-01-01`, `${String(JAHR + 1)}-01-01`);

    const { status, body } = await vorschlag(b.endkundeId, b.mvetId);

    expect(status).toBe(200);
    const g = body['grundlast'] as Record<string, unknown>;
    expect(g['sommerMittelKwhTag']).toBeCloseTo(10, 3);
    expect(g['jahresMittelKwhTag']).toBeCloseTo(84.712, 2);
    expect(g['anteilVorschlag'] as number).toBeCloseTo(0.118, 3);
    expect(g['witterungsgefuehrt']).toBe(true);
    expect(g['basisHerkunft']).toBe('baseline_periode');
    expect(g['sommerTage']).toBe(62);
  }, 180_000);

  it('schlaegt g = 1 vor, wenn der Sommer NICHT unter dem Jahresmittel liegt', async () => {
    // Kuehlung statt Heizung: Sommer 120, sonst 100. Der Verbrauch folgt der
    // Heizwitterung nicht — die ganze Baseline ist Grundlast. Genau der Fall,
    // den ein geratenes g=0,25 beim Strom des Pilotbestands A verfehlt hat.
    const b = await bestand();
    await ordneSystemZu(b.mvetId, b.systemId, b.endkundeId);
    await schreibeJahr(b.kanalKey, JAHR, 100, 120);
    await erfassePeriode(b.mvetId, `${String(JAHR)}-01-01`, `${String(JAHR + 1)}-01-01`);

    const { body } = await vorschlag(b.endkundeId, b.mvetId);

    const g = body['grundlast'] as Record<string, unknown>;
    expect(g['anteilVorschlag']).toBe(1);
    expect(g['witterungsgefuehrt']).toBe(false);
  }, 180_000);

  it('nimmt ohne Baseline-Periode ersatzweise das erste Datenjahr — und weist das aus', async () => {
    const b = await bestand();
    await ordneSystemZu(b.mvetId, b.systemId, b.endkundeId);
    await schreibeJahr(b.kanalKey, JAHR, 100, 10);

    const { body } = await vorschlag(b.endkundeId, b.mvetId);

    expect(body['gtzBaseErmittelbar']).toBe(false);
    expect((body['grundlast'] as Record<string, unknown>)['basisHerkunft']).toBe('erste_messdaten');
  }, 180_000);

  describe('Herkunft der Klimastation (ADR-0006 C10-O2)', () => {
    /** Verknüpft ein System mit einem Standort und ordnet es der mvet zu. */
    async function verorteSystem(
      b: Awaited<ReturnType<typeof bestand>>,
      klimareferenz: string | null,
    ): Promise<void> {
      const standort = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${b.endkundeId}/standorte`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', key())
        .send({
          typ: 'liegenschaft',
          bezeichnung: 'Liegenschaft',
          adresse: 'Musterweg 1, 88212 Musterstadt',
          ...(klimareferenz !== null ? { klimareferenz } : {}),
        });
      expect(standort.status).toBe(201);

      await dbClient.query('UPDATE energy.system SET standort_id = $1 WHERE id = $2', [
        (standort.body as { id: string }).id,
        b.systemId,
      ]);
      await dbClient.query(
        `INSERT INTO energy.messkonzept_version_energietraeger_system (mvet_id, system_id, endkunde_id)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [b.mvetId, b.systemId, b.endkundeId],
      );
    }

    it('nimmt die Station vom Standort, wenn dort eine hinterlegt ist', async () => {
      const b = await bestand();
      await verorteSystem(b, 'DWD-04094');

      const { body } = await vorschlag(b.endkundeId, b.mvetId);

      expect(body['stationRefHerkunft']).toBe('standort');
      expect(body['stationRefVorschlaege']).toContain('DWD-04094');
    }, 180_000);

    it('weist aus, wenn nur frühere Läufe die Quelle sind — die wiederholen auch einen Fehler', async () => {
      // ADR-0006 C10.1: Genau so blieb eine Station 220 km neben dem Objekt
      // jahrelang unbemerkt.
      const b = await bestand();
      await verorteSystem(b, null);

      const { body } = await vorschlag(b.endkundeId, b.mvetId);

      expect(body['stationRefHerkunft']).not.toBe('standort');
    }, 180_000);
  });

  it('meldet die LEERE Systemgrenze — sonst zoege der Lauf still alle Zaehler heran', async () => {
    const b = await bestand();
    await schreibeJahr(b.kanalKey, JAHR, 100, 10);

    const { body } = await vorschlag(b.endkundeId, b.mvetId);

    expect(body['systemgrenzeQuelle']).toBe('endkunde_fallback');
    expect(body['zaehlerAnzahl']).toBe(1);
  }, 180_000);

  it('schlaegt nur VOLLSTAENDIGE Monate als Periode vor', async () => {
    // Die Reihe beginnt am 01.01. und endet am 31.12. — beide Monate sind
    // vollstaendig, also 01.01. bis 01.01. des Folgejahres (exklusiv).
    const b = await bestand();
    await ordneSystemZu(b.mvetId, b.systemId, b.endkundeId);
    await schreibeJahr(b.kanalKey, JAHR, 100, 10);

    const { body } = await vorschlag(b.endkundeId, b.mvetId);

    expect(body['periodeVonVorschlag']).toBe(`${String(JAHR)}-01-01`);
    expect(body['periodeBisVorschlag']).toBe(`${String(JAHR + 1)}-01-01`);
  }, 180_000);

  it('liefert KEINEN Grundlast-Vorschlag ohne Messdaten — statt einer erfundenen Zahl', async () => {
    const b = await bestand();
    await ordneSystemZu(b.mvetId, b.systemId, b.endkundeId);

    const { body } = await vorschlag(b.endkundeId, b.mvetId);

    expect(body['grundlast']).toBeNull();
    expect(body['datenVon']).toBeNull();
    expect(body['periodeVonVorschlag']).toBeNull();
  }, 180_000);

  it('meldet eine nicht verwertbare Baseline-Einheit, bevor der Lauf daran scheitert', async () => {
    const b = await bestand();
    await dbClient.query(
      "UPDATE energy.messkonzept_version_energietraeger SET baseline_einheit = 'MWh' WHERE id = $1",
      [b.mvetId],
    );

    const { body } = await vorschlag(b.endkundeId, b.mvetId);

    expect(body['baselineEinheitVerwertbar']).toBe(false);
  }, 180_000);

  it('schlaegt die bereits verwendeten Klimastationen vor', async () => {
    const b = await bestand();
    await ordneSystemZu(b.mvetId, b.systemId, b.endkundeId);
    await schreibeJahr(b.kanalKey, JAHR, 100, 10);
    await erfassePeriode(b.mvetId, `${String(JAHR)}-01-01`, `${String(JAHR + 1)}-01-01`);

    await request(testApp.httpServer)
      .post('/berechnung/laeufe')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({
        endkundeId: b.endkundeId,
        mvetId: b.mvetId,
        periodeVon: `${String(JAHR)}-01-01`,
        periodeBis: `${String(JAHR)}-02-01`,
        grundlastAnteil: 0.1,
        stationRef: 'TEST-STATION-A',
      })
      .expect(201);

    const { body } = await vorschlag(b.endkundeId, b.mvetId);

    expect(body['stationRefVorschlaege']).toEqual(['TEST-STATION-A']);
  }, 180_000);

  it('weist ein FREMDES mvet/Endkunde-Paar ab — ein plausibel aussehender Vorschlag waere schlimmer als keiner', async () => {
    const eigener = await bestand();
    const fremder = await bestand();

    const { status } = await vorschlag(eigener.endkundeId, fremder.mvetId);

    expect(status).toBe(400);
  }, 180_000);

  it('laesst den Auditor lesen — sehen, womit zu rechnen waere, ohne rechnen zu duerfen', async () => {
    const b = await bestand();

    expect((await vorschlag(b.endkundeId, b.mvetId, auditorToken)).status).toBe(200);
  }, 180_000);

  it('antwortet auf eine unbekannte mvet mit 404', async () => {
    const b = await bestand();

    expect((await vorschlag(b.endkundeId, randomUUID())).status).toBe(404);
  }, 180_000);
});
