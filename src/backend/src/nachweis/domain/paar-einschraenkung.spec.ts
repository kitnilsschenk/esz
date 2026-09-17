import { describe, expect, it } from 'vitest';
import { klassifiziereAnschlussnutzerEinschraenkung, klassifiziereEndkundeEinschraenkung } from './paar-einschraenkung';

describe('klassifiziereEndkundeEinschraenkung (ADR-0007 A11/C4, FJ-07a/b/c)', () => {
  it('aktiv -> kein Befund, kein Ausschluss', () => {
    const ergebnis = klassifiziereEndkundeEinschraenkung({ verarbeitungsStatus: 'aktiv', einschraenkungGrundCode: null });
    expect(ergebnis).toEqual({ regelCode: null, schwere: null, paarAusschluss: false, grundFehlend: false });
  });

  it('geloescht -> FJ-07a, hinweis, KEIN Ausschluss (Art. 17 vollzogen, regulaerer Ausweis)', () => {
    const ergebnis = klassifiziereEndkundeEinschraenkung({ verarbeitungsStatus: 'geloescht', einschraenkungGrundCode: null });
    expect(ergebnis.regelCode).toBe('FJ-07a');
    expect(ergebnis.schwere).toBe('hinweis');
    expect(ergebnis.paarAusschluss).toBe(false);
  });

  it.each(['art18_1a_richtigkeit', 'art18_1c_rechtsverteidigung_betroffener'] as const)(
    'gesperrt mit Grund %s -> FJ-07b, warnung, KEIN Ausschluss (Ausweis MIT Kennzeichnung)',
    (grund) => {
      const ergebnis = klassifiziereEndkundeEinschraenkung({ verarbeitungsStatus: 'gesperrt', einschraenkungGrundCode: grund });
      expect(ergebnis.regelCode).toBe('FJ-07b');
      expect(ergebnis.schwere).toBe('warnung');
      expect(ergebnis.paarAusschluss).toBe(false);
      expect(ergebnis.grundFehlend).toBe(false);
    },
  );

  it.each(['art18_1b_unrechtmaessig', 'art18_1d_widerspruch'] as const)(
    'gesperrt mit Grund %s -> FJ-07c, blocker (paar-scoped), Ausschluss',
    (grund) => {
      const ergebnis = klassifiziereEndkundeEinschraenkung({ verarbeitungsStatus: 'gesperrt', einschraenkungGrundCode: grund });
      expect(ergebnis.regelCode).toBe('FJ-07c');
      expect(ergebnis.schwere).toBe('blocker');
      expect(ergebnis.paarAusschluss).toBe(true);
      expect(ergebnis.grundFehlend).toBe(false);
    },
  );

  it('gesperrt OHNE Grund (Bestandsdaten) -> fail-closed wie FJ-07c behandelt, grundFehlend=true', () => {
    const ergebnis = klassifiziereEndkundeEinschraenkung({ verarbeitungsStatus: 'gesperrt', einschraenkungGrundCode: null });
    expect(ergebnis.regelCode).toBe('FJ-07c');
    expect(ergebnis.schwere).toBe('blocker');
    expect(ergebnis.paarAusschluss).toBe(true);
    expect(ergebnis.grundFehlend).toBe(true);
  });

  it('gesperrt mit UNBEKANNTEM Grund-Code -> ebenfalls fail-closed wie FJ-07c (Defense-in-Depth gegen Datendrift)', () => {
    const ergebnis = klassifiziereEndkundeEinschraenkung({ verarbeitungsStatus: 'gesperrt', einschraenkungGrundCode: 'irgendwas_unbekanntes' });
    expect(ergebnis.regelCode).toBe('FJ-07c');
    expect(ergebnis.paarAusschluss).toBe(true);
    expect(ergebnis.grundFehlend).toBe(true);
  });
});

describe('klassifiziereAnschlussnutzerEinschraenkung (ADR-0006 P4/ADR-0007 A12, FJ-11a/b/c)', () => {
  it('aktiv -> kein Befund, kein Ausschluss', () => {
    const ergebnis = klassifiziereAnschlussnutzerEinschraenkung({ verarbeitungsStatus: 'aktiv', einschraenkungGrundCode: null });
    expect(ergebnis).toEqual({ regelCode: null, schwere: null, paarAusschluss: false, grundFehlend: false });
  });

  it('geloescht -> FJ-11a, hinweis, KEIN Ausschluss (Analogon zu FJ-07a)', () => {
    const ergebnis = klassifiziereAnschlussnutzerEinschraenkung({ verarbeitungsStatus: 'geloescht', einschraenkungGrundCode: null });
    expect(ergebnis.regelCode).toBe('FJ-11a');
    expect(ergebnis.schwere).toBe('hinweis');
    expect(ergebnis.paarAusschluss).toBe(false);
  });

  it('gesperrt (energy.anschlussnutzer kennt HEUTE keinen Grund-Code -> IMMER null) -> FJ-11c, fail-closed, Ausschluss, grundFehlend=true', () => {
    const ergebnis = klassifiziereAnschlussnutzerEinschraenkung({ verarbeitungsStatus: 'gesperrt', einschraenkungGrundCode: null });
    expect(ergebnis.regelCode).toBe('FJ-11c');
    expect(ergebnis.schwere).toBe('blocker');
    expect(ergebnis.paarAusschluss).toBe(true);
    expect(ergebnis.grundFehlend).toBe(true);
  });

  it.each(['art18_1a_richtigkeit', 'art18_1c_rechtsverteidigung_betroffener'] as const)(
    'gesperrt mit (kuenftigem) Grund %s -> FJ-11b, warnung, KEIN Ausschluss (Vorbereitung, s. Domain-Dok)',
    (grund) => {
      const ergebnis = klassifiziereAnschlussnutzerEinschraenkung({ verarbeitungsStatus: 'gesperrt', einschraenkungGrundCode: grund });
      expect(ergebnis.regelCode).toBe('FJ-11b');
      expect(ergebnis.schwere).toBe('warnung');
      expect(ergebnis.paarAusschluss).toBe(false);
    },
  );
});
