import { describe, expect, it } from 'vitest';
import { berechneEinreichungDifferenz, klassifiziereDifferenzRichtung, klassifiziereZeilenRichtung } from './einreichung-differenz';

const EK1 = 'e1111111-1111-1111-1111-111111111111';
const EK2 = 'e2222222-2222-2222-2222-222222222222';

describe('berechneEinreichungDifferenz() — B7 Punkt 4 (Differenz-Report)', () => {
  it('berechnet delta = neu - alt fuer ein unveraendertes Paar', () => {
    const zeilen = berechneEinreichungDifferenz(
      [{ endkundeId: EK1, energietraeger: 'gas', einsparungKwhEndenergie: 100 }],
      [{ endkundeId: EK1, energietraeger: 'gas', einsparungKwhEndenergie: 130 }],
    );
    expect(zeilen).toEqual([{ endkundeId: EK1, energietraeger: 'gas', wertAltKwh: 100, wertNeuKwh: 130, deltaKwh: 30 }]);
  });

  it('behandelt einen Statuswechsel nicht_nachweisbar -> ausgewiesen als vollen Zugang (alt=null)', () => {
    const zeilen = berechneEinreichungDifferenz(
      [{ endkundeId: EK1, energietraeger: 'gas', einsparungKwhEndenergie: null }],
      [{ endkundeId: EK1, energietraeger: 'gas', einsparungKwhEndenergie: 200 }],
    );
    expect(zeilen).toEqual([{ endkundeId: EK1, energietraeger: 'gas', wertAltKwh: null, wertNeuKwh: 200, deltaKwh: 200 }]);
  });

  it('behandelt einen Statuswechsel ausgewiesen -> ausgeschlossen als vollen Abgang (neu=null)', () => {
    const zeilen = berechneEinreichungDifferenz(
      [{ endkundeId: EK1, energietraeger: 'gas', einsparungKwhEndenergie: 200 }],
      [{ endkundeId: EK1, energietraeger: 'gas', einsparungKwhEndenergie: null }],
    );
    expect(zeilen).toEqual([{ endkundeId: EK1, energietraeger: 'gas', wertAltKwh: 200, wertNeuKwh: null, deltaKwh: -200 }]);
  });

  it('nimmt ein Paar auf, das nur in einer der beiden Mengen existiert', () => {
    const zeilen = berechneEinreichungDifferenz([], [{ endkundeId: EK1, energietraeger: 'gas', einsparungKwhEndenergie: 50 }]);
    expect(zeilen).toEqual([{ endkundeId: EK1, energietraeger: 'gas', wertAltKwh: null, wertNeuKwh: 50, deltaKwh: 50 }]);
  });

  it('sortiert deterministisch nach (endkundeId, energietraeger)', () => {
    const zeilen = berechneEinreichungDifferenz(
      [],
      [
        { endkundeId: EK2, energietraeger: 'gas', einsparungKwhEndenergie: 1 },
        { endkundeId: EK1, energietraeger: 'strom', einsparungKwhEndenergie: 1 },
        { endkundeId: EK1, energietraeger: 'gas', einsparungKwhEndenergie: 1 },
      ],
    );
    expect(zeilen.map((z) => `${z.endkundeId}:${z.energietraeger}`)).toEqual([`${EK1}:gas`, `${EK1}:strom`, `${EK2}:gas`]);
  });

  it('ist bei identischer Eingabe deterministisch reproduzierbar (Determinismus-Kernanforderung)', () => {
    const alt = [{ endkundeId: EK1, energietraeger: 'gas', einsparungKwhEndenergie: 100 }];
    const neu = [{ endkundeId: EK1, energietraeger: 'gas', einsparungKwhEndenergie: 130 }];
    expect(berechneEinreichungDifferenz(alt, neu)).toEqual(berechneEinreichungDifferenz(alt, neu));
  });
});

describe('klassifiziereDifferenzRichtung() — B10-Verbotsliste (nur klassiert, nie ein Betrag)', () => {
  it('klassifiziert eine positive Summe als hoeher', () => {
    expect(klassifiziereDifferenzRichtung([{ endkundeId: EK1, energietraeger: 'gas', wertAltKwh: 0, wertNeuKwh: 10, deltaKwh: 10 }])).toBe('hoeher');
  });

  it('klassifiziert eine negative Summe als niedriger', () => {
    expect(klassifiziereDifferenzRichtung([{ endkundeId: EK1, energietraeger: 'gas', wertAltKwh: 10, wertNeuKwh: 0, deltaKwh: -10 }])).toBe('niedriger');
  });

  it('klassifiziert eine Summe von 0 als unveraendert', () => {
    expect(
      klassifiziereDifferenzRichtung([
        { endkundeId: EK1, energietraeger: 'gas', wertAltKwh: 10, wertNeuKwh: 15, deltaKwh: 5 },
        { endkundeId: EK2, energietraeger: 'gas', wertAltKwh: 15, wertNeuKwh: 10, deltaKwh: -5 },
      ]),
    ).toBe('unveraendert');
  });

  it('klassifiziert eine leere Zeilenliste als unveraendert', () => {
    expect(klassifiziereDifferenzRichtung([])).toBe('unveraendert');
  });
});

describe('klassifiziereZeilenRichtung()', () => {
  it.each([
    [10, 'hoeher'],
    [-10, 'niedriger'],
    [0, 'unveraendert'],
  ] as const)('delta=%i -> %s', (delta, erwartet) => {
    expect(klassifiziereZeilenRichtung(delta)).toBe(erwartet);
  });
});
