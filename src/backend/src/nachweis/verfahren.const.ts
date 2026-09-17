/**
 * Katalog-Referenz-Konstanten für den GETEILTEN Verfahrenskatalog
 * (`analytics.verfahren`/`analytics.verfahren_version`, D3 — „geteilt, NICHT
 * dupliziert"; Katalogzeilen seit V0024 live, gegen die Dev-DB Port 5437
 * verifiziert). Analog `berechnung/berechnungslauf.service.ts`s
 * `VERFAHREN_CODE`-Konstante — NIE als Literal im Service-Code wiederholt.
 */

/** `art=nachweispruefung` (V0024) — Vollständigkeits-Preflight (D4/B4). */
export const PREFLIGHT_PROFIL_CODE = 'foerderjahr_preflight_de02';

/** `art=einsparaggregation` (V0024) — Förderjahres-Einsparaggregation (B13, Rechenkern `domain/einsparung.ts`). */
export const EINSPARAGGREGATION_VERFAHREN_CODE = 'einsparung_foerderjahr_kap91';

/**
 * B13.3/B14 (O-B2, „bestätigt, bleibt aber als Parameter implementiert, nicht
 * als Literal") — MIRROR der Katalog-Konstante
 * `analytics.verfahren_version.parameter_schema.properties.
 * abdeckungsfloor_pct.default` (V0024). Exakt das Muster
 * `GTZ_T_INNEN_C_DEFAULT`/`TAGE_PRO_JAHR_DEFAULT`
 * (`berechnung/domain/witterung-gtz.ts`): der Katalog-Eintrag ist die
 * DOKUMENTIERTE, versionierte Quelle der Wahrheit; diese TS-Konstante ist der
 * zur LAUFZEIT tatsächlich verwendete Wert (`parameter_schema` wird NICHT
 * dynamisch geparst — dieselbe Konvention wie bei `witterung_gtz_vdi3807@1`).
 * v1 hat KEINEN Override-Pfad (kein Analogon zu
 * `BerechnungslaufParameterDto`) — nicht Teil dieses Arbeitspakets.
 */
export const ABDECKUNGSFLOOR_PCT_DEFAULT = 75;

/** B13.2/B14 — fest verdrahteter Wert (v1 hat KEINE andere Vorzeichenregel implementiert), gespiegelt in `nachweis.einsparlauf.parameter`. */
export const VORZEICHENREGEL = 'verrechnung_ohne_kappung';

/** B13.3/B14 — fest verdrahteter Wert (v1 hat KEINE Ersatz-/Hochrechnung implementiert), gespiegelt in `nachweis.einsparlauf.parameter`. */
export const LUECKENREGEL = 'ausschluss_nicht_ausweisbar';

/** B13.5 — Ausweisgrenze, Konvention `berechnung/witterung-gtz.ts`/ADR-0006 B12. */
export const RUNDUNG_NACHKOMMASTELLEN = 3;

/**
 * ADR-0007 A12 (backend-lead-Design-Entscheidung 2026-08-26, KEIN
 * ADR-Literal, kein Regelkatalog-Eintrag in `analytics.verfahren_version`
 * ohne Migration — s. finale Antwort dieses Arbeitspakets, Entwurf V0030
 * NICHT angewendet): Preflight-Befund, wenn für (mindestens) einen
 * Scope-Paar-Berechnungslauf die Kette `mvet_id` →
 * `energy.messkonzept_version_energietraeger_system` STRUKTURELL leer ist
 * (kein System zugeordnet, V0028-Übergangszustand) — dann ist NICHT
 * feststellbar, ob eine Anschlussnutzer-Sperre greift. Wirkung (PreflightService):
 * `schwere='blocker'` auf Befund-Ebene, aber wie `FJ-07c`/`FJ-11c`
 * AUSGENOMMEN von `preflight.blocker_anzahl` (paar-/kategoriebezogen, NIE ein
 * Förderjahr-Blocker, A11/C2-Analogie) — die einzige Wirkung ist die
 * Export-Gate-Prüfung der Kategorie `rohdaten` (s.
 * `nachweis-export-renderer.ts`).
 */
export const KETTE_NICHT_AUFLOESBAR_REGEL_CODE = 'FJ-10';

/**
 * Regel-Codes, die zwar `schwere='blocker'` auf Befund-Ebene tragen, aber
 * NICHT in `preflight.blocker_anzahl`/`ergebnis` einfließen (A11/C2:
 * „Eine Kontrolle, die zu ihrer eigenen Umgehung drängt, ist keine.") —
 * `FJ-07c` (Endkunde-Sperre 1b/1d bzw. Bestandsdaten-Fail-closed), `FJ-11c`
 * (Anschlussnutzer-Analogon, s. `domain/paar-einschraenkung.ts`) und `FJ-10`
 * (Rohdaten-Sperrstatus strukturell nicht auflösbar, s. o.) sind alle DREI
 * PAAR- bzw. kategoriebezogene Befunde, kein Grund, den GESAMTEN
 * Förderjahres-Nachweis zu blockieren.
 */
export const AUSGENOMMENE_FOERDERJAHR_BLOCKER_REGEL_CODES = ['FJ-07c', 'FJ-11c', KETTE_NICHT_AUFLOESBAR_REGEL_CODE] as const;
