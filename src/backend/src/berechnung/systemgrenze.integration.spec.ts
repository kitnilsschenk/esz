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
  legeSystemAn,
  starteBerechnungslauf,
  verknuepfeMvetMitSystem,
} from '../nachweis/test-support/nachweis-test-fixtures';

/**
 * Systemgrenze der Einsparberechnung (V0028-Zuordnung).
 *
 * **Der Fehler, den dieser Test festhält.** `findAktiveZaehlerIds` wählte
 * ALLE aktiven Zähler des Endkunden mit passendem Energieträger — die
 * mvet↔System-Zuordnung aus V0028 begrenzte die Auswahl nicht. Ein Endkunde
 * mit zwei unabhängigen Gas-Messkonzepten bekam in BEIDEN Läufen die Summe
 * BEIDER Systeme; jedes Messkonzept wies den Verbrauch des anderen mit aus.
 *
 * Der Repository-Kommentar benannte das selbst als „offener Punkt für ein
 * Folgepaket" und berief sich auf „Stand V0019/V0020" — die Zuordnungstabelle
 * gibt es seit V0028. Deren Schema-Kommentar legt die Regel ausdrücklich
 * fest: Zuordnungen sind maßgeblich, die Endkunde+Energieträger-Heuristik
 * bleibt Fallback, „bis Zuordnungen gepflegt sind".
 *
 * **Warum keine bestehende Prüfung das fand.** Sämtliche Fixtures legten je
 * Endkunde genau EIN System an. Bei einem System ist „alle Zähler des Kunden"
 * dasselbe wie „die Zähler dieses Systems" — der Fehler ist erst ab dem
 * zweiten sichtbar.
 *
 * Die Messwerte werden direkt geschrieben: Geprüft wird, WELCHE Kanäle die
 * Berechnung heranzieht, nicht der Ingest-Weg.
 */
