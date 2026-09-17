import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StammdatenTestApp } from '../stammdaten/test-support/stammdaten-test-app';
import { startStammdatenTestApp, stopStammdatenTestApp } from '../stammdaten/test-support/stammdaten-test-app';
import { mitTransaktion } from '../nachweis/test-support/nachweis-test-fixtures';
import { AnalyticsKlimaTagRepository } from './persistence/analytics-klima-tag.repository';
import type { KlimaHerkunft, KlimaTagRohwert } from './klima/klima-quelle.port';

/**
 * Revisionsachse von `analytics.klima_tag` (V0019 D4/R2, V0063).
 *
 * **Warum es diese Achse gibt.** Der DWD liefert dieselbe Kalenderzeile
 * zweimal: zuerst vorläufig im `recent`-Archiv, später geprüft und
 * gegebenenfalls KORRIGIERT im `historical`-Archiv. Ein Berechnungslauf, der
 * mit dem vorläufigen Wert gerechnet hat, muss nachvollziehbar bleiben — der
 * alte Wert darf deshalb nicht überschrieben werden, sondern bekommt einen
 * Nachfolger mit höherer `revision`. Gerechnet wird mit der jüngsten.
 *
 * **Warum das vorher nicht geprüft war.** Mit dem synthetischen Adapter als
 * einziger Quelle konnte es überhaupt keine Revision geben: dieselbe Formel
 * liefert für denselben Tag immer denselben Wert. Erst der reale Abruf macht
 * die Achse benutzbar — und damit auch prüfbedürftig.
 */
