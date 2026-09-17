/**
 * ADR-0007 B13 — Rechenkern der Förderjahres-Einsparaggregation (Verfahren
 * `einsparung_foerderjahr_kap91@1`, `analytics.verfahren_version` art=
 * `einsparaggregation`, V0024). REINE Domäne: keine I/O, keine NestJS-/DB-/
 * Zeit-Abhängigkeit, vollständig deterministisch — exakt das Stilvorbild aus
 * `../../berechnung/domain/witterung-gtz.ts`.
 *
 * Rechtsgrundlage (wörtlich, Technisches Merkblatt v2.2 Kap. 9.1, ADR-0007
 * B13-Kopf): „Einsparungen sind zeitanteilig zu ermitteln, soweit der für die
 * Berechnung der Einsparung relevante Zeitraum kleiner ist als das
 * Förderjahr. Mögliche Mehrverbräuche bei Endkunden sind mit den vorhandenen
 * Einsparungen bei anderen Endkunden zu verrechnen. Die Einsparungen des
 * Zuwendungsempfängers werden über die Gesamtzahl der Endkunden berechnet."
 *
 * Formelmodell (B13.1, drei Ebenen — Ebene 0 ist ADR-0006-Eigentum, wird HIER
 * nur gelesen, nie neu aggregiert, B7):
 *   E_{k,t}^{FJ} = Σ_{m ∈ M_FJ_ausweisbar} (R_m − A_m)   [kWh Endenergie]
 *   E_t^{FJ,ZE} = Σ_k E_{k,t}^{FJ}                        [kWh Endenergie, Portfolio]
 *
 * KEIN `max(Δ,0)` auf keiner Ebene (B13.2) — eine Kappung wäre eine
 * abstimmungspflichtige „andere Berechnungsmethode" (Kap. 9.1 Satz 4) und
 * überschätzt die Einsparung systematisch (TB-08-Rückforderungsrisiko).
 */

/** Monats-Qualitätsstufe, identisch zur Domäne von `analytics.laufergebnis.qualitaets_stufe` (ADR-0006). */
export type MonatsQualitaetsStufe = 'belastbar' | 'eingeschraenkt' | 'nicht_ausweisbar';

/** Jahres-Status (B13.3) — bewusst EIGENE Domäne (drei Werte, `nicht_nachweisbar` statt `nicht_ausweisbar`). */
export type JahresStatus = 'belastbar' | 'eingeschraenkt' | 'nicht_nachweisbar';

/**
 * Ein AUSWEISBARER Monat (`qualitaets_stufe ≠ nicht_ausweisbar`, B13.1
 * `M_FJ_ausweisbar`) mit seinem VORZEICHENBEHAFTETEN Delta `R_m − A_m` —
 * bereits VOR dieser Funktion durch den Aufrufer aus `analytics.laufergebnis`
 * (via `nachweis.einsparlauf_bindung`) berechnet. Nicht-ausweisbare Monate
 * gehören NICHT in dieses Array (s. `monatsmenge` für den Abdeckungsnenner).
 */
export interface AusweisbarerMonat {
  /** ISO `YYYY-MM-01`, Monatserster. */
  readonly monat: string;
  /** R_m − A_m in kWh Endenergie, VORZEICHENBEHAFTET (B13.2 — kein `max(·,0)`). */
  readonly deltaKwh: number;
  /** Nur `belastbar`/`eingeschraenkt` — ein `nicht_ausweisbar`-Monat ist per Definition NICHT ausweisbar. */
  readonly qualitaetsStufe: 'belastbar' | 'eingeschraenkt';
}

export interface EinsparungJahrEingang {
  /** Ausschließlich die AUSWEISBAREN Monate — s. `AusweisbarerMonat`-Dok. */
  readonly monatsDeltas: readonly AusweisbarerMonat[];
  /** M_FJ — die VOLLSTÄNDIGE erwartete Monatsmenge des Förderjahres (Nenner der Abdeckung), NIE aus dem Kalender abgeleitet (B4/O-B1). */
  readonly monatsmenge: readonly string[];
  /**
   * B13.3/B14 (O-B2, „bestätigt, bleibt aber als Parameter implementiert,
   * nicht als Literal") — Jahres-Mindestabdeckung in Prozent (Default-Wert
   * aus dem Verfahrenskatalog: 75). NIEMALS hier als Konstante fest verdrahtet.
   */
  readonly floorProzent: number;
}

export interface EinsparungJahrErgebnis {
  readonly status: JahresStatus;
  /** `null` GENAU DANN, wenn `status === 'nicht_nachweisbar'` (B13.3 — kein Wert, auch wenn arithmetisch berechenbar). */
  readonly einsparungKwh: number | null;
  readonly abdeckungPct: number;
  /** M_FJ \ M_FJ_ausweisbar — jeder Monat, der NICHT in `monatsDeltas` auftaucht. */
  readonly ausgeschlosseneMonate: readonly string[];
}

