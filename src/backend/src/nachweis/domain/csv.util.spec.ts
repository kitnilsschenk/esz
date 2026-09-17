import { describe, expect, it } from 'vitest';
import { csvDokument, csvFeld, csvZeile, formatiereDezimal } from './csv.util';

describe('csvFeld() — RFC 4180 Feld-Quoting', () => {
  it('laesst ein einfaches Feld unveraendert', () => {
    expect(csvFeld('EK-0001')).toBe('EK-0001');
  });

  it('quotet ein Feld mit Komma', () => {
    expect(csvFeld('a,b')).toBe('"a,b"');
  });

  it('quotet ein Feld mit doppelten Anfuehrungszeichen und verdoppelt sie', () => {
    expect(csvFeld('sagt "hallo"')).toBe('"sagt ""hallo"""');
  });

  it('quotet ein Feld mit eingebettetem CRLF', () => {
    expect(csvFeld('zeile1\r\nzeile2')).toBe('"zeile1\r\nzeile2"');
  });

  it('liefert ein leeres Feld fuer null/undefined (NIE das Literal "null")', () => {
    expect(csvFeld(null)).toBe('');
    expect(csvFeld(undefined)).toBe('');
  });

  it('serialisiert boolean/number ohne Locale-Formatierung', () => {
    expect(csvFeld(true)).toBe('true');
    expect(csvFeld(42)).toBe('42');
  });
});

describe('csvDokument() — deterministisches CSV-Dokument', () => {
  it('rendert Header + Zeilen mit CRLF nach JEDER Zeile (auch der letzten)', () => {
    const dokument = csvDokument(['a', 'b'], [['1', '2'], ['3,4', '5']]);
    expect(dokument).toBe('a,b\r\n1,2\r\n"3,4",5\r\n');
  });

  it('ist bei identischer Eingabe bit-identisch reproduzierbar', () => {
    const eingabe = { header: ['x', 'y'], zeilen: [['1', '2']] } as const;
    const erst = csvDokument(eingabe.header, eingabe.zeilen);
    const zweit = csvDokument(eingabe.header, eingabe.zeilen);
    expect(erst).toBe(zweit);
  });
});

describe('csvZeile()', () => {
  it('verbindet Felder mit Komma', () => {
    expect(csvZeile(['a', 1, null, true])).toBe('a,1,,true');
  });
});

describe('formatiereDezimal()', () => {
  it('formatiert mit fester Nachkommastellenzahl, Punkt als Dezimaltrenner', () => {
    expect(formatiereDezimal(1234.5, 3)).toBe('1234.500');
    expect(formatiereDezimal(0.1, 2)).toBe('0.10');
  });

  it('normalisiert rundungsbedingte negative Null auf "0.000"', () => {
    expect(formatiereDezimal(-0.0001, 3)).toBe('0.000');
    expect(formatiereDezimal(-0, 3)).toBe('0.000');
  });

  it('behaelt ein echtes negatives Vorzeichen (Mehrverbrauch, B13.2)', () => {
    expect(formatiereDezimal(-42.123, 3)).toBe('-42.123');
  });
});
