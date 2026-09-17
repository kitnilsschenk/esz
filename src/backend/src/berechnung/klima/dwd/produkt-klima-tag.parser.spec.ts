import { describe, expect, it } from 'vitest';
import { ProduktKlimaTagFormatFehler, parseProduktKlimaTag } from './produkt-klima-tag.parser';

/**
 * Die Kopfzeile ist der WÖRTLICHE Aufbau einer CDC-Produktdatei
 * (`observations_germany/climate/daily/kl`, Stand 2026-09) — Spaltennamen und
 * Reihenfolge, keine Messwerte. Alle Datenzeilen der Fixtures sind
 * SYNTHETISCH (`.claude/rules/tests.md`; DWD-Rohdaten gehören laut
 * `docs/datenquellen.md` „Rote Linie" nicht ins Repository).
 */
const KOPFZEILE =
  'STATIONS_ID;MESS_DATUM;QN_3;  FX;  FM;QN_4; RSK;RSKF; SDK;SHK_TAG;  NM; VPM;  PM; TMK; UPM; TXK; TNK; TGK;eor';

function zeile(datum: string, tmk: string, qn4 = '10', sdk = '-999'): string {
  return `        433;${datum};   10;   5.5;   1.6;    ${qn4};   0.0;   0;${sdk};   0;   2.2;   6.0; 1013.80;    ${tmk};   54.00;   19.1;    0.1;   -4.0;eor`;
}

function datei(...zeilen: readonly string[]): string {
  return [KOPFZEILE, ...zeilen].join('\n');
}

describe('parseProduktKlimaTag', () => {
  it('liest Kalendertag, Tagesmittel und Qualitätsniveau', () => {
    const werte = parseProduktKlimaTag(datei(zeile('20250307', '9.8'), zeile('20250308', '-2.4', '1')));

    expect(werte).toEqual([
      { tag: '2025-03-07', tMittelC: 9.8, qualitaetsNiveau: 10 },
      { tag: '2025-03-08', tMittelC: -2.4, qualitaetsNiveau: 1 },
    ]);
  });

  it('lässt Tage mit der DWD-Fehlwertkennung -999 aus, statt sie als 0 °C zu zählen', () => {
    // 0 °C wäre im Winter ein plausibler Messwert und ginge ungebremst in die
    // Gradtagzahl ein — der Tag muss fehlen, nicht falsch dastehen.
    const werte = parseProduktKlimaTag(datei(zeile('20250307', '9.8'), zeile('20250308', '-999'), zeile('20250309', '3.1')));

    expect(werte.map((w) => w.tag)).toEqual(['2025-03-07', '2025-03-09']);
  });

  it('lässt sich von -999 in einer ANDEREN Spalte nicht beirren', () => {
    // In echten Dateien steht -999 regelmäßig in SDK (Sonnenscheindauer);
    // ein positionsblinder Parser würde daran den ganzen Tag verwerfen.
    const werte = parseProduktKlimaTag(datei(zeile('20250307', '9.8', '10', '-999')));

    expect(werte).toHaveLength(1);
  });

  it('adressiert über Spaltennamen — eine eingeschobene Spalte verschiebt nichts', () => {
    const kopf = 'STATIONS_ID;MESS_DATUM;NEUE_SPALTE;QN_4;TMK;eor';
    const werte = parseProduktKlimaTag(`${kopf}\n        433;20250307;   42;   9;   7.5;eor`);

    expect(werte).toEqual([{ tag: '2025-03-07', tMittelC: 7.5, qualitaetsNiveau: 9 }]);
  });

  it('bricht ab, wenn die Temperaturspalte fehlt, statt eine andere zu lesen', () => {
    const kopf = 'STATIONS_ID;MESS_DATUM;QN_4;TXK;eor';

    expect(() => parseProduktKlimaTag(`${kopf}\n        433;20250307;   9;   19.1;eor`)).toThrow(
      /Spalte 'TMK' fehlt/,
    );
  });

  it('bricht bei einem unmöglichen Tagesmittel ab — das ist kein Fehlwert, sondern ein verschobenes Feld', () => {
    expect(() => parseProduktKlimaTag(datei(zeile('20250307', '1013.80')))).toThrow(/außerhalb ±70 °C/);
  });

  it('weist ein unlesbares Datumsfeld ab', () => {
    expect(() => parseProduktKlimaTag(datei(zeile('2025-03-07', '9.8')))).toThrow(/kein YYYYMMDD/);
  });

  it('behandelt ein unbrauchbares Qualitätsniveau als unbekannt, nicht als ungültigen Messwert', () => {
    const werte = parseProduktKlimaTag(datei(zeile('20250307', '9.8', '-999')));

    expect(werte).toEqual([{ tag: '2025-03-07', tMittelC: 9.8, qualitaetsNiveau: null }]);
  });

  it('verträgt CRLF und Leerzeilen am Dateiende', () => {
    const inhalt = `${KOPFZEILE}\r\n${zeile('20250307', '9.8')}\r\n\r\n`;

    expect(parseProduktKlimaTag(inhalt)).toHaveLength(1);
  });

  it('weist eine leere Datei ab', () => {
    expect(() => parseProduktKlimaTag('   \n\n')).toThrow(ProduktKlimaTagFormatFehler);
  });
});
