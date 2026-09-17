import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { einsparungJahr, portfolioEinsparung } from './einsparung';
import type { AusweisbarerMonat, JahresStatus } from './einsparung';

/**
 * Lädt die KANONISCHEN Golden Vectors (`tests/golden/verfahren/
 * einsparung_foerderjahr_kap91@1.json`, ADR-0007 B13.6). Muster identisch zu
 * `../../berechnung/domain/witterung-gtz.spec.ts` (Repo-Wurzel-Suche ab CWD,
 * Marker `pnpm-workspace.yaml`, bewusst ohne `import.meta`/`__dirname`).
 */
interface GoldenVektorEndkunde {
  readonly vektor: string;
  readonly ebene: 'endkunde_traeger_jahr';
  readonly monatsmenge: readonly string[];
  readonly monate_delta_kwh: Record<string, number>;
  readonly monate_qualitaet?: Record<string, 'belastbar' | 'eingeschraenkt'>;
  readonly floor_prozent?: number;
  readonly erwartete_einsparung_kwh: number | null;
  readonly erwartete_abdeckung_pct?: number;
  readonly erwarteter_status?: JahresStatus;
  readonly ausgeschlossene_monate?: readonly string[];
  readonly status?: string;
}

interface GoldenVektorPortfolio {
  readonly vektor: string;
  readonly ebene: 'portfolio_jahr';
  readonly endkunden_einsparung_kwh: Record<string, number>;
  readonly erwartete_n_t: number;
  readonly erwartete_portfolio_einsparung_kwh: number;
}

interface GoldenDatei {
  readonly toleranz_kwh: number;
  readonly vektoren: ReadonlyArray<GoldenVektorEndkunde | GoldenVektorPortfolio>;
}

function ladeGoldenVektoren(): GoldenDatei {
  let dir = process.cwd();
  for (let i = 0; i < 12; i += 1) {
    try {
      readFileSync(join(dir, 'pnpm-workspace.yaml'));
      break;
    } catch {
      dir = dirname(dir);
    }
  }
  const pfad = join(dir, 'tests', 'golden', 'verfahren', 'einsparung_foerderjahr_kap91@1.json');
  return JSON.parse(readFileSync(pfad, 'utf8')) as GoldenDatei;
}

const golden = ladeGoldenVektoren();

function findeVektor(vektor: string): GoldenVektorEndkunde {
  const gefunden = golden.vektoren.find((v) => v.vektor === vektor);
  if (gefunden === undefined || gefunden.ebene !== 'endkunde_traeger_jahr') {
    throw new Error(`Golden Vector ${vektor} nicht gefunden oder falsche Ebene.`);
  }
  return gefunden;
}

function toMonatsDeltas(vektor: GoldenVektorEndkunde): AusweisbarerMonat[] {
  return Object.entries(vektor.monate_delta_kwh).map(([monat, deltaKwh]) => ({
    monat,
    deltaKwh,
    qualitaetsStufe: vektor.monate_qualitaet?.[monat] ?? 'belastbar',
  }));
}

