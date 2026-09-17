/**
 * ADR-0005 §27 (D15, TB-04) — Überfälligkeits-Schwelle für die Freshness-
 * Ableitung aus `ingest.kanal_status.letzter_ts`.
 *
 * TB-09 (Merkblatt) verlangt mindestens EINEN Messwert PRO TAG (24h
 * Mindestkadenz) — das ist der natürliche Anker. ADR-0005 §27 schlägt
 * darüber hinaus „≥ 36 h Puffer" vor (vermeidet Falsch-Alarme durch
 * normale Übertragungs-Jitter/kurze Netzausfälle, OHNE die Sanktions-
 * relevante TB-04-Meldung zu spät auszulösen) — als „Vorschlag", bewusst
 * OHNE einen im ADR bereits final entschiedenen Zahlenwert.
 *
 * v1 übernimmt den Vorschlag 1:1 als EINE benannte, dokumentierte
 * Konstante (Arbeitsauftrag: „konfigurierbar ODER wenigstens als benannte
 * Konstante begründet") — kein über den Code verstreuter Magic-Number.
 * Eine echte Laufzeit-Konfigurierbarkeit (z. B.
 * `EDMS_TB04_FRESHNESS_SCHWELLE_STUNDEN`) ist ein offener Punkt für
 * `iot-ingestion-engineer`/`devops-lead`, sobald der periodische TB-04-
 * Freshness-Check-Job selbst gebaut wird (ADR-0005 §31-Gate-Auflage) —
 * dieser rein LESENDE Pfad berechnet die Schwelle nur für die eigene
 * Abfrage und schreibt nirgends einen Zustand fest.
 */
export const TB04_MINDESTKADENZ_STUNDEN = 24;
export const TB04_FRESHNESS_PUFFER_STUNDEN = 36;
export const TB04_FRESHNESS_SCHWELLE_STUNDEN = TB04_MINDESTKADENZ_STUNDEN + TB04_FRESHNESS_PUFFER_STUNDEN;

/** UTC-ISO-Zeitpunkt `jetzt - TB04_FRESHNESS_SCHWELLE_STUNDEN` — Query-Parameter für `IngestFreshnessRepository`. */
export function berechneFreshnessSchwelle(jetzt: Date = new Date()): string {
  return new Date(jetzt.getTime() - TB04_FRESHNESS_SCHWELLE_STUNDEN * 60 * 60 * 1000).toISOString();
}