describe('Systemgrenze der Einsparberechnung — Integrationstests (V0028)', () => {
  let testApp: StammdatenTestApp;
  let betriebToken: string;
  let dbClient: Client;

  /** Testjahr in der Vergangenheit — der Lauf rechnet über abgeschlossene Monate. */
  const JAHR = 2024;
  /**
   * Erster Zählerstand — bewusst der 31. DEZEMBER, nicht der 1. Januar.
   *
   * Die Tagesaggregation bildet aus kumulativen Ständen Differenzen und
   * schreibt jede Differenz dem Tag des SPÄTEREN Standes zu. Der Vorwert des
   * 1. Januar liegt also im Vorjahr; das Repository holt ihn als
   * Vorlauf-Zeile (letzter Stand VOR dem Fenster). Beginnt die Reihe erst am
   * 1. Januar, hat dieser Tag keinen Vorwert — er fällt aus der Rechnung, und
   * der Monat käme mit 30 statt 31 Tagen heraus. Das ist kein Fehler der
   * Berechnung, sondern eine Eigenschaft von Zählerständen; der Test muss
   * die Reihe deshalb einen Tag früher beginnen lassen.
   */
  const VORLAUF_TAG = `${String(JAHR - 1)}-12-31`;
  /** 31 Januartage à 100 kWh (Stände vom 31.12. bis zum 31.01. = 32 Werte). */
  const SYSTEM_A_KWH_PRO_TAG = 100;
  const SYSTEM_B_KWH_PRO_TAG = 40;
  const TAGE_IM_JANUAR = 31;

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

  /**
   * Legt eine EIGENE Messkonzept-Version an und liefert deren `mvet`-Id.
   *
   * Sucht über den `baseline_wert`, nicht über „jüngste Zeile": Bei zwei
   * Versionen im selben Millisekunden-Fenster wäre die Sortierung nach
   * `created_at` mehrdeutig, und der Test prüfte dann zufällig das falsche
   * Messkonzept — die Art von Flakiness, die man erst nach Wochen bemerkt.
   */
  async function legeMvetMitBaselineAn(endkundeId: string, baselineWert: number): Promise<string> {
    const response = await request(testApp.httpServer)
      .post(`/stammdaten/endkunden/${endkundeId}/messkonzept/versionen`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({
        typ: 'vereinfacht',
        systemgrenze: `Grenze ${String(baselineWert)}`,
        systembeschreibung: 'Testsystem',
        bereinigungsverfahren: 'Gradtagzahlverfahren',
        messgeraeteWahl: 'Fernauslesbare Zaehler',
        geraeteerkennungsVerfahren: 'Direktmessung',
        energietraeger: [{ energietraeger: 'gas', baselineWert, baselineEinheit: 'kWh' }],
      });
    expect(response.status).toBe(201);

    const row = await dbClient.query<{ id: string }>(
      `SELECT mvet.id
         FROM energy.messkonzept_version_energietraeger mvet
         JOIN energy.messkonzept_version mv ON mv.id = mvet.messkonzept_version_id
         JOIN energy.messkonzept mk ON mk.id = mv.messkonzept_id
        WHERE mk.endkunde_id = $1 AND mvet.baseline_wert = $2`,
      [endkundeId, baselineWert],
    );
    expect(row.rows).toHaveLength(1);
    return row.rows[0]!.id;
  }

  /** Zähler + Messkanal an einem System; liefert den `kanal_key`. */
  async function legeKanalAn(
    systemId: string,
    istUntermessung = false,
    kanalDefinition: { readonly messgroesse: string; readonly einheit: string } = {
      messgroesse: 'wirkarbeit',
      einheit: 'kWh',
    },
  ): Promise<number> {
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
      .send({ ...kanalDefinition, art: 'kumulativ_zaehlerstand', istUntermessung });
    expect(kanal.status).toBe(201);

    const keyRow = await dbClient.query<{ kanal_key: number }>(
      'SELECT kanal_key FROM energy.messkanal WHERE id = $1',
      [(kanal.body as { id: string }).id],
    );
    return keyRow.rows[0]!.kanal_key;
  }

  /**
   * Kumulative Zählerstände: `tage` Tageswerte ab `abTag`, je `kwhProTag`
   * Zuwachs. `abWert` hebt die ganze Reihe an — damit lässt sich ein
   * fortlaufender Zähler nach einer Datenlücke abbilden (Stand ist
   * weitergelaufen) und, mit `abWert = 0` nach einer hohen Reihe, ein
   * Zählerwechsel/-neustart.
   */
  async function schreibeMesswerte(
    kanalKey: number,
    abTag: string,
    tage: number,
    kwhProTag: number,
    abWert = 0,
  ): Promise<void> {
    await dbClient.query(
      `INSERT INTO measurement.messwert (messkanal_key, ts, wert, qualitaet, herkunft)
       SELECT $1, ($2::date + (n || ' days')::interval)::timestamptz, (n + 1) * $4 + $5, 0, 0
         FROM generate_series(0, $3::int - 1) AS n`,
      [kanalKey, abTag, tage, kwhProTag, abWert],
    );
  }

  async function istVerbrauchDesLaufs(laufId: string): Promise<number> {
    const rows = await dbClient.query<{ ist_kwh: string | null }>(
      'SELECT ist_kwh FROM analytics.laufergebnis WHERE lauf_id = $1',
      [laufId],
    );
    return rows.rows.reduce((summe, zeile) => summe + Number.parseFloat(zeile.ist_kwh ?? '0'), 0);
  }

  async function starteJanuarLauf(
    endkundeId: string,
    mvetId: string,
  ): Promise<{ readonly status: number; readonly body: Record<string, unknown> }> {
    return starteBerechnungslauf(
      testApp,
      betriebToken,
      berechnungslaufBody(endkundeId, mvetId, JAHR, {
        periodeVon: `${String(JAHR)}-01-01`,
        periodeBis: `${String(JAHR)}-02-01`,
      }),
    );
  }

  it('rechnet je Messkonzept NUR die Zaehler der zugeordneten Systeme', async () => {
    // Zwei unabhaengige Gas-Messkonzepte desselben Kunden. Ohne die
    // Systemgrenze bekaeme JEDER Lauf die Summe BEIDER Systeme — jedes
    // Messkonzept wiese den Verbrauch des anderen mit aus.
    const endkundeId = await legeEndkundeAn(testApp, betriebToken, `SG-${randomUUID().slice(0, 8)}`);
    const systemA = await legeSystemAn(testApp, betriebToken, endkundeId, 'System A');
    const systemB = await legeSystemAn(testApp, betriebToken, endkundeId, 'System B');

    const mvetA = await legeMvetMitBaselineAn(endkundeId, 20_000);
    const mvetB = await legeMvetMitBaselineAn(endkundeId, 30_000);
    await verknuepfeMvetMitSystem(dbClient, mvetA, systemA);
    await verknuepfeMvetMitSystem(dbClient, mvetB, systemB);

    await schreibeMesswerte(await legeKanalAn(systemA), VORLAUF_TAG, 32, SYSTEM_A_KWH_PRO_TAG);
    await schreibeMesswerte(await legeKanalAn(systemB), VORLAUF_TAG, 32, SYSTEM_B_KWH_PRO_TAG);

    const laufA = await starteJanuarLauf(endkundeId, mvetA);
    const laufB = await starteJanuarLauf(endkundeId, mvetB);
    expect(laufA.status).toBe(201);
    expect(laufB.status).toBe(201);

    // 31 Januartage à 100 bzw. 40 kWh — nachrechenbar, nicht „was rauskommt".
    const erwartetA = TAGE_IM_JANUAR * SYSTEM_A_KWH_PRO_TAG;
    const erwartetB = TAGE_IM_JANUAR * SYSTEM_B_KWH_PRO_TAG;

    expect(await istVerbrauchDesLaufs(laufA.body['id'] as string)).toBeCloseTo(erwartetA, 3);
    expect(await istVerbrauchDesLaufs(laufB.body['id'] as string)).toBeCloseTo(erwartetB, 3);
  });

  it('faellt ohne gepflegte Zuordnung auf den Endkunden zurueck — und weist das aus', async () => {
    // Der dokumentierte Uebergangszustand (V0028-Tabellenkommentar): Ein mvet
    // OHNE Zuordnung darf weiterhin rechnen, sonst braeche jeder Bestand.
    // Aber es muss ERKENNBAR sein — eine stillschweigende Ausweitung auf den
    // ganzen Kunden ist genau der Fehler, den dieser Test verhindert.
    const endkundeId = await legeEndkundeAn(testApp, betriebToken, `SG-FB-${randomUUID().slice(0, 8)}`);
    const system = await legeSystemAn(testApp, betriebToken, endkundeId, 'System ohne Zuordnung');
    const mvet = await legeMvetMitBaselineAn(endkundeId, 20_000);
    // BEWUSST KEINE Verknuepfung.
    await schreibeMesswerte(await legeKanalAn(system), VORLAUF_TAG, 32, SYSTEM_A_KWH_PRO_TAG);

    const lauf = await starteJanuarLauf(endkundeId, mvet);
    expect(lauf.status).toBe(201);
    expect(await istVerbrauchDesLaufs(lauf.body['id'] as string)).toBeCloseTo(
      TAGE_IM_JANUAR * SYSTEM_A_KWH_PRO_TAG,
      3,
    );

    // Der Lauf muss sagen, dass er auf den Fallback zurueckgefallen ist.
    const audit = await dbClient.query<{ kontext: Record<string, unknown> }>(
      `SELECT kontext FROM audit.event
        WHERE objekt_ref = $1 AND kontext ? 'systemgrenze_quelle'`,
      [lauf.body['id'] as string],
    );
    expect(audit.rows.length).toBeGreaterThan(0);
    expect(audit.rows[0]?.kontext['systemgrenze_quelle']).toBe('endkunde_fallback');
  });

  it('weist bei gepflegter Zuordnung die Systemgrenze als Quelle aus', async () => {
    const endkundeId = await legeEndkundeAn(testApp, betriebToken, `SG-Z-${randomUUID().slice(0, 8)}`);
    const system = await legeSystemAn(testApp, betriebToken, endkundeId, 'System zugeordnet');
    const mvet = await legeMvetMitBaselineAn(endkundeId, 20_000);
    await verknuepfeMvetMitSystem(dbClient, mvet, system);
    await schreibeMesswerte(await legeKanalAn(system), VORLAUF_TAG, 32, SYSTEM_A_KWH_PRO_TAG);

    const lauf = await starteJanuarLauf(endkundeId, mvet);
    expect(lauf.status).toBe(201);

    const audit = await dbClient.query<{ kontext: Record<string, unknown> }>(
      `SELECT kontext FROM audit.event
        WHERE objekt_ref = $1 AND kontext ? 'systemgrenze_quelle'`,
      [lauf.body['id'] as string],
    );
    expect(audit.rows[0]?.kontext['systemgrenze_quelle']).toBe('mvet_system');
  });

  it('zaehlt eine Untermessung im zugeordneten System NICHT doppelt', async () => {
    // Die beiden Regeln greifen ineinander: erst die Systemgrenze, dann der
    // Untermessungs-Ausschluss (V0058). Faelt eine davon aus, stimmt die Zahl
    // nicht — und beide zusammen wurden nie geprueft.
    const endkundeId = await legeEndkundeAn(testApp, betriebToken, `SG-UM-${randomUUID().slice(0, 8)}`);
    const system = await legeSystemAn(testApp, betriebToken, endkundeId, 'System mit Untermessung');
    const fremdesSystem = await legeSystemAn(testApp, betriebToken, endkundeId, 'Fremdes System');
    const mvet = await legeMvetMitBaselineAn(endkundeId, 20_000);
    await verknuepfeMvetMitSystem(dbClient, mvet, system);

    await schreibeMesswerte(await legeKanalAn(system), VORLAUF_TAG, 32, SYSTEM_A_KWH_PRO_TAG);
    await schreibeMesswerte(await legeKanalAn(system, true), VORLAUF_TAG, 32, 40);
    // Gehoert NICHT zum Messkonzept und darf nicht mitzaehlen.
    await schreibeMesswerte(await legeKanalAn(fremdesSystem), VORLAUF_TAG, 32, 999);

    const lauf = await starteJanuarLauf(endkundeId, mvet);
    expect(lauf.status).toBe(201);

    // Nur die Hauptmessung des zugeordneten Systems: 31 × 100 kWh.
    expect(await istVerbrauchDesLaufs(lauf.body['id'] as string)).toBeCloseTo(
      TAGE_IM_JANUAR * SYSTEM_A_KWH_PRO_TAG,
      3,
    );
  });
});

describe('Verwertbarkeit der Messkanäle und Lücken im Bestand — Integrationstests', () => {
  let testApp: StammdatenTestApp;
  let betriebToken: string;
  let dbClient: Client;

  const JAHR = 2024;
  const VORLAUF_TAG = `${String(JAHR - 1)}-12-31`;
  const KWH_PRO_TAG = 100;
  const TAGE_IM_JANUAR = 31;

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

  /** Endkunde + System + zugeordnetes Messkonzept — der Normalfall dieser Suite. */
  async function legeZugeordnetesMesskonzeptAn(praefix: string): Promise<{
    readonly endkundeId: string;
    readonly systemId: string;
    readonly mvetId: string;
  }> {
    const endkundeId = await legeEndkundeAn(testApp, betriebToken, `${praefix}-${randomUUID().slice(0, 8)}`);
    const systemId = await legeSystemAn(testApp, betriebToken, endkundeId, 'System');
    const response = await request(testApp.httpServer)
      .post(`/stammdaten/endkunden/${endkundeId}/messkonzept/versionen`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({
        typ: 'vereinfacht',
        systemgrenze: 'Grenze',
        systembeschreibung: 'Testsystem',
        bereinigungsverfahren: 'Gradtagzahlverfahren',
        messgeraeteWahl: 'Fernauslesbare Zaehler',
        geraeteerkennungsVerfahren: 'Direktmessung',
        energietraeger: [{ energietraeger: 'gas', baselineWert: 20_000, baselineEinheit: 'kWh' }],
      });
    expect(response.status).toBe(201);
    const row = await dbClient.query<{ id: string }>(
      `SELECT mvet.id
         FROM energy.messkonzept_version_energietraeger mvet
         JOIN energy.messkonzept_version mv ON mv.id = mvet.messkonzept_version_id
         JOIN energy.messkonzept mk ON mk.id = mv.messkonzept_id
        WHERE mk.endkunde_id = $1`,
      [endkundeId],
    );
    expect(row.rows).toHaveLength(1);
    const mvetId = row.rows[0]!.id;
    await verknuepfeMvetMitSystem(dbClient, mvetId, systemId);
    return { endkundeId, systemId, mvetId };
  }

  async function legeKanalAn(
    systemId: string,
    kanal: { readonly messgroesse: string; readonly einheit: string } = { messgroesse: 'wirkarbeit', einheit: 'kWh' },
  ): Promise<number> {
    const zaehler = await request(testApp.httpServer)
      .post('/stammdaten/zaehler')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ systemId, geraetetyp: 'Testzaehler', energietraeger: 'gas' });
    expect(zaehler.status).toBe(201);

    const kanalAntwort = await request(testApp.httpServer)
      .post(`/stammdaten/zaehler/${(zaehler.body as { id: string }).id}/messkanaele`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ ...kanal, art: 'kumulativ_zaehlerstand', istUntermessung: false });
    expect(kanalAntwort.status).toBe(201);

    const keyRow = await dbClient.query<{ kanal_key: number }>('SELECT kanal_key FROM energy.messkanal WHERE id = $1', [
      (kanalAntwort.body as { id: string }).id,
    ]);
    return keyRow.rows[0]!.kanal_key;
  }

  async function schreibeMesswerte(
    kanalKey: number,
    abTag: string,
    tage: number,
    kwhProTag: number,
    abWert = 0,
  ): Promise<void> {
    await dbClient.query(
      `INSERT INTO measurement.messwert (messkanal_key, ts, wert, qualitaet, herkunft)
       SELECT $1, ($2::date + (n || ' days')::interval)::timestamptz, (n + 1) * $4 + $5, 0, 0
         FROM generate_series(0, $3::int - 1) AS n`,
      [kanalKey, abTag, tage, kwhProTag, abWert],
    );
  }

  async function starteJanuarLauf(
    endkundeId: string,
    mvetId: string,
  ): Promise<{ readonly status: number; readonly body: Record<string, unknown> }> {
    return starteBerechnungslauf(
      testApp,
      betriebToken,
      berechnungslaufBody(endkundeId, mvetId, JAHR, {
        periodeVon: `${String(JAHR)}-01-01`,
        periodeBis: `${String(JAHR)}-02-01`,
      }),
    );
  }

  async function januarZeile(laufId: string): Promise<{
    istKwh: number;
    tageGemessen: number;
    tageFehlend: number;
    tageGesamt: number;
  }> {
    const rows = await dbClient.query<{
      ist_kwh: string | null;
      tage_gemessen: number;
      tage_fehlend: number;
      tage_gesamt: number;
    }>(
      'SELECT ist_kwh, tage_gemessen, tage_fehlend, tage_gesamt FROM analytics.laufergebnis WHERE lauf_id = $1 ORDER BY monat LIMIT 1',
      [laufId],
    );
    expect(rows.rows).toHaveLength(1);
    const zeile = rows.rows[0]!;
    return {
      istKwh: Number.parseFloat(zeile.ist_kwh ?? '0'),
      tageGemessen: zeile.tage_gemessen,
      tageFehlend: zeile.tage_fehlend,
      tageGesamt: zeile.tage_gesamt,
    };
  }

  it('verweigert den Lauf, wenn ein einbezogener Kanal eine nicht verwertbare Einheit fuehrt', async () => {
    // Ein Gaszaehler misst m³. Ohne Brennwert und Zustandszahl — beides ist im
    // Schema nicht erfasst — laesst sich daraus keine kWh-Zahl bilden. Beide
    // stillen Auswege waeren falsch: mitsummieren ergaebe kWh aus Kubikmetern,
    // weglassen einen zu niedrigen Ist-Verbrauch und damit eine zu hohe
    // ausgewiesene Einsparung. Der Lauf muss die Aussage verweigern.
    const { endkundeId, systemId, mvetId } = await legeZugeordnetesMesskonzeptAn('EH');
    await schreibeMesswerte(await legeKanalAn(systemId), VORLAUF_TAG, 32, KWH_PRO_TAG);
    await legeKanalAn(systemId, { messgroesse: 'volumen', einheit: 'm³' });

    const lauf = await starteJanuarLauf(endkundeId, mvetId);

    expect(lauf.status).toBe(400);
    expect(String(lauf.body['detail'])).toContain('m³');
  });

  it('erfindet bei einem Zaehlerneustart keinen Verbrauch', async () => {
    // Zaehlerwechsel am 16. Januar: der Stand faellt von 1600 auf 100. Die
    // Differenz dieses Tages ist negativ und damit KEIN Verbrauch — sie darf
    // weder als negative Zahl noch als 0 noch als Sprung von 1500 kWh
    // erscheinen. Erwartung: 15 Tage vor + 15 Tage nach dem Wechsel à 100 kWh,
    // der Wechseltag zaehlt als fehlend.
    const { endkundeId, systemId, mvetId } = await legeZugeordnetesMesskonzeptAn('NEU');
    const kanal = await legeKanalAn(systemId);
    await schreibeMesswerte(kanal, VORLAUF_TAG, 16, KWH_PRO_TAG);
    await schreibeMesswerte(kanal, `${String(JAHR)}-01-16`, 16, KWH_PRO_TAG);

    const lauf = await starteJanuarLauf(endkundeId, mvetId);
    expect(lauf.status).toBe(201);

    const zeile = await januarZeile(lauf.body['id'] as string);
    expect(zeile.istKwh).toBeCloseTo(30 * KWH_PRO_TAG, 3);
    expect(zeile.tageGesamt).toBe(TAGE_IM_JANUAR);
    expect(zeile.tageFehlend).toBe(1);
    expect(zeile.tageGemessen).toBe(30);
  });

  it('weist eine Datenluecke als fehlende Tage aus, statt sie mit 0 zu fuellen', async () => {
    // Zehn Tage ohne Uebertragung (11.-20.). Der Zaehler lief weiter: der
    // erste Stand danach traegt den aufgelaufenen Verbrauch. Erwartung: die
    // Monatssumme bleibt vollstaendig (3000 kWh), die zehn Tage ohne eigenen
    // Wert erscheinen als FEHLEND — nicht als 0-kWh-Tage, die eine
    // Einsparung vortaeuschen wuerden.
    const { endkundeId, systemId, mvetId } = await legeZugeordnetesMesskonzeptAn('LUE');
    const kanal = await legeKanalAn(systemId);
    // Stände 31.12.-10.01.: 100 … 1100. Danach zehn stille Tage. Der erste
    // Stand am 21.01. trägt deren Verbrauch mit: 1100 + 10 × 100 = 2100
    // (Startversatz 2000, weil die Reihe selbst bei 100 beginnt).
    await schreibeMesswerte(kanal, VORLAUF_TAG, 11, KWH_PRO_TAG);
    await schreibeMesswerte(kanal, `${String(JAHR)}-01-21`, 11, KWH_PRO_TAG, 20 * KWH_PRO_TAG);

    const lauf = await starteJanuarLauf(endkundeId, mvetId);
    expect(lauf.status).toBe(201);

    const zeile = await januarZeile(lauf.body['id'] as string);
    expect(zeile.istKwh).toBeCloseTo(30 * KWH_PRO_TAG, 3);
    expect(zeile.tageFehlend).toBe(10);
    expect(zeile.tageGemessen).toBe(21);
  });
});
