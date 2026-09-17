/**
 * ADR-0008 Teil B §17 (D5) — Katalog der neuen Fach-Event-Typen für
 * `@AuditAction({ eventTyp: ... })`. `domaene.objekt.verb`-Konvention, alle
 * PII-frei, kontrolliertes Vokabular (ADR-0003 §13.2).
 *
 * TODO(/add-audit-event, Phase 4 Folgeauftrag — NICHT Teil dieses Pakets):
 * diese Codes existieren HIER NUR als TS-Referenz-Konstanten. Sie sind NOCH
 * NICHT in `audit.event_typ`/`audit.event_typ_version` geseedet (kein
 * Migrations-Schreibzugriff in diesem Arbeitspaket, s. finale Antwort) — ein
 * `AuditService.append({eventTyp: STAMMDATEN_EVENT_CODES.ENDKUNDE_ANGELEGT, ...})`
 * schlägt daher gegen eine ECHTE Datenbank aktuell mit einer FK-/Katalog-
 * Gültigkeits-Verletzung fehl (analog zur bereits dokumentierten
 * Bootstrap-Lücke in `audit/audit-event-codes.ts` vor V0004). Die
 * `/add-audit-event`-Migration MUSS für jeden Code hier mindestens
 * `objekt_typ`, `aktion_kategorie`, `erlaubte_kontext_keys` (inkl. `synthetic`
 * für PII-Schreibrouten, ADR-0008 §22 — PFLICHT-Kontext-Key), `rolle_erfassen`
 * und `pflichtereignis` festlegen (Design-Owner: `audit-trail-engineer`,
 * Review: `access-control-engineer`/`compliance-director`).
 */