/**
 * B13.1/B13.2/B13.3 — Förderjahres-Einsparung EINES (Endkunde × Energieträger)
 * -Paares. Reine Verrechnung (Summe der vorzeichenbehafteten Deltas), keine
 * Kappung, keine Hochrechnung nicht-ausweisbarer Monate (B13.3: „ausschluss_
 * nicht_ausweisbar", NICHT `ersatz`/Hochrechnung — das ist in v1 die EINZIGE
 * Lückenregel, s. `bindungs-resolver.ts`/`monats-behandlung.ts`).
 *
 * @throws RangeError bei `monatsmenge.length === 0` (Abdeckungsnenner wäre
 *         undefiniert — strukturell bereits durch `FJ-01` im Preflight
 *         verhindert, dieser Kern bleibt trotzdem defensiv) oder
 *         `floorProzent` außerhalb `[0,100]` oder einem Monat in
 *         `monatsDeltas`, der NICHT in `monatsmenge` enthalten ist
 *         (Aufrufer-Fehler — ein ausweisbarer Monat MUSS Teil der erwarteten
 *         Menge sein).
 */
export function einsparungJahr(eingang: EinsparungJahrEingang): EinsparungJahrErgebnis {
  const { monatsDeltas, monatsmenge, floorProzent } = eingang;

  if (monatsmenge.length === 0) {
    throw new RangeError('monatsmenge darf nicht leer sein (Abdeckungsnenner waere undefiniert).');
  }
  if (!Number.isFinite(floorProzent) || floorProzent < 0 || floorProzent > 100) {
    throw new RangeError(`floorProzent muss in [0,100] liegen (war: ${String(floorProzent)}).`);
  }

  const monatsmengeSet = new Set(monatsmenge);
  const ausweisbareMonateSet = new Set(monatsDeltas.map((m) => m.monat));
  for (const eintrag of monatsDeltas) {
    if (!monatsmengeSet.has(eintrag.monat)) {
      throw new RangeError(`monatsDeltas enthaelt Monat '${eintrag.monat}', der NICHT Teil von monatsmenge ist.`);
    }
  }

  const ausgeschlosseneMonate = monatsmenge.filter((monat) => !ausweisbareMonateSet.has(monat));
  const abdeckungPct = (100 * (monatsmenge.length - ausgeschlosseneMonate.length)) / monatsmenge.length;

  // B13.2 — reine Summe, KEIN max(deltaKwh, 0), KEIN Zwischenrunden (B13.5:
  // Rundung erst an der Persistenz-/Ausweisgrenze durch den Aufrufer).
  const summeKwh = monatsDeltas.reduce((summe, eintrag) => summe + eintrag.deltaKwh, 0);
  const alleEinbezogenenBelastbar = monatsDeltas.every((m) => m.qualitaetsStufe === 'belastbar');

  if (abdeckungPct < floorProzent) {
    // B13.3/B14 — Floor unterschritten: KEIN Wert, auch wenn arithmetisch
    // berechenbar (GV4-Regressionsschutz: NICHT 220,000 zurückgeben).
    return { status: 'nicht_nachweisbar', einsparungKwh: null, abdeckungPct, ausgeschlosseneMonate };
  }

  if (abdeckungPct === 100 && alleEinbezogenenBelastbar) {
    return { status: 'belastbar', einsparungKwh: summeKwh, abdeckungPct, ausgeschlosseneMonate };
  }

  // >= Floor, aber entweder < 100 % Abdeckung ODER mind. ein einbezogener
  // Monat `eingeschraenkt` (B13.3-Tabelle: "mind. ein Monat eingeschraenkt
  // ODER exkludiert").
  return { status: 'eingeschraenkt', einsparungKwh: summeKwh, abdeckungPct, ausgeschlosseneMonate };
}

export interface PortfolioEinsparungErgebnis {
  /** N_t^{FJ} — Anzahl der EINBEZOGENEN Endkundenjahre (Aufrufer filtert `nicht_nachweisbar`/`ausgeschlossen` VORHER heraus, O-B14 offen — s. Domain-Doku). */
  readonly nT: number;
  /** E_t^{FJ,ZE} — Summe OHNE Kappung negativer Endkundenjahre (Kap. 9.1 Satz 3, GV6-Regressionsschutz). */
  readonly summeKwh: number;
}

/**
 * B13.1 (Portfolio-Ebene, Kap. 9.1 Satz 3) — „Die Einsparungen des
 * Zuwendungsempfängers werden über die Gesamtzahl der Endkunden berechnet."
 * Reine Summe ausgewiesener `E_{k,t}^{FJ}`-Werte, KEINE Kappung negativer
 * Endkundenjahre (B13.2 gilt fort). Der Aufrufer übergibt AUSSCHLIESSLICH die
 * `einsparungKwh`-Werte von Paaren mit `status ∈ {belastbar, eingeschraenkt}`
 * (d. h. `einsparungKwh !== null`) — `nicht_nachweisbar`/`ausgeschlossen`
 * (Substitution, Art.-18) gehen NICHT in `nT`/`summeKwh` ein (B13.7 O-B14:
 * die genaue Definition von „Gesamtzahl der Endkunden" ist eine
 * Auslegungsfrage der Bewilligungsbehörde — dieser Kern trifft KEINE
 * Vorabentscheidung, er summiert nur, was der Aufrufer als einbezogen
 * übergibt).
 */
export function portfolioEinsparung(endkundenEinsparungenKwh: readonly number[]): PortfolioEinsparungErgebnis {
  const summeKwh = endkundenEinsparungenKwh.reduce((summe, wert) => summe + wert, 0);
  return { nT: endkundenEinsparungenKwh.length, summeKwh };
}
