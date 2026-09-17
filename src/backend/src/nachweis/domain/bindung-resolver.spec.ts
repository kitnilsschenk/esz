import { describe, expect, it } from 'vitest';
import { loeseBindungAuf } from './bindung-resolver';
import type { BindungsKandidat } from './bindung-resolver';

function kandidat(overrides: Partial<BindungsKandidat> = {}): BindungsKandidat {
  return {
    berechnungslaufId: 'lauf-1',
    erstelltAt: '2027-02-01T00:00:00.000Z',
    referenzKwh: 200,
    istKwh: 180,
    qualitaetsStufe: 'belastbar',
    parameterHash: 'hash-a',
    rohdatenHash: 'rohdaten-a',
    ...overrides,
  };
}

describe('loeseBindungAuf (ADR-0007 B2/D2 — Mehrdeutigkeit wird NICHT weggedefiniert)', () => {
  it('0 Kandidaten -> kein_kandidat (FJ-02)', () => {
    expect(loeseBindungAuf([])).toEqual({ art: 'kein_kandidat' });
  });

  it('genau 1 Kandidat -> ok, mehrdeutigGleich=false', () => {
    const k = kandidat();
    expect(loeseBindungAuf([k])).toEqual({ art: 'ok', gewaehlt: k, kandidatenAnzahl: 1, mehrdeutigGleich: false });
  });

  it('>=2 Kandidaten mit IDENTISCHEN Werten -> ok, mehrdeutigGleich=true, der juengste (erste) wird gewaehlt', () => {
    const juengster = kandidat({ berechnungslaufId: 'lauf-neu', erstelltAt: '2027-03-01T00:00:00.000Z' });
    const aelterer = kandidat({ berechnungslaufId: 'lauf-alt', erstelltAt: '2027-02-01T00:00:00.000Z' });
    const ergebnis = loeseBindungAuf([juengster, aelterer]);
    expect(ergebnis).toEqual({ art: 'ok', gewaehlt: juengster, kandidatenAnzahl: 2, mehrdeutigGleich: true });
  });

  it('>=2 Kandidaten mit ABWEICHENDEN Werten -> abweichend (FJ-05-Blocker), KEINE stille Erste-Nehmen-Aufloesung', () => {
    const a = kandidat({ berechnungslaufId: 'lauf-a', referenzKwh: 200 });
    const b = kandidat({ berechnungslaufId: 'lauf-b', referenzKwh: 250 });
    expect(loeseBindungAuf([a, b])).toEqual({ art: 'abweichend', kandidatenAnzahl: 2 });
  });

  it('abweichend bereits bei unterschiedlichem istKwh (referenzKwh gleich)', () => {
    const a = kandidat({ istKwh: 180 });
    const b = kandidat({ istKwh: 190 });
    expect(loeseBindungAuf([a, b])).toEqual({ art: 'abweichend', kandidatenAnzahl: 2 });
  });
});