describe('Klima-Revisionen — Integrationstests (V0019 D4/R2, V0063)', () => {
  let testApp: StammdatenTestApp;
  let dbClient: Client;
  let repository: AnalyticsKlimaTagRepository;

  const DWD: KlimaHerkunft = {
    quelle: 'dwd_cdc_kl_tag',
    dateiVersion: 'tageswerte_KL_00433_akt.zip',
    lizenzId: 'CC-BY-4.0',
  };
  const DWD_GEPRUEFT: KlimaHerkunft = {
    quelle: 'dwd_cdc_kl_tag',
    dateiVersion: 'tageswerte_KL_00433_19480101_20251231_hist.zip',
    lizenzId: 'CC-BY-4.0',
  };

  function wert(tag: string, tMittelC: number, qualitaetsNiveau: number | null = 1): KlimaTagRohwert {
    return { tag, tMittelC, qualitaetsNiveau };
  }

  /** Eigene Station je Test — die Tabelle ist über alle Tests hinweg gemeinsam. */
  function neueStation(): string {
    return `TEST-${randomUUID().slice(0, 8)}`;
  }

  beforeAll(async () => {
    testApp = await startStammdatenTestApp();
    dbClient = new Client({ connectionString: testApp.container.getConnectionUri() });
    await dbClient.connect();
    repository = testApp.app.get(AnalyticsKlimaTagRepository);
  }, 180_000);

  afterAll(async () => {
    await dbClient?.end().catch(() => undefined);
    await stopStammdatenTestApp(testApp);
  });

  async function zeilen(stationRef: string): Promise<
    { revision: number; t_mittel: string; quelle: string; datei_version: string | null; lizenz_id: string | null; qualitaets_niveau: number | null }[]
  > {
    const ergebnis = await dbClient.query(
      `SELECT revision, t_mittel, quelle, datei_version, lizenz_id, qualitaets_niveau
         FROM analytics.klima_tag WHERE station_ref = $1 ORDER BY revision ASC`,
      [stationRef],
    );
    return ergebnis.rows as never;
  }

  it('schreibt einen neuen Tag als revision 0 — samt Dateiversion und Lizenzkennung', async () => {
    // Auflage A-3 (docs/datenquellen.md DQ-001): ohne diese beiden Angaben
    // ist der Quellenvermerk im Export nachträglich nicht mehr belegbar.
    const station = neueStation();

    await mitTransaktion(testApp, () => repository.insertAbruf(station, [wert('2025-01-01', 3.5, 1)], DWD));

    expect(await zeilen(station)).toEqual([
      {
        revision: 0,
        t_mittel: '3.50',
        quelle: 'dwd_cdc_kl_tag',
        datei_version: 'tageswerte_KL_00433_akt.zip',
        lizenz_id: 'CC-BY-4.0',
        qualitaets_niveau: 1,
      },
    ]);
  });

  it('schreibt bei einem KORRIGIERTEN Wert eine neue Revision, statt die alte zu überschreiben', async () => {
    const station = neueStation();

    await mitTransaktion(testApp, () => repository.insertAbruf(station, [wert('2025-01-01', 3.5, 1)], DWD));
    await mitTransaktion(testApp, () => repository.insertAbruf(station, [wert('2025-01-01', 3.8, 10)], DWD_GEPRUEFT));

    const gespeichert = await zeilen(station);
    expect(gespeichert.map((z) => [z.revision, z.t_mittel, z.qualitaets_niveau])).toEqual([
      [0, '3.50', 1],
      [1, '3.80', 10],
    ]);
    // Die Revision trägt die Datei, aus der die Korrektur stammt.
    expect(gespeichert[1]?.datei_version).toBe('tageswerte_KL_00433_19480101_20251231_hist.zip');
  });

  it('liest den jüngsten Stand — mit dem wird gerechnet', async () => {
    const station = neueStation();

    await mitTransaktion(testApp, () => repository.insertAbruf(station, [wert('2025-01-01', 3.5)], DWD));
    await mitTransaktion(testApp, () => repository.insertAbruf(station, [wert('2025-01-01', 3.8)], DWD_GEPRUEFT));

    const tage = await mitTransaktion(testApp, () => repository.findTage(station, '2025-01-01', '2025-01-02'));

    expect(tage).toEqual([{ tag: '2025-01-01', tMittelC: 3.8 }]);
  });

  it('schreibt bei einem unveränderten Wert gar nichts — ein Neu-Abruf ist keine Revision', async () => {
    // Sonst wüchse die Achse mit jedem Abruf, und niemand könnte an ihr mehr
    // ablesen, wann der DWD tatsächlich etwas korrigiert hat.
    const station = neueStation();

    await mitTransaktion(testApp, () => repository.insertAbruf(station, [wert('2025-01-01', 3.5)], DWD));
    const nochmal = await mitTransaktion(testApp, () =>
      repository.insertAbruf(station, [wert('2025-01-01', 3.5)], DWD),
    );

    expect(nochmal).toBe(0);
    expect(await zeilen(station)).toHaveLength(1);
  });

  it('behandelt Rundungsgleichheit als Gleichheit — t_mittel ist numeric(6,2)', async () => {
    // 3.501 und 3.5 landen beide als 3.50 in der Spalte; ohne diese
    // Angleichung entstünde bei jedem Abruf eine Schein-Revision.
    const station = neueStation();

    await mitTransaktion(testApp, () => repository.insertAbruf(station, [wert('2025-01-01', 3.5)], DWD));
    const nochmal = await mitTransaktion(testApp, () =>
      repository.insertAbruf(station, [wert('2025-01-01', 3.501)], DWD),
    );

    expect(nochmal).toBe(0);
  });

  it('lässt synthetische Werte ohne Lizenzangabe stehen — eine Attribution wäre dort falsch', async () => {
    const station = neueStation();

    await mitTransaktion(testApp, () =>
      repository.insertAbruf(station, [{ tag: '2025-01-01', tMittelC: 9, qualitaetsNiveau: null }], {
        quelle: 'synthetic_dev',
        dateiVersion: null,
        lizenzId: null,
      }),
    );

    expect(await zeilen(station)).toMatchObject([
      { quelle: 'synthetic_dev', datei_version: null, lizenz_id: null, qualitaets_niveau: null },
    ]);
  });
});
