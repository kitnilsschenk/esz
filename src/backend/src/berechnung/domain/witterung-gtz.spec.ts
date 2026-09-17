import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  baselineNormiert,
  gradtagzahlSumme,
  gradtagzahlTag,
  GTZ_PARAMETER_DEFAULT,
  referenzMonat,
  TAGE_PRO_JAHR_DEFAULT,
} from './witterung-gtz';

/**
 * Lädt die KANONISCHEN Golden Vectors (`tests/golden/verfahren/
 * witterung_gtz_vdi3807@1.json`). Die Repo-Wurzel wird ab dem CWD des
 * Testrunners nach oben gesucht (Marker `pnpm-workspace.yaml`) — bewusst ohne
 * `import.meta`/`__dirname`, damit die Datei unter dem CJS-Typecheck des
 * Backends (`tsc --noEmit`) wie unter ESM-vitest gleichermaßen baut.
 */
interface GoldenDatei {
  readonly toleranz_kwh: number;
  readonly parameter_defaults: { readonly tage_pro_jahr: number };
  readonly vektoren: ReadonlyArray<{
    readonly vektor: string;
    readonly g: number;
    readonly d_m: number;
    readonly b_a_kwh: number;
    readonly gtz_base_kd: number | null;
    readonly gtz_m_ist_kd: number;
    readonly erwartet_r_m_kwh: number;
    readonly zusatz?: { readonly gtz_norm_kd: number; readonly erwartet_b_norm_kwh: number };
  }>;
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
  const pfad = join(dir, 'tests', 'golden', 'verfahren', 'witterung_gtz_vdi3807@1.json');
  return JSON.parse(readFileSync(pfad, 'utf8')) as GoldenDatei;
}

describe('gradtagzahlTag (VDI 3807)', () => {
  it('zählt an einem Heiztag die Differenz t_innen − t_tag', () => {
    // t_tag = 5 °C < Heizgrenze 15 °C ⇒ 20 − 5 = 15 Kd
    expect(gradtagzahlTag(5)).toBe(15);
  });

  it('zählt einen Tag genau AUF der Heizgrenze nicht (strikt kleiner)', () => {
    expect(gradtagzahlTag(GTZ_PARAMETER_DEFAULT.tHeizgrenzeC)).toBe(0);
  });

  it('liefert 0 an einem warmen Tag oberhalb der Heizgrenze', () => {
    expect(gradtagzahlTag(22)).toBe(0);
  });
});

describe('gradtagzahlSumme', () => {
  it('summiert nur die Heiztage einer gemischten Reihe', () => {
    const summe = gradtagzahlSumme([
      { tag: '2027-01-01', tMittelC: 0 }, // 20
      { tag: '2027-01-02', tMittelC: 10 }, // 10
      { tag: '2027-01-03', tMittelC: 18 }, // 0 (warm)
      { tag: '2027-01-04', tMittelC: 15 }, // 0 (auf Grenze)
    ]);
    expect(summe).toBe(30);
  });

  it('liefert 0 für eine leere Tagesreihe', () => {
    expect(gradtagzahlSumme([])).toBe(0);
  });
});

describe('referenzMonat (B12.1) — Validierung', () => {
  const basis = { baselineJahresWertKwh: 20000, tageImMonat: 31, tageProJahr: TAGE_PRO_JAHR_DEFAULT, gtzMonatIst: 400, gtzBase: 3500 };

  it('weist einen Grundlast-Anteil außerhalb [0,1] ab', () => {
    expect(() => referenzMonat({ ...basis, grundlastAnteil: 1.5 })).toThrow(RangeError);
    expect(() => referenzMonat({ ...basis, grundlastAnteil: -0.1 })).toThrow(RangeError);
  });

  it('weist fehlendes GTZ_base ab, solange ein Witterungsanteil existiert (g<1)', () => {
    expect(() => referenzMonat({ ...basis, grundlastAnteil: 0.2, gtzBase: null })).toThrow(/gtzBase/);
    expect(() => referenzMonat({ ...basis, grundlastAnteil: 0.2, gtzBase: 0 })).toThrow(/gtzBase/);
  });

  it('erlaubt fehlendes GTZ_base beim reinen Grundlast-Verbraucher (g=1)', () => {
    expect(referenzMonat({ ...basis, grundlastAnteil: 1, gtzBase: null, gtzMonatIst: 0 })).toBeCloseTo(
      20000 * (31 / TAGE_PRO_JAHR_DEFAULT),
      6,
    );
  });
});

describe('Golden Vectors witterung_gtz_vdi3807@1 (kanonisch, ADR-0006 B12.6)', () => {
  const golden = ladeGoldenVektoren();

  it('deckt genau die drei Kanon-Vektoren ab', () => {
    expect(golden.vektoren.map((v) => v.vektor)).toEqual(['V1', 'V2', 'V3']);
    expect(golden.parameter_defaults.tage_pro_jahr).toBe(TAGE_PRO_JAHR_DEFAULT);
  });

  for (const v of golden.vektoren) {
    it(`${v.vektor}: R_m stimmt mit dem Kern überein (${v.erwartet_r_m_kwh} kWh)`, () => {
      const rM = referenzMonat({
        baselineJahresWertKwh: v.b_a_kwh,
        grundlastAnteil: v.g,
        tageImMonat: v.d_m,
        tageProJahr: golden.parameter_defaults.tage_pro_jahr,
        gtzMonatIst: v.gtz_m_ist_kd,
        gtzBase: v.gtz_base_kd,
      });
      // Auf 3 Nachkommastellen gerundet vergleichen (Persistenz-/Ausweisgrenze),
      // Toleranz aus der Golden-Datei.
      expect(Math.abs(Number(rM.toFixed(3)) - v.erwartet_r_m_kwh)).toBeLessThanOrEqual(golden.toleranz_kwh);
    });

    if (v.zusatz !== undefined) {
      it(`${v.vektor}: B_norm stimmt mit dem Kern überein (${v.zusatz.erwartet_b_norm_kwh} kWh)`, () => {
        const bNorm = baselineNormiert({
          baselineJahresWertKwh: v.b_a_kwh,
          grundlastAnteil: v.g,
          gtzNorm: v.zusatz!.gtz_norm_kd,
          gtzBase: v.gtz_base_kd,
        });
        expect(Math.abs(Number(bNorm.toFixed(3)) - v.zusatz!.erwartet_b_norm_kwh)).toBeLessThanOrEqual(
          golden.toleranz_kwh,
        );
      });
    }
  }
});
