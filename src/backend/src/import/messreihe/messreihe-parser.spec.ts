import { describe, expect, it } from 'vitest';
import { leseMessmappe, MessreiheParseFehler } from './messreihe-parser';
import { baueXlsx, seriellesDatum, type TestZelle } from '../xlsx/test-support/xlsx-fixture';

/** Baut ein Foerderjahr-Blatt im Aufbau des Pilotbestands A. */
function blatt(optionen: {
  readonly name?: string;
  readonly titel?: string;
  readonly kopf?: readonly string[];
  readonly tage: readonly (readonly [string, ...(number | null)[]])[];
  readonly summe?: readonly (number | null)[] | false;
}) {
  const kopf = optionen.kopf ?? ['Datum', 'Wochentag', 'Tagestyp', 'Strom (kWh)'];
  const zeilen: TestZelle[][] = [
    [optionen.titel ?? 'Foerderjahr 1:  12.10.2018 - 11.10.2019'],
    [],
    [],
    [...kopf],
  ];

  for (const [tag, ...werte] of optionen.tage) {
    zeilen.push([{ datum: seriellesDatum(tag) }, 'Freitag', 'Werktag', ...werte]);
  }

  if (optionen.summe !== false) {
    const summe =
      optionen.summe ?? [optionen.tage.reduce((s, [, w]) => s + (typeof w === 'number' ? w : 0), 0)];
    zeilen.push(['Summe Foerderjahr', null, '365 Tage', ...summe]);
  }

  return { name: optionen.name ?? 'FJ1 2018-2019', zeilen };
}

