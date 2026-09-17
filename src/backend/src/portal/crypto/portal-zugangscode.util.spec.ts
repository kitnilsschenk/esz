import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  berechneCodeIndex,
  erzeugeKennung,
  erzeugeZugangscode,
  gleichenIndizes,
  normalisiereCode,
} from './portal-zugangscode.util';

const PEPPER = randomBytes(32);

describe('erzeugeZugangscode', () => {
  it('liefert drei Bloecke aus dem verwechslungsfreien Alphabet', () => {
    // Der Code wird von Papier abgetippt: 0/O und 1/I/L duerfen nicht
    // vorkommen, sonst scheitert die Anmeldung an einem Zeichendreher.
    for (let i = 0; i < 200; i += 1) {
      expect(erzeugeZugangscode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
    }
  });

  it('wiederholt sich nicht', () => {
    const codes = new Set(Array.from({ length: 500 }, () => erzeugeZugangscode()));
    expect(codes.size).toBe(500);
  });
});

describe('erzeugeKennung', () => {
  it('liefert die Form EK-XXXXXX aus demselben Alphabet', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(erzeugeKennung()).toMatch(/^EK-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    }
  });
});

describe('normalisiereCode', () => {
  it('behandelt Schreibweisen desselben Codes als denselben Code', () => {
    // Sonst entscheidet die Schreibweise ueber den Anmeldeerfolg.
    const varianten = ['ABCD-EFGH-JKMN', 'abcd efgh jkmn', 'AbCd-EfGh JkMn', ' ABCDEFGHJKMN '];
    const indizes = varianten.map((v) => berechneCodeIndex(v, PEPPER).toString('hex'));

    expect(new Set(indizes).size).toBe(1);
  });

  it('entfernt Trennzeichen und Leerraum', () => {
    expect(normalisiereCode('ab cd-ef')).toBe('ABCDEF');
  });
});

describe('berechneCodeIndex', () => {
  it('ist deterministisch — der Einloese-Pfad muss die Zeile damit FINDEN', () => {
    const a = berechneCodeIndex('ABCD-EFGH-JKMN', PEPPER);
    const b = berechneCodeIndex('ABCD-EFGH-JKMN', PEPPER);

    expect(gleichenIndizes(a, b)).toBe(true);
  });

  it('haengt am Pepper — wer nur die Datenbank liest, kann Codes nicht durchprobieren', () => {
    const mitPepper = berechneCodeIndex('ABCD-EFGH-JKMN', PEPPER);
    const mitAnderem = berechneCodeIndex('ABCD-EFGH-JKMN', randomBytes(32));

    expect(gleichenIndizes(mitPepper, mitAnderem)).toBe(false);
  });

  it('unterscheidet verschiedene Codes', () => {
    expect(gleichenIndizes(berechneCodeIndex('ABCD-EFGH-JKMN', PEPPER), berechneCodeIndex('ABCD-EFGH-JKMP', PEPPER))).toBe(
      false,
    );
  });

  it('liefert 32 Byte (SHA-256)', () => {
    expect(berechneCodeIndex('ABCD-EFGH-JKMN', PEPPER)).toHaveLength(32);
  });
});

describe('gleichenIndizes', () => {
  it('meldet ungleiche Laengen als ungleich, statt zu werfen', () => {
    expect(gleichenIndizes(Buffer.from('ab'), Buffer.from('abc'))).toBe(false);
  });
});
