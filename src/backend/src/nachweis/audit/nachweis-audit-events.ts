/**
 * ADR-0007 Teil B (B10) — Katalog-Referenz-Konstanten für die
 * `*.nachweis.*`-Event-Typen. Alle ZEHN Codes sind bereits LIVE in
 * `audit.event_typ`/`audit.event_typ_version` (`migrations/
 * V0026__seed_nachweis_events.sql`, gegen die Dev-DB Port 5437 verifiziert)
 * — `AuditService.append(...)` mit einem der HIER verwendeten Codes ist
 * sofort funktionsfähig, keine Bootstrap-Lücke.
 *
 * STUFE 2 (ADR-0007 Phase 4, `export.nachweis.*`/`einreichung.nachweis.*`):
 * `NachweisExportService`/`EinreichungService` emittieren jetzt die
 * verbleibenden vier Codes — Kontext-Key-Whitelists s. u., EXAKT wie
 * `audit.event_typ_version.erlaubte_kontext_keys` (V0026). `export.nachweis.
 * abgerufen` hat `rolle_erfassen=true` (Klartext-Detail-Abruf, B10) — der
 * `AuditService`-Aufruf selbst trägt dieses Flag NICHT (das ist reine
 * Katalog-Eigenschaft, von der DB durchgesetzt); der Emitter muss NUR die
 * Kontext-Whitelist einhalten.
 *
 * Kontext-Key-Whitelists EXAKT wie `audit.event_typ_version.
 * erlaubte_kontext_keys` (V0026, gegen die Dev-DB verifiziert) — der
 * fail-closed `audit.event_seal()`-Trigger weist jeden Kontext-Key
 * AUSSERHALB dieser Listen strukturell ab. AUSDRÜCKLICH KEIN `endkunde_id`,
 * KEIN Export-Pseudonym, KEINE kWh-Mengen in JEDEM der fünf Kontexte (A19).
 *
 *   `einsparlauf.nachweis.*`: synthetic, einsparlauf_id, foerderjahr_code,
 *     art, verfahren_code, verfahren_version, preflight_id,
 *     umfang_paare_anzahl, gebundene_laeufe_anzahl, monate_erwartet,
 *     monate_gebunden, qualitaets_stufe_min, ersetzt_einsparlauf_id, fehler_code
 *   `preflight.nachweis.durchgefuehrt`: synthetic, preflight_id,
 *     foerderjahr_code, profil_code, profil_version, ergebnis,
 *     blocker_anzahl, warnung_anzahl, hinweis_anzahl, umfang_paare_anzahl,
 *     regel_codes
 *   `foerderjahr.stammdaten.definiert`: synthetic, foerderjahr_id,
 *     foerderjahr_code, nummer, von_monat, bis_monat, definition_quelle
 *   `export.nachweis.erzeugt|abgerufen`: synthetic, export_id,
 *     einsparlauf_id, foerderjahr_code, schema_code, schema_version, format,
 *     zweck, pseudonym_profil, anfrage_ref, station_darstellung,
 *     de04_auszug, dateien_anzahl, zeilen_anzahl_gesamt, manifest_hash,
 *     dateiname (NUR `.abgerufen`)
 *   `einreichung.nachweis.vermerkt|korrigiert`: synthetic, einreichung_id,
 *     export_id, einsparlauf_id, foerderjahr_code, art, anfrage_ref,
 *     uebermittlungsweg, empfaenger, manifest_hash, ersetzt_einreichung_id,
 *     korrektur_grund_code, differenz_positionen_anzahl, differenz_richtung
 *
 * `.angefordert`/`.abgeschlossen`/`.fehlgeschlagen`/`.ersetzt` werden ALLE
 * MANUELL über `AuditService.append()` im Service emittiert, NICHT über
 * `@AuditAction` — Präzedenzfall `BERECHNUNG_EVENT_CODES`
 * (`berechnung/audit/berechnung-audit-events.ts`): eine EINZIGE Route kann
 * bis zu drei verschiedene Codes je nach Ausgang tragen. GENAU dasselbe
 * Muster gilt für `export.nachweis.abgerufen` (Erfolg UND Hash-Mismatch
 * tragen BEIDE diesen Code, nur `ergebnis` unterscheidet — A19/A.8.24:
 * „Abweichung ⇒ keine Auslieferung, Fehler, Audit-Event").
 */