describe('leseMessmappe', () => {
  it('liest Tageswerte je Messgroesse', () => {
    const mappe = leseMessmappe(
      'test.xlsx',
      baueXlsx([
        blatt({
          tage: [
            ['2018-10-12', 355.8],
            ['2018-10-13', 246.9],
          ],
        }),
      ]),
    );

    expect(mappe.blaetter).toHaveLength(1);
    const fj = mappe.blaetter[0];
    expect(fj?.foerderjahr).toBe(1);
    expect(fj?.vonTag).toBe('2018-10-12');
    expect(fj?.bisTag).toBe('2018-10-13');
    expect(fj?.reihen[0]?.messgroesse).toBe('wirkarbeit');
    expect(fj?.reihen[0]?.werte).toEqual([
      { tag: '2018-10-12', kwh: 355.8 },
      { tag: '2018-10-13', kwh: 246.9 },
    ]);
  });

  it('ordnet Spalten ueber die Ueberschrift zu, nicht ueber die Position', () => {
    // Zwei der fuenf Mappen fuehren Waerme, drei nicht. Wer nach Spaltennummer
    // laese, importierte bei der naechsten Mappe Strom als Waerme.
    const mappe = leseMessmappe(
      'test.xlsx',
      baueXlsx([
        blatt({
          kopf: ['Datum', 'Wochentag', 'Tagestyp', 'Waerme (kWh)', 'Strom (kWh)', 'Gesamt (kWh)'],
          tage: [['2018-10-12', 53.9, 355.8, 409.7]],
          summe: [53.9, 355.8, 409.7],
        }),
      ]),
    );

    const reihen = mappe.blaetter[0]?.reihen ?? [];
    expect(reihen.map((r) => r.messgroesse)).toEqual(['thermische_energie', 'wirkarbeit']);
    expect(reihen[0]?.werte[0]?.kwh).toBe(53.9);
    expect(reihen[1]?.werte[0]?.kwh).toBe(355.8);
  });

  it('importiert die Gesamt-Spalte NICHT — sie ist abgeleitet', () => {
    const mappe = leseMessmappe(
      'test.xlsx',
      baueXlsx([
        blatt({
          kopf: ['Datum', 'Wochentag', 'Tagestyp', 'Waerme (kWh)', 'Strom (kWh)', 'Gesamt (kWh)'],
          tage: [['2018-10-12', 53.9, 355.8, 409.7]],
          summe: [53.9, 355.8, 409.7],
        }),
      ]),
    );

    expect(mappe.blaetter[0]?.reihen).toHaveLength(2);
  });

  it('nimmt die Summenzeile NICHT als Messwert auf', () => {
    const mappe = leseMessmappe('test.xlsx', baueXlsx([blatt({ tage: [['2018-10-12', 10]] })]));

    expect(mappe.blaetter[0]?.reihen[0]?.werte).toHaveLength(1);
    expect(mappe.blaetter[0]?.reihen[0]?.summeLautBlatt).toBe(10);
  });

  it('bricht ab, wenn die Summenzeile nicht zur Summe der Tage passt', () => {
    // Das ist der einzige Weg, einen verlorenen Tag zu bemerken, ohne die
    // Quelle zu kennen.
    expect(() =>
      leseMessmappe(
        'test.xlsx',
        baueXlsx([
          blatt({
            tage: [
              ['2018-10-12', 100],
              ['2018-10-13', 100],
            ],
            summe: [500],
          }),
        ]),
      ),
    ).toThrow(/weicht von der Summenzeile.*ab — es fehlt oder doppelt ein Tag/s);
  });

  it('vertraegt die Fliesskomma-Unschaerfe echter Blattsummen', () => {
    expect(() =>
      leseMessmappe(
        'test.xlsx',
        baueXlsx([
          blatt({
            tage: [
              ['2018-10-12', 2593.4],
              ['2018-10-13', 3763.6],
            ],
            summe: [6357.000000000002],
          }),
        ]),
      ),
    ).not.toThrow();
  });

  it('weist eine unbekannte Spalte ab, statt sie zu uebergehen', () => {
    expect(() =>
      leseMessmappe(
        'test.xlsx',
        baueXlsx([
          blatt({ kopf: ['Datum', 'Wochentag', 'Tagestyp', 'Druckluft (kWh)'], tage: [['2018-10-12', 5]] }),
        ]),
      ),
    ).toThrow(/unbekannte Spalte 'Druckluft \(kWh\)'/);
  });

  it('laesst eine Luecke Luecke sein, statt 0 zu schreiben', () => {
    // Eine 0 waere die Behauptung, an diesem Tag sei nichts verbraucht worden.
    const mappe = leseMessmappe(
      'test.xlsx',
      baueXlsx([
        blatt({
          tage: [
            ['2018-10-12', 100],
            ['2018-10-13', null],
            ['2018-10-14', 100],
          ],
          summe: [200],
        }),
      ]),
    );

    const werte = mappe.blaetter[0]?.reihen[0]?.werte ?? [];
    expect(werte).toHaveLength(2);
    expect(werte.map((w) => w.tag)).toEqual(['2018-10-12', '2018-10-14']);
  });

  it('weist einen negativen Verbrauch ab', () => {
    expect(() => leseMessmappe('test.xlsx', baueXlsx([blatt({ tage: [['2018-10-12', -5]], summe: [-5] })]))).toThrow(
      /negativer Verbrauch/,
    );
  });

  it('weist eine nicht aufsteigende Reihe ab', () => {
    expect(() =>
      leseMessmappe(
        'test.xlsx',
        baueXlsx([
          blatt({
            tage: [
              ['2018-10-13', 100],
              ['2018-10-12', 100],
            ],
            summe: [200],
          }),
        ]),
      ),
    ).toThrow(/folgt nicht auf/);
  });

  it('liest die Anlage aus der Titelzeile, nicht aus dem Dateinamen', () => {
    // Der Dateiname laesst sich beim Ablegen umbenennen, die Titelzeile nicht.
    const mappe = leseMessmappe(
      'irgendwie-umbenannt.xlsx',
      baueXlsx([blatt({ titel: 'Foerderjahr 1:  12.10.2018 - 11.10.2019   |   BHKW', tage: [['2018-10-12', 1]] })]),
    );

    expect(mappe.anlage).toBe('BHKW');
  });

  it('meldet keine Anlage, wenn die Mappe den Hauptzaehler misst', () => {
    const mappe = leseMessmappe('test.xlsx', baueXlsx([blatt({ tage: [['2018-10-12', 1]] })]));

    expect(mappe.anlage).toBeUndefined();
  });

  it('liest mehrere Foerderjahre mit ihrer Nummer', () => {
    const mappe = leseMessmappe(
      'test.xlsx',
      baueXlsx([
        blatt({ name: 'FJ1 2018-2019', tage: [['2018-10-12', 1]] }),
        blatt({ name: 'FJ5 2022-2023', tage: [['2022-10-12', 2]] }),
      ]),
    );

    expect(mappe.blaetter.map((b) => b.foerderjahr)).toEqual([1, 5]);
  });

  it('ignoriert Blaetter, die kein Foerderjahr sind', () => {
    const mappe = leseMessmappe(
      'test.xlsx',
      baueXlsx([
        { name: 'Methodik', zeilen: [['1. DATENBASIS']] },
        { name: 'Uebersicht', zeilen: [['Jahresverbrauch']] },
        blatt({ tage: [['2018-10-12', 1]] }),
      ]),
    );

    expect(mappe.blaetter).toHaveLength(1);
  });

  it('bricht ab, wenn es kein einziges Foerderjahr-Blatt gibt', () => {
    expect(() => leseMessmappe('test.xlsx', baueXlsx([{ name: 'Methodik', zeilen: [['x']] }]))).toThrow(
      MessreiheParseFehler,
    );
  });
});
