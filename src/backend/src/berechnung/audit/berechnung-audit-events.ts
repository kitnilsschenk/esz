/**
 * ADR-0006 Teil B, B10 — Katalog-Referenz-Konstanten für die
 * `berechnungslauf.bereinigung.*`-Event-Typen. ANDERS als
 * `stammdaten-audit-events.ts` (dort teils noch RESERVIERT/nicht geseedet)
 * sind diese VIER Codes bereits LIVE in `audit.event_typ`/
 * `audit.event_typ_version` (`migrations/V0021__seed_analytics_einfluss_events.sql`,
 * gegen die Dev-DB Port 5437 verifiziert) — ein `AuditService.append(...)`
 * mit einem dieser Codes ist also SOFORT funktionsfähig, keine Bootstrap-Lücke.
 *
 * Kontext-Key-Whitelist (EXAKT wie in `audit.event_typ_version.
 * erlaubte_kontext_keys`, für alle vier Codes identisch, gegen die Dev-DB
 * verifiziert):
 *   synthetic, lauf_id, endkunde_id, energietraeger, verfahren_code,
 *   verfahren_version, periode_von, periode_bis, monate_anzahl,
 *   qualitaets_stufe, ersetzt_lauf_id, fehler_code
 *
 * KEIN Wert-Key (kWh/Temperatur/GTZ/Baseline) — der Seal-Trigger
 * (`audit.event_seal()`) weist jeden Kontext-Key außerhalb dieser Liste
 * fail-closed ab (A9, `.claude/rules`-Konvention "keine PII/Werte in Logs").
 *
 * `.angefordert`/`.abgeschlossen`/`.fehlgeschlagen`/`.ersetzt` werden ALLE
 * MANUELL über `AuditService.append()` im Service emittiert, NICHT über
 * `@AuditAction` (dessen Decorator genau EINEN statischen `eventTyp` pro
 * Route kennt — hier braucht eine EINZIGE Route bis zu drei verschiedene
 * Codes je nach Ausgang). Präzedenzfall: `STAMMDATEN_EVENT_CODES.
 * SHRED_FREIGEGEBEN` (`shred-antrag.service.ts`, "wird NICHT über
 * @AuditAction emittiert, sondern manuell im Service").
 */
export const BERECHNUNG_EVENT_CODES = {
  LAUF_ANGEFORDERT: 'berechnungslauf.bereinigung.angefordert',
  LAUF_ABGESCHLOSSEN: 'berechnungslauf.bereinigung.abgeschlossen',
  LAUF_FEHLGESCHLAGEN: 'berechnungslauf.bereinigung.fehlgeschlagen',
  LAUF_ERSETZT: 'berechnungslauf.bereinigung.ersetzt',
} as const;

export type BerechnungEventCode = (typeof BERECHNUNG_EVENT_CODES)[keyof typeof BERECHNUNG_EVENT_CODES];

/** Whitelisted, PII-freier Fehlercode für `kontext.fehler_code` (KEIN Freitext, KEIN `error.message`). */
export const BERECHNUNG_FEHLER_CODES = {
  ENDKUNDE_GESPERRT: 'endkunde_gesperrt',
  MVET_NICHT_GEFUNDEN: 'mvet_nicht_gefunden',
  BASELINE_FEHLT: 'baseline_fehlt',
  BASELINE_EINHEIT_UNGUELTIG: 'baseline_einheit_ungueltig',
  MESSKANAL_EINHEIT_UNGUELTIG: 'messkanal_einheit_ungueltig',
  GTZ_BASE_NICHT_ERMITTELBAR: 'gtz_base_nicht_ermittelbar',
  /** V0076: Standard-/alternatives Messkonzept ohne erfasste Baseline-Periode — es gibt keine Vermessung, an die angepasst werden koennte. */
  BASELINE_VERMESSUNG_FEHLT: 'baseline_vermessung_fehlt',
  /** V0076: Die Vermessung liegt vor, traegt aber keine belastbare Anpassung (zu wenige Punkte, zu geringe GTZ-Streuung, singulaer, negative Grundlast). */
  BASELINE_ANPASSUNG_GESCHEITERT: 'baseline_anpassung_gescheitert',
  KLIMADATEN_UNVOLLSTAENDIG: 'klimadaten_unvollstaendig',
  ERSETZTER_LAUF_UNGUELTIG: 'ersetzter_lauf_ungueltig',
  GOLDEN_VECTOR_ABWEICHUNG: 'golden_vector_abweichung',
  UNERWARTETER_FEHLER: 'unerwarteter_fehler',
} as const;

export type BerechnungFehlerCode = (typeof BERECHNUNG_FEHLER_CODES)[keyof typeof BERECHNUNG_FEHLER_CODES];
