/**
 * ADR-0006 B12 — Rechenkern der Witterungsbereinigung (Verfahren
 * `witterung_gtz_vdi3807@1`). REINE Domäne: keine I/O, keine NestJS-/DB-/
 * Zeit-Abhängigkeit, vollständig deterministisch. Genau DIESE Funktionen
 * werden von den Golden Vectors (`tests/golden/verfahren/
 * witterung_gtz_vdi3807@1.json`, gespiegelt in
 * `analytics.verfahren_version.golden_vectors`) fixiert; jede Änderung an der
 * Formel MUSS an den Vektoren scheitern, bevor sie an Realdaten scheitert.
 *
 * Formelmodell (B12.1):
 *   B_grund = g · B_a                 (jährlicher Grundlast-Anteil)
 *   B_witt  = (1 − g) · B_a           (jährlicher witterungsabhängiger Anteil)
 *   R_m     = B_grund · (d_m / d_a)  +  B_witt · (GTZ_m^ist / GTZ_base)
 *
 *   • R_m  = witterungsbereinigte MONATS-Referenz (Erwartungswert der Baseline
 *            unter dem IST-Wetter des Monats). Der gemessene Ist-Verbrauch wird
 *            NIE skaliert — nur die Baseline-Erwartung wird auf das Ist-Wetter
 *            gezogen (B5).
 *   • g    = Grundlast-Anteil ∈ [0,1], EXPLIZITER Verfahrensparameter (keine
 *            Schätzung im Kern). g=1 ⇒ reiner Grundlast-Verbraucher, der
 *            Witterungsterm entfällt und GTZ_base darf fehlen.
 *   • d_m  = Kalendertage im Monat; d_a = Tage pro (Baseline-)Jahr (365,25,
 *            Schaltjahr-Glättung, B12.1). Die Grundlast wird tag-anteilig auf
 *            den Monat proratiert, NICHT über die GTZ.
 *   • GTZ  = Gradtagzahl nach VDI 3807 (Einheit Kelvin·Tage = "Kd"). GTZ_base
 *            ist die Gradtagzahl der Baseline-Referenzperiode, GTZ_m^ist die
 *            des abzurechnenden Monats unter IST-Wetter.
 *
 * GTZ_norm (Normwetter-Periode) geht bewusst NICHT in R_m ein — sie dient nur
 * dem Ausweis der normierten Jahres-Baseline `B_norm` (baselineNormiert) und
 * kürzt sich aus der Einsparrechnung heraus (B12.1).
 */

/** VDI-3807-Standardparameter (B12.1). Kanon; Overrides nur über den Verfahrens-Parametersatz. */
export const GTZ_T_INNEN_C_DEFAULT = 20 as const;
export const GTZ_T_HEIZGRENZE_C_DEFAULT = 15 as const;
/** Tage pro Baseline-Jahr — 365,25 glättet Schaltjahre (B12.1). */
export const TAGE_PRO_JAHR_DEFAULT = 365.25 as const;

export interface GtzParameter {
  /** Angenommene Innentemperatur t_i in °C (VDI 3807, Default 20). */
  readonly tInnenC: number;
  /** Heizgrenztemperatur t_h in °C (VDI 3807, Default 15). Nur Tage mit t < t_h zählen. */
  readonly tHeizgrenzeC: number;
}

export const GTZ_PARAMETER_DEFAULT: GtzParameter = {
  tInnenC: GTZ_T_INNEN_C_DEFAULT,
  tHeizgrenzeC: GTZ_T_HEIZGRENZE_C_DEFAULT,
};

export interface TagesTemperatur {
  /** Kalendertag (lokale Tag-Zeitzone, je Lauf eingefroren) — ISO `YYYY-MM-DD`. */
  readonly tag: string;
  /** Tagesmitteltemperatur in °C. */
  readonly tMittelC: number;
}

/**
 * VDI 3807 Blatt 1 — Tages-Gradtagzahl: (t_i − t_tag) an Heiztagen
 * (t_tag < t_h), sonst 0. Ergebnis stets ≥ 0 (an einem Heiztag ist
 * t_tag < t_h ≤ t_i, also t_i − t_tag > 0).
 */
export function gradtagzahlTag(tMittelC: number, params: GtzParameter = GTZ_PARAMETER_DEFAULT): number {
  return tMittelC < params.tHeizgrenzeC ? params.tInnenC - tMittelC : 0;
}

/**
 * Summierte Gradtagzahl über eine Tagesreihe (z. B. ein Monat oder die
 * Baseline-Referenzperiode). Der Aufrufer stellt die korrekte, lückenfreie
 * Tagesmenge bereit — der Kern summiert nur, er füllt keine Lücken.
 */
export function gradtagzahlSumme(
  tage: readonly TagesTemperatur[],
  params: GtzParameter = GTZ_PARAMETER_DEFAULT,
): number {
  let summe = 0;
  for (const t of tage) {
    summe += gradtagzahlTag(t.tMittelC, params);
  }
  return summe;
}

