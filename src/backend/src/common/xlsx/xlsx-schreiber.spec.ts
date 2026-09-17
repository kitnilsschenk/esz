import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { baueXlsx, spaltenName } from './xlsx-schreiber';
import { XlsxArbeitsmappe } from '../../import/xlsx/xlsx-arbeitsmappe';

/**
 * Der XLSX-Schreiber wird gegen den hauseigenen LESER geprüft — und der
 * ZIP-Container zusätzlich gegen `unzip -t`.
 *
 * **Warum beides.** Der Leser ist nachsichtig: Er prüft die CRC32-Prüfsumme
 * nicht. Eine Mappe könnte ihn also anstandslos passieren und beim Empfänger
 * trotzdem als beschädigt gelten — genau der Fehler, der erst beim
 * Adressaten auffällt. `unzip -t` rechnet die Prüfsummen nach und ist damit
 * der strengere der beiden Prüfer.
 */
describe('XLSX-Schreiber', () => {
  function lies(puffer: Buffer): XlsxArbeitsmappe {
    return XlsxArbeitsmappe.lese(puffer);
  }

  /**
   * Der WERT einer Zelle ueber Blatt + 0-basierte Zeilen-/Spaltenposition.
   *
   * Der Leser liefert eine typisierte Zelle (`{art, ...}`); fuer diese Tests
   * zaehlt der blanke Wert — und `undefined` fuer „keine Zelle".
   */
  function zelle(mappe: XlsxArbeitsmappe, blatt: string, zeile: number, spalte: number): unknown {
    const z = mappe.blatt(blatt)[zeile]?.[spalte];
    if (z === undefined) {
      return undefined;
    }
    switch (z.art) {
      case 'text':
        return z.text;
      case 'zahl':
        return z.zahl;
      case 'datum':
        return z.iso;
      case 'bool':
        return z.wert;
    }
  }

  it('schreibt Blattnamen und Zellwerte, die der eigene Leser wiederfindet', () => {
    const puffer = baueXlsx([
      { name: '1_Systemregister', zeilen: [['System-ID', 'Energieträger'], ['S-01', 'Strom']] },
      { name: '2_Messpunkte', zeilen: [['Messpunkt-ID'], ['S-01-MP01']] },
    ]);

    const mappe = lies(puffer);

    expect(mappe.blattNamen).toEqual(['1_Systemregister', '2_Messpunkte']);
    expect(zelle(mappe, '1_Systemregister', 1, 0)).toBe('S-01');
    expect(zelle(mappe, '1_Systemregister', 1, 1)).toBe('Strom');
    expect(zelle(mappe, '2_Messpunkte', 1, 0)).toBe('S-01-MP01');
  });

  it('erzeugt einen ZIP-Container mit GUELTIGEN Pruefsummen', () => {
    // Der hauseigene Leser prueft CRC32 nicht — Excel schon. Ohne diesen
    // Test waere eine Mappe mit CRC32=0 (wie sie der Test-Fixture-Bauer
    // schreibt) unbemerkt durchgegangen.
    const puffer = baueXlsx([{ name: 'Blatt', zeilen: [['Wert mit Umlaut: Grüße'], [42]] }]);
    const verzeichnis = mkdtempSync(path.join(tmpdir(), 'edms-xlsx-'));
    const datei = path.join(verzeichnis, 'probe.xlsx');
    writeFileSync(datei, puffer);

    // `unzip -t` prueft jede Pruefsumme und meldet sich mit Exit != 0, wenn
    // eine nicht stimmt.
    const ausgabe = execFileSync('unzip', ['-t', datei], { encoding: 'utf8' });

    expect(ausgabe).toContain('No errors detected');
  });

  it('schreibt Zahlen als Zahlen, nicht als Text', () => {
    const mappe = lies(baueXlsx([{ name: 'B', zeilen: [[1250000, 0.126]] }]));

    expect(zelle(mappe, 'B', 0, 0)).toBe(1250000);
    expect(zelle(mappe, 'B', 0, 1)).toBe(0.126);
  });

  it('schreibt Formeln OHNE zwischengespeichertes Ergebnis', () => {
    // Ein mitgeschriebener Wert muesste zur Formel passen. Taete er es
    // nicht, stuende in einem Nachweis eine Zahl, die niemand nachrechnen
    // kann. Das Tabellenprogramm rechnet beim Oeffnen (`fullCalcOnLoad`).
    const puffer = baueXlsx([{ name: 'B', zeilen: [[{ formel: 'SUM(A2:A5)' }]] }]);

    const roh = puffer.toString('latin1');
    expect(roh.length).toBeGreaterThan(0);
    // Das Blatt liegt deflate-komprimiert vor — geprueft wird ueber den Leser:
    // Eine Formelzelle ohne `<v>` hat keinen Wert.
    expect(zelle(lies(puffer), 'B', 0, 0)).toBeUndefined();
  });

  it('maskiert XML-Sonderzeichen in Texten', () => {
    const mappe = lies(baueXlsx([{ name: 'B', zeilen: [['Müller & Söhne <GmbH>']] }]));

    expect(zelle(mappe, 'B', 0, 0)).toBe('Müller & Söhne <GmbH>');
  });

  it('laesst leere Zellen weg, statt sie als Leerstring zu schreiben', () => {
    // Ein Leerstring und „nichts erfasst" sind im Nachweis verschiedene
    // Aussagen.
    const mappe = lies(baueXlsx([{ name: 'B', zeilen: [['A', null, 'C']] }]));

    expect(zelle(mappe, 'B', 0, 0)).toBe('A');
    expect(zelle(mappe, 'B', 0, 1)).toBeUndefined();
    expect(zelle(mappe, 'B', 0, 2)).toBe('C');
  });

  it('kuerzt zu lange Blattnamen und ersetzt verbotene Zeichen', () => {
    // Excel meldet die Datei sonst als beschaedigt — lieber hier kuerzen als
    // dort scheitern.
    const mappe = lies(baueXlsx([{ name: 'Ein sehr langer Blattname mit [Klammern] und /Schraegstrich', zeilen: [['x']] }]));

    const name = mappe.blattNamen[0] ?? '';
    expect(name.length).toBeLessThanOrEqual(31);
    expect(name).not.toMatch(/[[\]:*?/\\]/);
  });

  it('ist DETERMINISTISCH — zweimal dieselben Daten ergeben dieselbe Datei', () => {
    // Ein Nachweis-Artefakt wird ueber seinen SHA-256 gefuehrt. Mit der
    // aktuellen Uhrzeit im ZIP-Eintragskopf waere jeder Download eine andere
    // Datei, und jeder erneute Abgleich ein falscher Alarm.
    const daten = [{ name: 'B', zeilen: [['x', 1]] }];

    expect(baueXlsx(daten).equals(baueXlsx(daten))).toBe(true);
  });

  it('weist nicht darstellbare Zahlen ab, statt eine kaputte Mappe zu schreiben', () => {
    expect(() => baueXlsx([{ name: 'B', zeilen: [[Number.NaN]] }])).toThrow(/NaN/);
  });

  it('bildet Spaltenindizes auch jenseits von Z ab', () => {
    expect(spaltenName(0)).toBe('A');
    expect(spaltenName(25)).toBe('Z');
    expect(spaltenName(26)).toBe('AA');
    expect(spaltenName(27)).toBe('AB');
  });

  it('verlangt mindestens ein Blatt', () => {
    expect(() => baueXlsx([])).toThrow(/mindestens ein Blatt/);
  });
});