export const NACHWEIS_EVENT_CODES = {
  EINSPARLAUF_ANGEFORDERT: 'einsparlauf.nachweis.angefordert',
  EINSPARLAUF_ABGESCHLOSSEN: 'einsparlauf.nachweis.abgeschlossen',
  EINSPARLAUF_FEHLGESCHLAGEN: 'einsparlauf.nachweis.fehlgeschlagen',
  EINSPARLAUF_ERSETZT: 'einsparlauf.nachweis.ersetzt',
  PREFLIGHT_DURCHGEFUEHRT: 'preflight.nachweis.durchgefuehrt',
  FOERDERJAHR_DEFINIERT: 'foerderjahr.stammdaten.definiert',
  EXPORT_ERZEUGT: 'export.nachweis.erzeugt',
  EXPORT_ABGERUFEN: 'export.nachweis.abgerufen',
  EINREICHUNG_VERMERKT: 'einreichung.nachweis.vermerkt',
  EINREICHUNG_KORRIGIERT: 'einreichung.nachweis.korrigiert',
  /** ADR-0007 A18/A11.12 — Mitteilung nach Art. 19 DSGVO (Katalog: V0038). */
  ART19_MITGETEILT: 'einreichung.nachweis.art19_mitgeteilt',
} as const;

export type NachweisEventCode = (typeof NACHWEIS_EVENT_CODES)[keyof typeof NACHWEIS_EVENT_CODES];

/** Whitelisted, PII-freier Fehlercode für `kontext.fehler_code` (KEIN Freitext, KEIN `error.message`) — Muster `BERECHNUNG_FEHLER_CODES`. */
export const NACHWEIS_FEHLER_CODES = {
  FOERDERJAHR_NICHT_GEFUNDEN: 'foerderjahr_nicht_gefunden',
  PREFLIGHT_NICHT_GEFUNDEN: 'preflight_nicht_gefunden',
  PREFLIGHT_FOERDERJAHR_ABWEICHUNG: 'preflight_foerderjahr_abweichung',
  PREFLIGHT_NICHT_GRUEN: 'preflight_nicht_gruen',
  ERSETZTER_LAUF_UNGUELTIG: 'ersetzter_lauf_ungueltig',
  UNERWARTETER_FEHLER: 'unerwarteter_fehler',
  EINSPARLAUF_NICHT_GEFUNDEN: 'einsparlauf_nicht_gefunden',
  EXPORT_NICHT_GEFUNDEN: 'export_nicht_gefunden',
  EXPORT_DATEI_NICHT_GEFUNDEN: 'export_datei_nicht_gefunden',
  WISS_AUSWERTUNG_GESPERRT: 'wiss_auswertung_gesperrt',
  KLARNAME_OHNE_ANFRAGE_REF: 'klarname_ohne_anfrage_ref',
  HASH_ABWEICHUNG: 'hash_abweichung',
  EINREICHUNG_NICHT_GEFUNDEN: 'einreichung_nicht_gefunden',
  EINREICHUNG_NICHT_FAEHIG: 'einreichung_nicht_faehig',
  KORREKTUR_OHNE_GRUND: 'korrektur_ohne_grund',
  KORREKTUR_OHNE_ERSETZTEN_LAUF: 'korrektur_ohne_ersetzten_lauf',
} as const;

export type NachweisFehlerCode = (typeof NACHWEIS_FEHLER_CODES)[keyof typeof NACHWEIS_FEHLER_CODES];
