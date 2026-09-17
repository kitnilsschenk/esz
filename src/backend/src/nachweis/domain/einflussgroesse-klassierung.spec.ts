import { describe, expect, it } from 'vitest';
import { klassifiziereEinflussgroesse } from './einflussgroesse-klassierung';

describe('klassifiziereEinflussgroesse() — Auflage A15 (Datenminimierung)', () => {
  it.each([
    [1, '1-2'],
    [2, '1-2'],
    [3, '3-4'],
    [4, '3-4'],
    [5, '5-6'],
    [6, '5-6'],
    [7, '7+'],
    [100, '7+'],
  ])('personenanzahl=%i -> Klasse %s', (wert, erwarteteKlasse) => {
    expect(klassifiziereEinflussgroesse({ groesseCode: 'personenanzahl', wertNum: wert, wertCode: null })).toBe(erwarteteKlasse);
  });

  it.each([
    [10, '<60'],
    [59.999, '<60'],
    [60, '60-99'],
    [99.999, '60-99'],
    [100, '100-149'],
    [149.999, '100-149'],
    [150, '150-249'],
    [249.999, '150-249'],
    [250, '250+'],
    [1000, '250+'],
  ])('nutzflaeche=%i m² -> Klasse %s', (wert, erwarteteKlasse) => {
    expect(klassifiziereEinflussgroesse({ groesseCode: 'nutzflaeche', wertNum: wert, wertCode: null })).toBe(erwarteteKlasse);
  });

  it('liefert undefined statt einer Klasse bei fehlendem/negativem/NaN-Zahlenwert (fail-closed)', () => {
    expect(klassifiziereEinflussgroesse({ groesseCode: 'personenanzahl', wertNum: null, wertCode: null })).toBeUndefined();
    expect(klassifiziereEinflussgroesse({ groesseCode: 'personenanzahl', wertNum: -1, wertCode: null })).toBeUndefined();
    expect(klassifiziereEinflussgroesse({ groesseCode: 'personenanzahl', wertNum: Number.NaN, wertCode: null })).toBeUndefined();
  });

  it('reicht codierte Groessen (nutzungszweck/energietraeger_mix/geraeteabschaffung) UNVERAENDERT als wertCode durch', () => {
    expect(klassifiziereEinflussgroesse({ groesseCode: 'nutzungszweck', wertNum: null, wertCode: 'wohnen' })).toBe('wohnen');
    expect(klassifiziereEinflussgroesse({ groesseCode: 'energietraeger_mix', wertNum: null, wertCode: 'gas_strom' })).toBe('gas_strom');
  });

  it('liefert niemals den Rohwert einer klassierbaren Groesse als Klasse', () => {
    const klasse = klassifiziereEinflussgroesse({ groesseCode: 'personenanzahl', wertNum: 3, wertCode: null });
    expect(klasse).not.toBe('3');
    expect(klasse).toBe('3-4');
  });
});