export interface ReferenzMonatEingang {
  /** B_a — Jahres-Baselinewert in kWh. */
  readonly baselineJahresWertKwh: number;
  /** g — Grundlast-Anteil ∈ [0,1]. */
  readonly grundlastAnteil: number;
  /** d_m — Kalendertage im abzurechnenden Monat. */
  readonly tageImMonat: number;
  /** d_a — Tage pro Baseline-Jahr (Default 365,25). */
  readonly tageProJahr: number;
  /** GTZ_m^ist — Gradtagzahl des Monats unter IST-Wetter (Kd). */
  readonly gtzMonatIst: number;
  /**
   * GTZ_base — Gradtagzahl der Baseline-Referenzperiode (Kd). Darf nur dann
   * `null` sein, wenn kein Witterungsanteil existiert (g = 1); andernfalls
   * fehlt der Bezug für die Skalierung → Fehler.
   */
  readonly gtzBase: number | null;
}

/**
 * B12.1 — witterungsbereinigte MONATS-Referenz R_m in kWh. Voll­präzises
 * Ergebnis (kein Runden im Kern; Rundung erst an der Persistenz-/Ausweisgrenze).
 *
 * @throws RangeError bei g ∉ [0,1], d_a ≤ 0, d_m < 0 oder fehlendem/nicht
 *         positivem GTZ_base trotz vorhandenem Witterungsanteil.
 */
export function referenzMonat(eingang: ReferenzMonatEingang): number {
  const { baselineJahresWertKwh: bA, grundlastAnteil: g, tageImMonat: dM, tageProJahr: dA } = eingang;

  if (!Number.isFinite(g) || g < 0 || g > 1) {
    throw new RangeError(`grundlastAnteil g muss in [0,1] liegen (war: ${g}).`);
  }
  if (!Number.isFinite(dA) || dA <= 0) {
    throw new RangeError(`tageProJahr d_a muss > 0 sein (war: ${dA}).`);
  }
  if (!Number.isFinite(dM) || dM < 0) {
    throw new RangeError(`tageImMonat d_m muss >= 0 sein (war: ${dM}).`);
  }

  const bGrund = g * bA;
  const bWitt = (1 - g) * bA;
  const grundTerm = bGrund * (dM / dA);

  // g=1 ⇒ bWitt=0: reiner Grundlast-Verbraucher, GTZ_base darf fehlen (Golden Vector V2).
  if (bWitt === 0) {
    return grundTerm;
  }
  if (eingang.gtzBase === null || !Number.isFinite(eingang.gtzBase) || eingang.gtzBase <= 0) {
    throw new RangeError(
      `gtzBase muss > 0 sein, sobald ein Witterungsanteil (g<1) existiert (war: ${eingang.gtzBase}).`,
    );
  }
  const wittTerm = bWitt * (eingang.gtzMonatIst / eingang.gtzBase);
  return grundTerm + wittTerm;
}

export interface BaselineNormiertEingang {
  /** B_a — Jahres-Baselinewert in kWh. */
  readonly baselineJahresWertKwh: number;
  /** g — Grundlast-Anteil ∈ [0,1]. */
  readonly grundlastAnteil: number;
  /** GTZ_norm — Gradtagzahl der Normwetter-Referenzperiode (Kd). */
  readonly gtzNorm: number;
  /** GTZ_base — Gradtagzahl der Baseline-Referenzperiode (Kd); wie oben null nur bei g=1. */
  readonly gtzBase: number | null;
}

/**
 * B12.1 — auf Normwetter bezogene JAHRES-Baseline B_norm in kWh (nur Ausweis,
 * fließt NICHT in R_m/Einsparung ein). Grundlast bleibt jahresvoll (keine
 * Tagesproratierung), der Witterungsanteil wird von der Baseline- auf die
 * Normperiode skaliert:
 *   B_norm = g·B_a + (1−g)·B_a · (GTZ_norm / GTZ_base)
 */
export function baselineNormiert(eingang: BaselineNormiertEingang): number {
  const { baselineJahresWertKwh: bA, grundlastAnteil: g } = eingang;

  if (!Number.isFinite(g) || g < 0 || g > 1) {
    throw new RangeError(`grundlastAnteil g muss in [0,1] liegen (war: ${g}).`);
  }

  const bGrund = g * bA;
  const bWitt = (1 - g) * bA;
  if (bWitt === 0) {
    return bGrund;
  }
  if (eingang.gtzBase === null || !Number.isFinite(eingang.gtzBase) || eingang.gtzBase <= 0) {
    throw new RangeError(
      `gtzBase muss > 0 sein, sobald ein Witterungsanteil (g<1) existiert (war: ${eingang.gtzBase}).`,
    );
  }
  return bGrund + bWitt * (eingang.gtzNorm / eingang.gtzBase);
}
