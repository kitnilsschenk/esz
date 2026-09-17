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
 * Das Standard-Messkonzept im Berechnungslauf (V0076, Merkblatt Technik v2.2
 * Kap. 2.2.2).
 *
 * **Was hier geprüft wird — und was nicht.** Die Anpassungsrechnung selbst
 * (kleinste Quadrate, Gütemaße, Abbruchgründe) hat ihren eigenen, exakten
 * Unit-Test in `domain/baseline-regression.spec.ts`. Dieser Test prüft die
 * VERDRAHTUNG: dass der Typ am Messkonzept den Weg tatsächlich umschaltet,
 * dass die Vermessung aus den Baseline-Perioden geholt und mit eingefroren
 * wird, dass die Güte in der Datenbank landet — und dass ein Standard-Lauf
 * ohne Vermessung abbricht, statt still auf das vereinfachte Verfahren
 * zurückzufallen.
 *
 * **Warum die Klimadaten hier per SQL gesetzt werden**, anders als in
 * `berechnungslauf.integration.spec.ts`: Dort ist der synthetische
 * Klima-Adapter selbst der Prüfgegenstand. Hier ist die Gradtagzahl ein
 * REGRESSOR — ihr Verlauf entscheidet über die Koeffizienten. Nur mit einer
 * gesetzten Temperaturreihe ist das erwartete Ergebnis exakt vorhersagbar
 * statt ungefähr.
 *
 * Die Reihe ist so gebaut, dass die Anpassung sie exakt trifft: 10 kWh
 * Grundlast je Tag plus 2 kWh je Kelvin·Tag. Heiztage tragen t = 5 °C
 * (GTZ = 20 − 5 = 15 Kd), Sommertage t = 20 °C (GTZ = 0). Ein Heiztag
 * verbraucht damit 10 + 2·15 = 40 kWh, ein Sommertag 10 kWh.
 */
