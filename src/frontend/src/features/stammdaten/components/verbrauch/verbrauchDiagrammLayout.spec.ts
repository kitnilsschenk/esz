import { describe, expect, it } from 'vitest';
import {
  BALKEN_MAX_BREITE,
  balkenPfad,
  berechneBalkenPositionen,
  berechneMaxWert,
  berechneRand,
  berechneYAchse,
  maxOf,
  waehleAchsenLabelIndizes,
} from './verbrauchDiagrammLayout';

describe('berechneYAchse', () => {
  it('liefert nur den Tick 0, wenn der Maximalwert 0 (oder kleiner) ist', () => {
    expect(berechneYAchse(0)).toEqual([0]);
    expect(berechneYAchse(-5)).toEqual([0]);
  });

  it('rundet auf "saubere" Zahlen (1/2/5 × 10^n) und der letzte Tick deckt den Maximalwert ab', () => {
    const ticks = berechneYAchse(93);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(93);
    // Schrittweite zwischen zwei Ticks ist konstant.
    const schritte = new Set(ticks.slice(1).map((tick, index) => tick - (ticks[index] ?? 0)));
    expect(schritte.size).toBe(1);
  });
});

describe('berechneMaxWert', () => {
  it('ignoriert Lücken (`undefined`) bei der Maximum-Bildung', () => {
    expect(berechneMaxWert([{ werte: [1, undefined, 7, undefined] }, { werte: [undefined, 3] }])).toBe(7);
  });

  it('liefert 0 bei ausschließlich Lücken', () => {
    expect(berechneMaxWert([{ werte: [undefined, undefined] }])).toBe(0);
  });
});

describe('maxOf', () => {
  it('verhält sich wie Math.max, aber ohne Spread (robust bei großen Arrays)', () => {
    expect(maxOf([1, 5, 2])).toBe(5);
    expect(maxOf([])).toBe(0);
  });
});

describe('berechneBalkenPositionen', () => {
  it('deckelt die Balkenbreite auf BALKEN_MAX_BREITE, selbst bei wenigen breiten Buckets', () => {
    const positionen = berechneBalkenPositionen(2, 1, 600);
    for (const position of positionen) {
      expect(position.balkenBreite).toBeLessThanOrEqual(BALKEN_MAX_BREITE);
    }
  });

  it('erzeugt für JEDE Bucket×Serie-Kombination GENAU eine Position, ohne Überlappung', () => {
    const anzahlBuckets = 5;
    const anzahlSerien = 3;
    const positionen = berechneBalkenPositionen(anzahlBuckets, anzahlSerien, 600);
    expect(positionen).toHaveLength(anzahlBuckets * anzahlSerien);

    const sortiert = [...positionen].sort((a, b) => a.balkenX - b.balkenX);
    for (let index = 1; index < sortiert.length; index += 1) {
      const vorheriger = sortiert[index - 1];
      const aktueller = sortiert[index];
      if (vorheriger === undefined || aktueller === undefined) {
        continue;
      }
      // Kein Balken beginnt, bevor der vorherige (inkl. seiner Breite) endet — keine Überlappung.
      expect(aktueller.balkenX).toBeGreaterThanOrEqual(vorheriger.balkenX + vorheriger.balkenBreite - 0.001);
    }
  });

  it('liefert eine leere Liste ohne Buckets oder ohne Serien', () => {
    expect(berechneBalkenPositionen(0, 3, 600)).toEqual([]);
    expect(berechneBalkenPositionen(5, 0, 600)).toEqual([]);
  });
});

describe('balkenPfad', () => {
  it('liefert einen LEEREN Pfad bei Höhe 0 (Lücken/Nullwerte werden NIE als Balken gezeichnet)', () => {
    expect(balkenPfad(10, 100, 20, 0)).toBe('');
    expect(balkenPfad(10, 100, 20, -1)).toBe('');
  });

  it('liefert einen nicht-leeren Pfad bei positiver Höhe', () => {
    expect(balkenPfad(10, 100, 20, 40)).not.toBe('');
  });
});

describe('berechneRand', () => {
  it('reserviert zusätzlichen rechten Rand für die Direktbeschriftung', () => {
    const ohneDirektlabel = berechneRand(0);
    const mitDirektlabel = berechneRand(80);
    expect(mitDirektlabel.rechts).toBeGreaterThan(ohneDirektlabel.rechts);
  });
});

describe('waehleAchsenLabelIndizes', () => {
  it('wählt bei ausreichend Platz JEDEN Bucket-Index', () => {
    expect(waehleAchsenLabelIndizes(4, 100, 20)).toEqual([0, 1, 2, 3]);
  });

  it('dünnt Labels aus, wenn sie sonst kollidieren würden — Index 0 ist immer dabei', () => {
    const indizes = waehleAchsenLabelIndizes(30, 10, 60);
    expect(indizes[0]).toBe(0);
    // Kein Index-Paar liegt näher beieinander, als die geschätzte Label-Breite erlaubt.
    for (let i = 1; i < indizes.length; i += 1) {
      const differenz = (indizes[i] ?? 0) - (indizes[i - 1] ?? 0);
      expect(differenz * 10).toBeGreaterThanOrEqual(60);
    }
  });

  it('liefert eine leere Liste ohne Buckets', () => {
    expect(waehleAchsenLabelIndizes(0, 100, 20)).toEqual([]);
  });
});