export const STAMMDATEN_EVENT_CODES = {
  ENDKUNDE_ANGELEGT: 'endkunde.stammdaten.angelegt',
  ENDKUNDE_GEAENDERT: 'endkunde.stammdaten.geaendert',
  ENDKUNDE_GESPERRT: 'endkunde.stammdaten.gesperrt',
  /** ADR-0007 A11.10 — Art. 18 Abs. 3, Schritt 1 (Katalog: V0036). */
  ENDKUNDE_EINSCHRAENKUNG_UNTERRICHTET: 'endkunde.stammdaten.einschraenkung_unterrichtet',
  /** ADR-0007 A11.7/A11.10 — Aufhebung, Schritt 2 (Katalog: V0036). */
  ENDKUNDE_ENTSPERRT: 'endkunde.stammdaten.entsperrt',
  ENDKUNDE_GESCHREDDERT: 'endkunde.stammdaten.geschreddert',
  SYSTEM_ANGELEGT: 'system.stammdaten.angelegt',
  SYSTEM_GEAENDERT: 'system.stammdaten.geaendert',
  SYSTEM_STILLGELEGT: 'system.stammdaten.stillgelegt',
  ZAEHLER_ANGELEGT: 'zaehler.stammdaten.angelegt',
  ZAEHLER_GEAENDERT: 'zaehler.stammdaten.geaendert',
  ZAEHLER_STILLGELEGT: 'zaehler.stammdaten.stillgelegt',
  MESSKANAL_ANGELEGT: 'messkanal.stammdaten.angelegt',
  MESSKANAL_GEAENDERT: 'messkanal.stammdaten.geaendert',
  MESSKANAL_STILLGELEGT: 'messkanal.stammdaten.stillgelegt',
  MESSKONZEPT_VERSION_ANGELEGT: 'messkonzept.version.angelegt',
  /** V0072 — welche Systeme ein Berechnungslauf umfasst; fehlt sie, greift der `endkunde_fallback`. */
  MESSKONZEPT_SYSTEMGRENZE_ZUGEORDNET: 'messkonzept.systemgrenze.zugeordnet',
  /**
   * V0073 — die Baseline-Bezugszeitraeume (`energy.baseline_periode`), aus
   * denen der Berechnungslauf GTZ_base als Mittelwert der
   * Gradtagzahl-Summen bildet. Ohne sie bleibt fuer den Nenner der
   * Witterungsbereinigung nur der `gtzBaseOverride` — eine von Hand gesetzte
   * Gradtagzahl. Kontext-Keys EXAKT nach V0073:
   *   { synthetic, energietraeger, perioden_anzahl, vorher_anzahl }
   * Manuell im Dienst emittiert (`AuditService.append()`), KEIN
   * `@AuditAction`: `vorher_anzahl` steht nicht in der Antwort.
   */
  MESSKONZEPT_BASELINE_PERIODE_ERFASST: 'messkonzept.baseline_periode.erfasst',
  ANSCHLUSSNUTZER_ANGELEGT: 'anschlussnutzer.stammdaten.angelegt',
  /** ADR-0007 A11.6 — Art.-18-Sperre des Anschlussnutzers (Katalog: V0033). */
  ANSCHLUSSNUTZER_GESPERRT: 'anschlussnutzer.stammdaten.gesperrt',
  /** ADR-0007 A11.10 — Art. 18 Abs. 3, Schritt 1 (Katalog: V0036). */
  ANSCHLUSSNUTZER_EINSCHRAENKUNG_UNTERRICHTET: 'anschlussnutzer.stammdaten.einschraenkung_unterrichtet',
  /** ADR-0007 A11.7/A11.10 — Aufhebung, Schritt 2 (Katalog: V0036). */
  ANSCHLUSSNUTZER_ENTSPERRT: 'anschlussnutzer.stammdaten.entsperrt',
  NUTZUNGSVERHAELTNIS_ANGELEGT: 'nutzungsverhaeltnis.angelegt',
  NUTZUNGSVERHAELTNIS_BEENDET: 'nutzungsverhaeltnis.beendet',
  /**
   * ADR-0008 §16/§17 (D4/D5, break-glass) — auch der `permit`-Fall wird
   * auditiert. KEIN v1-Endpoint konsumiert dies (§16) — Katalog-/
   * Decorator-Entwurf ist hier bereits vorhanden für den ersten realen
   * Konsumenten (ADR-0005).
   */
  VERBRAUCH_DETAIL_EINSICHT: 'stammdaten.verbrauch_detail.einsicht',
  /**
   * ADR-0009 (Vier-Augen-Krypto-Shredding-Workflow, Folgeauftrag ADR-0008
   * §29 C4) — Antrag/Freigabe/Ablehnung. Anders als die generelle TODO-Notiz
   * oben (die sich auf die ADR-0008-Phase-4-Codes bezieht): diese drei Codes
   * sind bereits geseedet (`migrations/V0009__seed_shred_workflow_events.sql`)
   * UND mit diesem Arbeitspaket vollständig verdrahtet (Routen +
   * `@AuditAction`/manuelle `AuditService.append()`-Aufrufe, kein
   * RESERVIERT-Zustand mehr). `SHRED_FREIGEGEBEN` wird NICHT über
   * `@AuditAction` emittiert, sondern manuell im Service (ADR-0009 §2.3
   * Finding P2 — Audit-Ordering vor `ENDKUNDE_GESCHREDDERT`).
   */
  SHRED_BEANTRAGT: 'endkunde.stammdaten.shred_beantragt',
  SHRED_FREIGEGEBEN: 'endkunde.stammdaten.shred_freigegeben',
  SHRED_ABGELEHNT: 'endkunde.stammdaten.shred_abgelehnt',
  /**
   * ADR-0005 §26.4/§26.5 (D14, O4-Audit-Drei-Wege-Split, `compliance-director`
   * wörtlich bestätigt) — bereits geseedet
   * (`migrations/V0015__seed_geraet_zuordnung_events.sql`). ALLE VIER Codes
   * sind vollständig verdrahtet (kein RESERVIERT-Zustand mehr):
   * Provisioning-Create/Update über `@AuditAction`
   * (`GeraetZuordnungUnterZaehlerController`/`DeviceGeraetZuordnungController`);
   * `GESCHREDDERT` wird manuell in `DeviceKryptoShreddingService.shred()`
   * emittiert (Ordering wie ADR-0009, innerhalb der Shred-Tx, KEIN
   * `@AuditAction` — dieser Pfad hat keine eigene HTTP-Route);
   * `REVERSE_AUFGELOEST` (SEC-5, break-glass-gehärtet) über `@AuditAction`
   * auf `DeviceGeraetZuordnungController.reverseAufloesen()`. Kontext-Key-
   * Whitelist je Code EXAKT nach V0015 (RL-2: kein DevEUI-Klartext/
   * `deveui_blind_index`).
   *   - PROVISIONIERT: { synthetic, zaehler_id, pepper_version }
   *   - AKTUALISIERT: { synthetic, zaehler_id }
   *   - GESCHREDDERT: { synthetic, zaehler_id, antrag_id }
   *   - REVERSE_AUFGELOEST: { synthetic, zaehler_id, zweck, ticket_ref }
   */
  GERAET_ZUORDNUNG_PROVISIONIERT: 'geraet_zuordnung.stammdaten.provisioniert',
  GERAET_ZUORDNUNG_AKTUALISIERT: 'geraet_zuordnung.stammdaten.aktualisiert',
  GERAET_ZUORDNUNG_GESCHREDDERT: 'geraet_zuordnung.stammdaten.geschreddert',
  GERAET_ZUORDNUNG_REVERSE_AUFGELOEST: 'geraet_zuordnung.stammdaten.reverse_aufgeloest',
  /**
   * ADR-0011 B2/D3 (V0043) — Pflege der Herkunfts-Zuordnung.
   * Kontext-Key-Whitelist je Code EXAKT nach V0043:
   *   - ZUGEORDNET / ENTFERNT:
   *     { synthetic, chirpstack_tenant_id, chirpstack_application_id,
   *       endkunde_id, standort_id, quelle_code }
   *
   * Es gibt bewusst KEIN Aenderungs-Ereignis: Umhaengen laeuft als Entfernen
   * + Neuzuordnung, damit der Uebergang lueckenlos aus zwei Zeilen hervorgeht
   * statt aus einem `geaendert` ohne Vorzustand.
   */
  HERKUNFT_MAPPING_ZUGEORDNET: 'herkunft_mapping.ingest.zugeordnet',
  HERKUNFT_MAPPING_ENTFERNT: 'herkunft_mapping.ingest.entfernt',
  /** V0060 — Pflege der Datenquellen (`ingest.quelle`, V0059). */
  INGEST_QUELLE_ANGELEGT: 'quelle.ingest.angelegt',
  INGEST_QUELLE_GEAENDERT: 'quelle.ingest.geaendert',
  INGEST_QUELLE_ZUGANGSDATEN_HINTERLEGT: 'quelle.ingest.zugangsdaten_hinterlegt',
  /**
   * ADR-0010 D5 (Standort-/Gebäudestruktur) — bereits geseedet
   * (`migrations/V0018__seed_standort_events.sql`, NEUN Codes). Kontext-Key-
   * Whitelist je Code EXAKT nach V0018 (`erlaubte_kontext_keys`, dort mit
   * `synthetic` als Pflicht-Tag korrigiert, Rev. 1 2026-07-22):
   *   - STANDORT_ANGELEGT:     { synthetic, endkunde_id, typ, ebene, parent_id_neu }
   *   - STANDORT_GEAENDERT:    { synthetic, endkunde_id, typ }
   *   - STANDORT_VERSCHOBEN:  { synthetic, endkunde_id, parent_id_alt, parent_id_neu, ebene, nachfahren_anzahl }
   *   - STANDORT_STILLGELEGT: { synthetic, endkunde_id, status_alt, status_neu }
   *   - STANDORT_GELOESCHT:   { synthetic, endkunde_id, typ, parent_id_alt }
   *   - STANDORT_PII_GEAENDERT: { synthetic, endkunde_id, pii_felder } — `pii_felder`
   *     ist EIN kommagetrennter String (Feldnamen, KEINE Werte) — die
   *     Whitelist erlaubt laut ADR-0010 D5 eine "Feldnamen-Liste"; ein
   *     Array ist als `AuditKontextValue` (rote Linie 1 — nur Skalare)
   *     strukturell nicht zulässig (`audit.event_seal()`, V0003 (3): NUR
   *     `string`/`number`/`boolean`), daher hier bewusst ein Scalar-String.
   *   - STANDORT_PII_EINSICHT: { synthetic, endkunde_id, anzahl_knoten } — EIN
   *     Event je Batch-Aufruf (`POST .../standorte/labels`), objekt_ref
   *     bleibt NULL (Batch über mehrere Standorte, V0018-Kommentar).
   *   - ZAEHLER_STANDORT_ZUGEORDNET: { synthetic, zaehler_id, standort_id, gueltig_von }
   *   - ZAEHLER_STANDORT_BEENDET:    { synthetic, zaehler_id, standort_id, gueltig_bis }
   */
  STANDORT_ANGELEGT: 'standort.stammdaten.angelegt',
  STANDORT_GEAENDERT: 'standort.stammdaten.geaendert',
  STANDORT_VERSCHOBEN: 'standort.stammdaten.verschoben',
  STANDORT_STILLGELEGT: 'standort.stammdaten.stillgelegt',
  STANDORT_GELOESCHT: 'standort.stammdaten.geloescht',
  STANDORT_PII_GEAENDERT: 'standort.pii.geaendert',
  STANDORT_PII_EINSICHT: 'standort.pii.einsicht',
  /**
   * ADR-0008 **D12** (Auflage A6), Katalog-Seed
   * `migrations/V0034__audit_endkunde_pii_einsicht_event.sql`.
   *
   * Kontext: `{ synthetic, anzahl_angefragt, anzahl_endkunden }` — EIN Event
   * je Batch-Aufruf (`POST /stammdaten/endkunden/labels`), objekt_ref bleibt
   * NULL (Batch über mehrere Endkunden, analog `STANDORT_PII_EINSICHT`).
   *
   * `anzahl_angefragt` ist die Ergänzung gegenüber dem Standort-Muster und
   * NICHT optional: Nur die DIFFERENZ zu `anzahl_endkunden` belegt, dass
   * Auflage A4 wirkt — also dass gesperrte (Art. 18) und geschredderte
   * (Art. 17) Endkunden je Datensatz still herausgefiltert wurden. Ohne
   * diesen Schlüssel wäre die Policy behauptet statt belegt.
   *
   * **Reserviert für Mangel M-1** (ADR-0008 §29 C13): Derselbe Code deckt
   * später den Einzelabruf der Detailseite ab (`objekt_ref=endkundeId`,
   * beide Zählwerte 1). Solange M-1 offen ist, protokolliert dieser Code
   * AUSSCHLIESSLICH den Batch-Pfad — aus seinem Vorhandensein darf NICHT
   * geschlossen werden, dass PII-Lesezugriffe auf Endkunden vollständig
   * protokolliert sind.
   */
  ENDKUNDE_PII_EINSICHT: 'endkunde.pii.einsicht',
  ZAEHLER_STANDORT_ZUGEORDNET: 'zaehler.standort.zugeordnet',
  ZAEHLER_STANDORT_BEENDET: 'zaehler.standort.beendet',
  /**
   * ADR-0006 Teil B (B8/B10, Einflussgrößen) — bereits geseedet
   * (`migrations/V0021__seed_analytics_einfluss_events.sql`, DREI der
   * insgesamt zwölf dort angelegten Codes; die übrigen neun gehören zu
   * `berechnung`/`klimadaten`/`verfahren`/`baseline`, s. dortigen
   * Migrations-Kopf). Kontext-Key-Whitelist EXAKT nach V0021
   * `erlaubte_kontext_keys` (für ALLE DREI Codes identisch,
   * "einflussgroesse.stammdaten.*"):
   *   { synthetic, einflussgroesse_id, endkunde_id, system_id, groesse_code,
   *     gueltig_ab_monat, gueltig_bis_monat, betroffener_typ, quelle_typ,
   *     rechtsgrundlage, anzahl_saetze }
   * AUSDRÜCKLICH KEIN `wert_num`/`wert_code`/`anlass_code`-Key (A9 — Personenzahl/
   * Nutzflaeche sind der PII-WERT selbst, V0020-Spaltenkommentar) —
   * `EinflussgroesseController`/`EinflussgroesseService` dürfen diese NIE in
   * einen Audit-Kontext schreiben (PII-Härte, s. finale Antwort dieses
   * Arbeitspakets).
   *   - EINFLUSSGROESSE_ERFASST:  rolle_erfassen=false (reversible Stammdaten-Mutation).
   *   - EINFLUSSGROESSE_GEAENDERT: rolle_erfassen=false. Deckt AUSSCHLIESSLICH
   *     das Schliessen (`gueltig_bis_monat`, V0020 D-UPDATE-SCOPE) ab — eine
   *     begleitende Korrektur-Zeile (`EinflussgroesseKorrigierenDto.korrektur`)
   *     emittiert ZUSÄTZLICH einen EIGENEN `EINFLUSSGROESSE_ERFASST`-Event
   *     (V0021 wörtlich: "eine fachliche Korrektur legt zusätzlich eine NEUE
   *     Zeile an, die dann Code (9) [.erfasst] emittiert") — beide Events
   *     werden MANUELL im Service emittiert (`AuditService.append()`, KEIN
   *     `@AuditAction` auf der PATCH-Route, da bis zu ZWEI Events je Aufruf
   *     möglich sind, analog `BerechnungslaufService`/`ShredAntragService`).
   *   - EINFLUSSGROESSE_EINSICHT: rolle_erfassen=true (Klartext-PII-Lesen,
   *     "analog stammdaten.verbrauch_detail.einsicht", V0021 wörtlich) — via
   *     `@AuditAction` auf `EinflussgroesseUnterSystemController.liste()`,
   *     IMMER auditiert (auch bei `deny`/`error`, s. `AuditActionInterceptor`).
   *
   * `einflussgroesse.schwellwert.ueberschritten` (der zwölfte, hier NICHT
   * aufgeführte Code) ist ABSICHTLICH NICHT Teil dieser Konstanten-Gruppe —
   * die Schwellwert-ERKENNUNG (schreibt `einfluss.befund`) ist NICHT Teil
   * dieses Arbeitspakets (Scope-Grenze, `tb03_schwellwert` im Katalog noch
   * überall NULL, s. finale Antwort).
   */
  EINFLUSSGROESSE_ERFASST: 'einflussgroesse.stammdaten.erfasst',
  EINFLUSSGROESSE_GEAENDERT: 'einflussgroesse.stammdaten.geaendert',
  EINFLUSSGROESSE_EINSICHT: 'einflussgroesse.stammdaten.einsicht',
} as const;

export type StammdatenEventCode = (typeof STAMMDATEN_EVENT_CODES)[keyof typeof STAMMDATEN_EVENT_CODES];