describe('Standard-Messkonzept im Berechnungslauf — Integrationstests (V0076)', () => {
  let testApp: StammdatenTestApp;
  let betriebToken: string;
  let dbClient: Client;

  /** Vermessungsjahr, abgeschlossen und ohne Schalttag. */
  const BASELINE_VON = '2023-01-01';
  const BASELINE_BIS = '2024-01-01';
  const HEIZMONATE = [1, 2, 3, 11, 12];

  const GRUNDLAST_JE_TAG_KWH = 10;
  const B1_KWH_JE_KD = 2;
  const GTZ_JE_HEIZTAG = 15;

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

  async function legeKanalAn(systemId: string): Promise<number> {
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
      .send({ messgroesse: 'Wirkarbeit', einheit: 'kWh', art: 'kumulativ_zaehlerstand', istUntermessung: false });
    expect(kanal.status).toBe(201);

    const keyRow = await dbClient.query('SELECT kanal_key FROM energy.messkanal WHERE id = $1', [
      (kanal.body as { id: string }).id,
    ]);
    return (keyRow.rows[0] as { kanal_key: number }).kanal_key;
  }

  /** Temperaturreihe der Station, lückenlos — sonst füllt der Service selbst nach. */
  async function setzeKlima(stationRef: string, von: string, bis: string): Promise<void> {
    await dbClient.query(
      `INSERT INTO analytics.klima_tag (station_ref, tag, revision, t_mittel, quelle, abgerufen_at)
       SELECT $1, d::date, 0,
              CASE WHEN extract(month FROM d) = ANY($4::int[]) THEN 5 ELSE 20 END,
              'test_gesetzt', now()
         FROM generate_series($2::date, ($3::date - 1), interval '1 day') AS d
       ON CONFLICT (station_ref, tag, revision) DO NOTHING`,
      [stationRef, von, bis, HEIZMONATE],
    );
  }

  /**
   * Kumulative Zählerstände, deren TAGESZUWACHS der Kennlinie folgt. Der
   * Lauf bildet daraus wieder Tagesverbräuche — geschrieben wird also das,
   * was ein realer Zähler liefern würde, nicht das Ergebnis.
   */
  async function setzeMesswerte(kanalKey: number, von: string, bis: string): Promise<void> {
    await dbClient.query(
      `INSERT INTO measurement.messwert (messkanal_key, ts, wert, qualitaet, herkunft)
       SELECT $1, tag::timestamptz, stand, 0, 0
         FROM (
           SELECT tag, sum(tages_kwh) OVER (ORDER BY tag) AS stand
             FROM (
               SELECT d::date AS tag,
                      CASE WHEN extract(month FROM d) = ANY($4::int[]) THEN $5::numeric ELSE $6::numeric END
                        AS tages_kwh
                 FROM generate_series($2::date, ($3::date - 1), interval '1 day') AS d
             ) AS tagesreihe
         ) AS kumuliert`,
      [
        kanalKey,
        von,
        bis,
        HEIZMONATE,
        GRUNDLAST_JE_TAG_KWH + B1_KWH_JE_KD * GTZ_JE_HEIZTAG,
        GRUNDLAST_JE_TAG_KWH,
      ],
    );
  }

  async function erfasseBaselinePeriode(mvetId: string, von: string, bis: string): Promise<void> {
    await dbClient.query(
      `INSERT INTO energy.baseline_periode (id, mvet_id, von, bis, menge, einheit)
       VALUES (gen_random_uuid(), $1, $2::date, $3::date, NULL, 'kWh')`,
      [mvetId, von, bis],
    );
  }

  interface LaufZeile {
    readonly messkonzept_typ: string;
    readonly guete_r2: string | null;
    readonly guete_cv_rmse_pct: string | null;
    readonly guete_nmbe_pct: string | null;
    readonly guete_punkte: number | null;
    readonly grundlast_anteil: string;
    readonly baseline_wert_kwh: string;
    readonly gtz_base: string;
    readonly baseline_abweichung_pct: string | null;
  }

  async function laufZeile(laufId: string): Promise<LaufZeile> {
    const rows = await dbClient.query<LaufZeile>(
      `SELECT messkonzept_typ, guete_r2, guete_cv_rmse_pct, guete_nmbe_pct, guete_punkte,
              grundlast_anteil, baseline_wert_kwh, gtz_base, baseline_abweichung_pct
         FROM analytics.berechnungslauf WHERE id = $1`,
      [laufId],
    );
    const zeile = rows.rows[0];
    if (zeile === undefined) {
      throw new Error(`Kein Lauf ${laufId} gefunden.`);
    }
    return zeile;
  }

  /** Vollständige Szene: Messkonzept `standard`, Vermessungsjahr erfasst und gemessen. */
  async function baueVermesseneSzene(
    name: string,
    optionen: { readonly mitBaselinePeriode?: boolean; readonly messwerteAb?: string } = {},
  ): Promise<{ readonly endkundeId: string; readonly mvetId: string; readonly stationRef: string }> {
    const endkundeId = await legeEndkundeAn(testApp, betriebToken, `STD-${name}-${randomUUID().slice(0, 8)}`);
    const systemId = await legeSystemAn(testApp, betriebToken, endkundeId, `System ${name}`);
    const mvetId = await legeMvetAn(testApp, betriebToken, dbClient, endkundeId, {
      baselineWert: 20000,
      typ: 'standard',
    });
    await dbClient.query(
      `INSERT INTO energy.messkonzept_version_energietraeger_system (mvet_id, system_id, endkunde_id)
       VALUES ($1, $2, $3)`,
      [mvetId, systemId, endkundeId],
    );

    const kanalKey = await legeKanalAn(systemId);
    const stationRef = `TEST-${randomUUID().slice(0, 8)}`;

    // Messwerte und Klima decken Vermessung UND Zielperiode ab. Der Zaehler
    // startet einen Tag VOR der Vermessung: aus kumulativen Staenden entsteht
    // ein Tagesverbrauch erst aus der DIFFERENZ zum Vortag -- ohne den
    // Vorlaufwert fehlte dem 1. Januar sein Verbrauch, der Monat waere
    // unvollstaendig und fiele aus der Anpassung heraus.
    const messwerteAb = optionen.messwerteAb ?? '2022-12-31';
    await setzeMesswerte(kanalKey, messwerteAb, '2024-03-01');
    await setzeKlima(stationRef, BASELINE_VON, '2024-03-01');

    if (optionen.mitBaselinePeriode !== false) {
      await erfasseBaselinePeriode(mvetId, BASELINE_VON, BASELINE_BIS);
    }
    return { endkundeId, mvetId, stationRef };
  }

  it('passt die Koeffizienten an die Vermessung an und schreibt die Güte in den Lauf', async () => {
    const szene = await baueVermesseneSzene('Happy');

    const { status, body } = await starteBerechnungslauf(
      testApp,
      betriebToken,
      berechnungslaufBody(szene.endkundeId, szene.mvetId, 2024, {
        stationRef: szene.stationRef,
        // Bewusst gesetzt, obwohl der Standard-Pfad beides selbst ermittelt:
        // der Test belegt damit, dass die Eingaben ÜBERSCHRIEBEN werden.
        grundlastAnteil: 0.2,
        gtzBaseOverride: undefined,
      }),
    );

    expect(status).toBe(201);
    const zeile = await laufZeile(body['id'] as string);

    expect(zeile.messkonzept_typ).toBe('standard');
    expect(zeile.guete_punkte).toBe(12);
    // Die Reihe folgt der Kennlinie exakt — die Anpassung trifft sie ohne Rest.
    expect(Number.parseFloat(zeile.guete_r2 ?? '')).toBeCloseTo(1, 4);
    expect(Number.parseFloat(zeile.guete_cv_rmse_pct ?? '')).toBeCloseTo(0, 2);
    expect(Number.parseFloat(zeile.guete_nmbe_pct ?? '')).toBeCloseTo(0, 2);

    // a₀ = c · d_a = 10 · 365,25; B = a₀ + b₁ · GTZ_base; g = a₀ / B.
    const gtzBase = Number.parseFloat(zeile.gtz_base);
    const a0 = GRUNDLAST_JE_TAG_KWH * 365.25;
    const erwartetB = a0 + B1_KWH_JE_KD * gtzBase;
    expect(Number.parseFloat(zeile.baseline_wert_kwh)).toBeCloseTo(erwartetB, 0);
    expect(Number.parseFloat(zeile.grundlast_anteil)).toBeCloseTo(a0 / erwartetB, 3);
    // Der EINGESANDTE Grundlast-Anteil war 0,2 — er darf hier nicht mehr stehen.
    expect(Number.parseFloat(zeile.grundlast_anteil)).not.toBeCloseTo(0.2, 2);
  });

  it('weist den Abstand zur erfassten Baseline aus, statt sie stillschweigend zu ersetzen', async () => {
    const szene = await baueVermesseneSzene('Abweichung');

    const { status, body } = await starteBerechnungslauf(
      testApp,
      betriebToken,
      berechnungslaufBody(szene.endkundeId, szene.mvetId, 2024, {
        stationRef: szene.stationRef,
        gtzBaseOverride: undefined,
      }),
    );

    expect(status).toBe(201);
    const zeile = await laufZeile(body['id'] as string);

    // Erfasst sind 20 000 kWh, angepasst ergibt sich ein anderer Wert -- die
    // Differenz gehoert in den Nachweis, nicht in den Papierkorb.
    expect(zeile.baseline_abweichung_pct).not.toBeNull();
    const erwartet =
      ((Number.parseFloat(zeile.baseline_wert_kwh) - 20000) / 20000) * 100;
    expect(Number.parseFloat(zeile.baseline_abweichung_pct ?? '')).toBeCloseTo(erwartet, 1);
  });

  it('bricht ab, wenn ein Standard-Messkonzept keine Vermessung erfasst hat', async () => {
    // Fail-closed: Ein stilles Zurückfallen auf das vereinfachte Verfahren
    // würde eine Baseline ausweisen, die niemand belegt hat.
    const szene = await baueVermesseneSzene('OhneVermessung', { mitBaselinePeriode: false });

    const { status, body } = await starteBerechnungslauf(
      testApp,
      betriebToken,
      berechnungslaufBody(szene.endkundeId, szene.mvetId, 2024, {
        stationRef: szene.stationRef,
        gtzBaseOverride: undefined,
      }),
    );

    expect(status).toBe(400);
    expect(String(body['detail'])).toContain('VERMESSUNG');
  });

  it('bricht ab, wenn die Vermessung zu wenige vollständige Monate trägt', async () => {
    // Messwerte erst ab Oktober: von zwölf erfassten Monaten sind nur drei
    // lückenlos. Unvollständige Monate fallen heraus (sonst zöge die
    // Anpassung eine zu flache Kennlinie) -- übrig bleiben zu wenige Punkte.
    const szene = await baueVermesseneSzene('ZuKurz', { messwerteAb: '2023-10-01' });

    const { status, body } = await starteBerechnungslauf(
      testApp,
      betriebToken,
      berechnungslaufBody(szene.endkundeId, szene.mvetId, 2024, {
        stationRef: szene.stationRef,
        gtzBaseOverride: undefined,
      }),
    );

    expect(status).toBe(400);
    expect(String(body['detail'])).toContain('zu_wenige_punkte');
  });

  it('lässt den vereinfachten Weg unberührt — dort bleibt die Güte leer', async () => {
    const endkundeId = await legeEndkundeAn(testApp, betriebToken, `STD-Verein-${randomUUID().slice(0, 8)}`);
    const mvetId = await legeMvetAn(testApp, betriebToken, dbClient, endkundeId);

    const { status, body } = await starteBerechnungslauf(
      testApp,
      betriebToken,
      berechnungslaufBody(endkundeId, mvetId, 2024),
    );

    expect(status).toBe(201);
    const zeile = await laufZeile(body['id'] as string);

    expect(zeile.messkonzept_typ).toBe('vereinfacht');
    expect(zeile.guete_r2).toBeNull();
    expect(zeile.guete_punkte).toBeNull();
    expect(zeile.baseline_abweichung_pct).toBeNull();
    // Der eingesandte Grundlast-Anteil bleibt hier massgeblich.
    expect(Number.parseFloat(zeile.grundlast_anteil)).toBeCloseTo(0.2, 3);
  });

  it('friert die Tage der Vermessung im Messwert-Snapshot mit ein', async () => {
    // Der Snapshot muss belegen, WORAUS die Koeffizienten entstanden sind --
    // sonst ist die Guete eine Behauptung ohne Grundlage.
    const szene = await baueVermesseneSzene('Snapshot');

    const { status, body } = await starteBerechnungslauf(
      testApp,
      betriebToken,
      berechnungslaufBody(szene.endkundeId, szene.mvetId, 2024, {
        stationRef: szene.stationRef,
        gtzBaseOverride: undefined,
      }),
    );
    expect(status).toBe(201);

    const rows = await dbClient.query<{ readonly von: string; readonly bis: string; readonly anzahl: string }>(
      `SELECT to_char(s.von, 'YYYY-MM-DD') AS von, to_char(s.bis, 'YYYY-MM-DD') AS bis, count(m.*)::text AS anzahl
         FROM analytics.berechnungslauf l
         JOIN analytics.eingang_snapshot s ON s.id = l.messwert_snapshot_id
         LEFT JOIN analytics.eingang_messwert_tag m ON m.snapshot_id = s.id
        WHERE l.id = $1
        GROUP BY s.von, s.bis`,
      [body['id'] as string],
    );
    const snapshot = rows.rows[0];
    expect(snapshot).toBeDefined();
    if (snapshot === undefined) return;

    // Beginnt im Vermessungsjahr, nicht erst in der Zielperiode.
    expect(snapshot.von.slice(0, 4)).toBe('2023');
    // 365 Vermessungstage + Januar 2024; entdoppelt ueber (Tag, Kanal).
    expect(Number.parseInt(snapshot.anzahl, 10)).toBe(365 + 31);
  });
});
