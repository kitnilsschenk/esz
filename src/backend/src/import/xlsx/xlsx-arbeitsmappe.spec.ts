import { describe, expect, it } from 'vitest';
import { XlsxArbeitsmappe, XlsxLeseFehler } from './xlsx-arbeitsmappe';
import { baueXlsx, seriellesDatum } from './test-support/xlsx-fixture';
import { baueZip } from '../../common/zip/test-support/zip-fixture';

describe('XlsxArbeitsmappe', () => {
  it('liest Blattnamen in Reihenfolge der Reiter', () => {
    const mappe = XlsxArbeitsmappe.lese(
      baueXlsx([
        { name: 'Methodik', zeilen: [['1. DATENBASIS']] },
        { name: 'FJ1 2018-2019', zeilen: [['Datum']] },
      ]),
    );

    expect(mappe.blattNamen).toEqual(['Methodik', 'FJ1 2018-2019']);
    expect(mappe.hatBlatt('Methodik')).toBe(true);
    expect(mappe.hatBlatt('Gibtsnicht')).toBe(false);
  });

  it('liest Text, Zahl und Wahrheitswert typisiert', () => {
    const mappe = XlsxArbeitsmappe.lese(
      baueXlsx([{ name: 'B', zeilen: [['Werktag', 359.6, { bool: true }]] }]),
    );

    expect(mappe.blatt('B')[0]).toEqual([
      { art: 'text', text: 'Werktag' },
      { art: 'zahl', zahl: 359.6 },
      { art: 'bool', wert: true },
    ]);
  });

  it('erkennt ein Datum am Zahlenformat der Zelle', () => {
    // Ohne styles.xml kaeme der 12.10.2018 als 43385 an.
    const mappe = XlsxArbeitsmappe.lese(
      baueXlsx([{ name: 'B', zeilen: [[{ datum: seriellesDatum('2018-10-12') }, 43385]] }]),
    );

    const zeile = mappe.blatt('B')[0] ?? [];
    expect(zeile[0]).toEqual({ art: 'datum', iso: '2018-10-12' });
    // Dieselbe Zahl OHNE Datumsformat bleibt eine Zahl.
    expect(zeile[1]).toEqual({ art: 'zahl', zahl: 43385 });
  });

  it('haelt Luecken als Luecken, statt Zellen nach links zu schieben', () => {
    // Eine verrutschte Spalte waere ein Verbrauch in der falschen Messgroesse.
    const mappe = XlsxArbeitsmappe.lese(baueXlsx([{ name: 'B', zeilen: [['A', null, 'C']] }]));

    const zeile = mappe.blatt('B')[0] ?? [];
    expect(zeile[0]).toEqual({ art: 'text', text: 'A' });
    expect(zeile[1]).toBeUndefined();
    expect(zeile[2]).toEqual({ art: 'text', text: 'C' });
  });

  it('liefert eine Fehlerzelle als leer und NICHT als 0', () => {
    // Eine Null im Verbrauch ist eine Aussage, ein #DIV/0! ist keine.
    const mappe = XlsxArbeitsmappe.lese(baueXlsx([{ name: 'B', zeilen: [[{ fehler: '#DIV/0!' }]] }]));

    expect((mappe.blatt('B')[0] ?? [])[0]).toBeUndefined();
  });

  it('liest das zwischengespeicherte Ergebnis einer Formel als Text', () => {
    const mappe = XlsxArbeitsmappe.lese(baueXlsx([{ name: 'B', zeilen: [[{ formelText: 'Freitag' }]] }]));

    expect((mappe.blatt('B')[0] ?? [])[0]).toEqual({ art: 'text', text: 'Freitag' });
  });

  it('haelt Umlaute und maskierte Zeichen', () => {
    const mappe = XlsxArbeitsmappe.lese(
      baueXlsx([{ name: 'Übersicht', zeilen: [['Wärme (kWh)', 'A & B < C']] }]),
    );

    expect(mappe.blatt('Übersicht')[0]).toEqual([
      { art: 'text', text: 'Wärme (kWh)' },
      { art: 'text', text: 'A & B < C' },
    ]);
  });

  it('nennt die vorhandenen Blaetter, wenn eines fehlt', () => {
    const mappe = XlsxArbeitsmappe.lese(baueXlsx([{ name: 'Methodik', zeilen: [['x']] }]));

    expect(() => mappe.blatt('FJ9')).toThrow(/vorhanden: Methodik/);
  });

  it('weist eine Datei ab, die keine Arbeitsmappe ist', () => {
    expect(() => XlsxArbeitsmappe.lese(baueZip([{ name: 'irgendwas.txt', inhalt: 'hallo' }]))).toThrow(XlsxLeseFehler);
    expect(() => XlsxArbeitsmappe.lese(Buffer.from('kein zip'))).toThrow(XlsxLeseFehler);
  });

  it('weist ein Datum vor dem 01.03.1900 ab, statt es um einen Tag daneben zu lesen', () => {
    // Der Schaltjahrfehler 1900 macht die Zaehlung dort mehrdeutig.
    expect(() => XlsxArbeitsmappe.lese(baueXlsx([{ name: 'B', zeilen: [[{ datum: 40 }]] }]))).toThrow(
      /Schaltjahrfehler 1900/,
    );
  });
});
