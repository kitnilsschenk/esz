import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KlimaQuelleConfigService } from '../klima-quelle.config';
import { DwdAbrufFehler, DwdKlimaQuelleAdapter } from './dwd-klima-quelle.adapter';
import { DwdStationsIdFehler } from './dwd-stations-id.util';
import { baueZip } from '../../../common/zip/test-support/zip-fixture';

const BASIS = 'https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/daily/kl';

const KOPFZEILE = 'STATIONS_ID;MESS_DATUM;QN_3;QN_4;TMK;eor';

/** Alle Werte SYNTHETISCH — DWD-Rohdaten gehören nicht ins Repository. */
function produktdatei(tage: readonly { readonly datum: string; readonly tmk: number; readonly qn?: number }[]): string {
  return [KOPFZEILE, ...tage.map((t) => `        433;${t.datum};   10;   ${t.qn ?? 10};   ${t.tmk};eor`)].join('\n');
}

function archiv(dateiname: string, inhalt: string): Buffer {
  return baueZip([
    { name: 'Metadaten_Geographie_00433.txt', inhalt: 'egal' },
    { name: dateiname, inhalt },
  ]);
}

interface Antwort {
  readonly status?: number;
  readonly koerper?: Buffer | string;
}

describe('DwdKlimaQuelleAdapter', () => {
  const antworten = new Map<string, Antwort>();
  const fetchMock = vi.fn((url: string) => {
    const antwort = antworten.get(url) ?? { status: 404 };
    const status = antwort.status ?? 200;
    const koerper = typeof antwort.koerper === 'string' ? Buffer.from(antwort.koerper, 'latin1') : (antwort.koerper ?? Buffer.alloc(0));
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers({ 'content-length': String(koerper.byteLength) }),
      arrayBuffer: () => Promise.resolve(koerper.buffer.slice(koerper.byteOffset, koerper.byteOffset + koerper.byteLength)),
    } as unknown as Response);
  });

  function adapter(): DwdKlimaQuelleAdapter {
    return new DwdKlimaQuelleAdapter(new KlimaQuelleConfigService());
  }

  beforeEach(() => {
    antworten.clear();
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('EDMS_KLIMA_QUELLE', 'dwd');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('lädt das recent-Archiv und liefert die Tage des angefragten Zeitraums', async () => {
    antworten.set(`${BASIS}/recent/tageswerte_KL_00433_akt.zip`, {
      koerper: archiv(
        'produkt_klima_tag_20250101_20250105_00433.txt',
        produktdatei([
          { datum: '20250101', tmk: 1.5 },
          { datum: '20250102', tmk: 2.5 },
          { datum: '20250103', tmk: 3.5 },
        ]),
      ),
    });

    const abruf = await adapter().holeTageswerte('00433', '2025-01-01', '2025-01-03');

    // Halboffenes Intervall: der 03. gehört NICHT dazu.
    expect(abruf.werte).toEqual([
      { tag: '2025-01-01', tMittelC: 1.5, qualitaetsNiveau: 10 },
      { tag: '2025-01-02', tMittelC: 2.5, qualitaetsNiveau: 10 },
    ]);
  });

  it('trägt Quelle, Dateiversion und Lizenzkennung mit — sonst wäre die Herkunft später nicht belegbar', () => {
    // Auflage A-3, `docs/datenquellen.md` DQ-001.
    antworten.set(`${BASIS}/recent/tageswerte_KL_00433_akt.zip`, {
      koerper: archiv('produkt_klima_tag_20250101_20250105_00433.txt', produktdatei([{ datum: '20250101', tmk: 1.5 }])),
    });

    return expect(adapter().holeTageswerte('DWD-433', '2025-01-01', '2025-01-02')).resolves.toMatchObject({
      herkunft: {
        quelle: 'dwd_cdc_kl_tag',
        dateiVersion: 'tageswerte_KL_00433_akt.zip',
        lizenzId: 'CC-BY-4.0',
      },
    });
  });

  it('holt das historische Archiv dazu, wenn recent den Anfang nicht abdeckt', async () => {
    antworten.set(`${BASIS}/recent/tageswerte_KL_00433_akt.zip`, {
      koerper: archiv('produkt_klima_tag_20250101_20250105_00433.txt', produktdatei([{ datum: '20250101', tmk: 1.5 }])),
    });
    antworten.set(`${BASIS}/historical/`, {
      koerper:
        '<a href="tageswerte_KL_00432_18910101_20241231_hist.zip">x</a>' +
        '<a href="tageswerte_KL_00433_19310101_20241231_hist.zip">x</a>',
    });
    antworten.set(`${BASIS}/historical/tageswerte_KL_00433_19310101_20241231_hist.zip`, {
      koerper: archiv(
        'produkt_klima_tag_19310101_20241231_00433.txt',
        produktdatei([{ datum: '20241230', tmk: -3.5 }, { datum: '20241231', tmk: -1 }]),
      ),
    });

    const abruf = await adapter().holeTageswerte('00433', '2024-12-30', '2025-01-02');

    expect(abruf.werte.map((w) => w.tag)).toEqual(['2024-12-30', '2024-12-31', '2025-01-01']);
    expect(abruf.herkunft.dateiVersion).toBe('tageswerte_KL_00433_akt.zip + tageswerte_KL_00433_19310101_20241231_hist.zip');
  });

  it('lässt bei Überschneidung den geprüften historischen Wert gewinnen', async () => {
    // `recent` ist vorläufig (kleines QN); dieselbe Kalenderzeile liegt im
    // historischen Archiv in der geprüften Fassung vor.
    antworten.set(`${BASIS}/recent/tageswerte_KL_00433_akt.zip`, {
      koerper: archiv(
        'produkt_klima_tag_20241231_20250105_00433.txt',
        produktdatei([{ datum: '20241231', tmk: 9.9, qn: 1 }]),
      ),
    });
    antworten.set(`${BASIS}/historical/`, { koerper: 'tageswerte_KL_00433_19310101_20241231_hist.zip' });
    antworten.set(`${BASIS}/historical/tageswerte_KL_00433_19310101_20241231_hist.zip`, {
      koerper: archiv(
        'produkt_klima_tag_19310101_20241231_00433.txt',
        produktdatei([{ datum: '20241231', tmk: 8.1, qn: 10 }]),
      ),
    });

    const abruf = await adapter().holeTageswerte('00433', '2024-12-01', '2025-01-01');

    expect(abruf.werte).toEqual([{ tag: '2024-12-31', tMittelC: 8.1, qualitaetsNiveau: 10 }]);
  });

  it('spart den historischen Abruf, wenn recent den Zeitraum schon abdeckt', async () => {
    antworten.set(`${BASIS}/recent/tageswerte_KL_00433_akt.zip`, {
      koerper: archiv(
        'produkt_klima_tag_20250101_20250105_00433.txt',
        produktdatei([{ datum: '20250101', tmk: 1.5 }, { datum: '20250102', tmk: 2.5 }]),
      ),
    });

    await adapter().holeTageswerte('00433', '2025-01-01', '2025-01-03');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('kommt mit einer Station aus, die es nur im historischen Bestand gibt', async () => {
    // Stillgelegte Station: `recent` antwortet mit 404.
    antworten.set(`${BASIS}/historical/`, { koerper: 'tageswerte_KL_00433_19310101_19860630_hist.zip' });
    antworten.set(`${BASIS}/historical/tageswerte_KL_00433_19310101_19860630_hist.zip`, {
      koerper: archiv('produkt_klima_tag_19310101_19860630_00433.txt', produktdatei([{ datum: '19860101', tmk: 0.4 }])),
    });

    const abruf = await adapter().holeTageswerte('00433', '1986-01-01', '1986-01-02');

    expect(abruf.werte).toEqual([{ tag: '1986-01-01', tMittelC: 0.4, qualitaetsNiveau: 10 }]);
  });

  it('nennt die Station beim Namen, wenn es sie gar nicht gibt', async () => {
    await expect(adapter().holeTageswerte('99999', '2025-01-01', '2025-01-02')).rejects.toThrow(
      /DWD-Station 99999: weder ein 'recent'- noch ein 'historical'-Archiv/,
    );
  });

  it('greift gar nicht erst zu, wenn die stationRef keine DWD-Nummer ist', async () => {
    await expect(adapter().holeTageswerte('DEMO-STATION-A', '2025-01-01', '2025-01-02')).rejects.toThrow(
      DwdStationsIdFehler,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('meldet einen Serverfehler, statt ihn als "keine Daten" zu deuten', async () => {
    antworten.set(`${BASIS}/recent/tageswerte_KL_00433_akt.zip`, { status: 503 });

    await expect(adapter().holeTageswerte('00433', '2025-01-01', '2025-01-02')).rejects.toThrow(/HTTP 503/);
  });

  it('bricht ab, wenn die angekündigte Dateigröße die Grenze übersteigt', async () => {
    vi.stubEnv('EDMS_DWD_MAX_DOWNLOAD_BYTES', '10');
    antworten.set(`${BASIS}/recent/tageswerte_KL_00433_akt.zip`, {
      koerper: archiv('produkt_klima_tag_20250101_20250105_00433.txt', produktdatei([{ datum: '20250101', tmk: 1.5 }])),
    });

    await expect(adapter().holeTageswerte('00433', '2025-01-01', '2025-01-02')).rejects.toThrow(DwdAbrufFehler);
  });

  it('setzt in der URL ausschließlich die Stationsnummer ein — kein Kundenbezug verlässt das System', async () => {
    // Auflage A-4: Bulk-Download öffentlicher Dateien, keine parametrisierte
    // API, keine Übermittlung von Endkunden-/Standort-/Zähler-Kennungen.
    antworten.set(`${BASIS}/recent/tageswerte_KL_00433_akt.zip`, {
      koerper: archiv('produkt_klima_tag_20250101_20250105_00433.txt', produktdatei([{ datum: '20250101', tmk: 1.5 }])),
    });

    await adapter().holeTageswerte('DWD-433', '2025-01-01', '2025-01-02');

    const [url] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${BASIS}/recent/tageswerte_KL_00433_akt.zip`);
    expect(url).not.toContain('?');
  });
});