describe('einsparungJahr (ADR-0007 B13.1-B13.3, Golden Vectors B13.6)', () => {
  it('deckt genau die sechs Kanon-Vektoren ab', () => {
    expect(golden.vektoren.map((v) => v.vektor)).toEqual(['GV1', 'GV2', 'GV3', 'GV4', 'GV5', 'GV6']);
  });

  it('GV1 (Normalfall): E=390,000, Abdeckung 100%, Status belastbar', () => {
    const v = findeVektor('GV1');
    const ergebnis = einsparungJahr({
      monatsDeltas: toMonatsDeltas(v),
      monatsmenge: v.monatsmenge,
      floorProzent: v.floor_prozent ?? 75,
    });
    expect(ergebnis.status).toBe('belastbar');
    expect(ergebnis.einsparungKwh).toBeCloseTo(v.erwartete_einsparung_kwh as number, 3);
    expect(ergebnis.abdeckungPct).toBe(100);
    expect(ergebnis.ausgeschlosseneMonate).toEqual([]);
  });

  it('GV2 (Mehrverbrauch): liefert 40,000 — REGRESSIONSSCHUTZ, NICHT 240,000 (Kappung waere falsch)', () => {
    const v = findeVektor('GV2');
    const ergebnis = einsparungJahr({
      monatsDeltas: toMonatsDeltas(v),
      monatsmenge: v.monatsmenge,
      floorProzent: v.floor_prozent ?? 75,
    });
    expect(ergebnis.einsparungKwh).toBeCloseTo(40, 3);
    expect(ergebnis.einsparungKwh).not.toBeCloseTo(240, 3);
    expect(ergebnis.status).toBe('belastbar');
  });

  it('GV3 (Luecke an der Floor-Grenze): E=240,000, Abdeckung 75%, Status eingeschraenkt', () => {
    const v = findeVektor('GV3');
    const ergebnis = einsparungJahr({
      monatsDeltas: toMonatsDeltas(v),
      monatsmenge: v.monatsmenge,
      floorProzent: v.floor_prozent ?? 75,
    });
    expect(ergebnis.einsparungKwh).toBeCloseTo(240, 3);
    expect(ergebnis.abdeckungPct).toBe(75);
    expect(ergebnis.status).toBe('eingeschraenkt');
    expect(ergebnis.ausgeschlosseneMonate).toEqual(['2027-02-01']);
  });

  it('GV4 (Floor unterschritten): status nicht_nachweisbar, einsparungKwh=NULL — NICHT 220,000', () => {
    const v = findeVektor('GV4');
    const ergebnis = einsparungJahr({
      monatsDeltas: toMonatsDeltas(v),
      monatsmenge: v.monatsmenge,
      floorProzent: v.floor_prozent ?? 75,
    });
    expect(ergebnis.status).toBe('nicht_nachweisbar');
    expect(ergebnis.einsparungKwh).toBeNull();
    expect(ergebnis.abdeckungPct).toBe(50);
    expect(ergebnis.ausgeschlosseneMonate).toEqual(['2027-02-01', '2027-03-01']);
  });

  it('GV5 (Substitution): ist bewusst KEIN einsparungJahr()-Testfall (B13.4) — Regressionsschutz zeigt, warum der Ausschluss VOR dem Kern liegen muss', () => {
    const v = findeVektor('GV5');
    expect(v.status).toBe('ausgeschlossen');
    expect(v.erwartete_einsparung_kwh).toBeNull();

    // Würde man GV5s Monate — die arithmetisch mit GV1 identisch sind, s.
    // Golden-Datei — OHNE die (service-seitige) Substitutions-Prüfung durch
    // den Kern schicken, ergäbe sich 390,000, NICHT der geforderte
    // Ausschluss ohne Zahlenwert. Das demonstriert die B13.4-Architekturregel:
    // Substitution muss VOR `einsparungJahr()` geprüft werden (der Kern
    // selbst kennt den Begriff nicht).
    const ergebnisOhneSubstitutionsPruefung = einsparungJahr({
      monatsDeltas: toMonatsDeltas(v),
      monatsmenge: v.monatsmenge,
      floorProzent: 75,
    });
    expect(ergebnisOhneSubstitutionsPruefung.einsparungKwh).toBeCloseTo(390, 3);
  });

  it('lehnt einen Monat in monatsDeltas ab, der nicht Teil von monatsmenge ist', () => {
    expect(() =>
      einsparungJahr({
        monatsDeltas: [{ monat: '2027-05-01', deltaKwh: 10, qualitaetsStufe: 'belastbar' }],
        monatsmenge: ['2027-01-01'],
        floorProzent: 75,
      }),
    ).toThrow(RangeError);
  });

  it('lehnt eine leere monatsmenge ab (Abdeckungsnenner waere undefiniert)', () => {
    expect(() => einsparungJahr({ monatsDeltas: [], monatsmenge: [], floorProzent: 75 })).toThrow(RangeError);
  });

  it('lehnt floorProzent ausserhalb [0,100] ab', () => {
    expect(() =>
      einsparungJahr({ monatsDeltas: [], monatsmenge: ['2027-01-01'], floorProzent: 150 }),
    ).toThrow(RangeError);
  });
});

describe('portfolioEinsparung (ADR-0007 B13.1 Portfolio-Ebene, Kap. 9.1 Satz 3)', () => {
  it('GV6: N_t=3, Summe=280,000 — REGRESSIONSSCHUTZ, NICHT 430,000 (Kappung von B waere falsch)', () => {
    const v = golden.vektoren.find((x) => x.vektor === 'GV6');
    if (v === undefined || v.ebene !== 'portfolio_jahr') {
      throw new Error('GV6 nicht gefunden oder falsche Ebene.');
    }
    const werte = Object.values(v.endkunden_einsparung_kwh);
    const ergebnis = portfolioEinsparung(werte);
    expect(ergebnis.nT).toBe(v.erwartete_n_t);
    expect(ergebnis.summeKwh).toBeCloseTo(v.erwartete_portfolio_einsparung_kwh, 3);
    expect(ergebnis.summeKwh).not.toBeCloseTo(430, 3);
  });

  it('liefert 0/0 fuer ein leeres Portfolio', () => {
    expect(portfolioEinsparung([])).toEqual({ nT: 0, summeKwh: 0 });
  });
});
