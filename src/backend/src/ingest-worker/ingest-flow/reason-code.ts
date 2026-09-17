/**
 * ADR-0005 §25-Tabelle (D13, S3a) — WORTGLEICH die Werte des
 * `ck_quarantaene_grund`-CHECK-Constraints (V0011, erweitert um
 * `herkunft_widerspruechlich` in V0042 und `skalensprung_verdacht` in V0049). Anwendungscode MUSS exakt diese
 * Strings schreiben (Vokabular-Konsistenz, V0011-Datei-Kopf "Schreibweise
 * decode_fehler (ADR-Kanon)").
 */
export const INGEST_REASON_CODES = [
  'envelope_parse_fehler',
  'devEUI_unbekannt',
  'unbekannter_geraetetyp',
  'decode_fehler',
  'kanal_unbekannt',
  'unplausibel_monotonie_verletzt',
  'einheit_inkonsistent',
  'zeitstempel_fehlt',
  // ADR-0011 D4 (V0042): Der Uplink kommt aus einem Tenant, der einem anderen
  // Endkunden zugeordnet ist als der aufgeloeste Zaehler. Fail-closed —
  // lieber eine Zeile im Arbeitsvorrat als ein stiller Messwert beim
  // falschen Endkunden.
  'herkunft_widerspruechlich',
  // ADR-0011 O3 Punkt 3 (V0049): Der Zaehlerstand ist um einen Betrag
  // gestiegen, den kein Verbrauch erklaert, wohl aber ein geaenderter
  // Wandlerfaktor im fremden Codec. Fail-closed — ein Foerderjahr auf einer
  // still geaenderten Rechenvorschrift waere falsch nachgewiesen.
  'skalensprung_verdacht',
] as const;

export type IngestReasonCode = (typeof INGEST_REASON_CODES)[number];
