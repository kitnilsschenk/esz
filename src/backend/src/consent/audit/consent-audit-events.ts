/**
 * Audit-Event-Codes der Einwilligungsverwaltung (ADR-0012 A2).
 *
 * WORTGLEICH mit den in `migrations/V0045__audit_einwilligung_events.sql`
 * eingetragenen Codes und deren `erlaubte_kontext_keys`:
 *   - ERTEILT:              { synthetic, zweck_code, text_version_id, subjekt_typ, rechtsgrundlage, erfassungsweg }
 *   - WIDERRUFEN:           { synthetic, zweck_code, subjekt_typ }
 *   - TEXT_VEROEFFENTLICHT: { synthetic, zweck_code, fassung }
 *
 * Der Widerruf traegt bewusst weniger: Textfassung, Rechtsgrundlage und
 * Erfassungsweg stehen bereits am Erteilungs-Ereignis derselben `objekt_ref`;
 * sie zu wiederholen waere Redundanz in einem append-only Log.
 *
 * NIRGENDS enthalten: IP und User-Agent. Sie stehen feldverschluesselt im
 * Beleg; im Audit-Log waeren sie personenbezogene Daten in einer breit
 * gelesenen Hypertable, die der Krypto-Shred (ADR-0009) nicht erreicht.
 */
export const CONSENT_EVENT_CODES = {
  ERTEILT: 'einwilligung.consent.erteilt',
  WIDERRUFEN: 'einwilligung.consent.widerrufen',
  TEXT_VEROEFFENTLICHT: 'einwilligung.consent.text_veroeffentlicht',
} as const;

/**
 * Audit-Event-Codes des Widerspruchs (V0053, Auflage AW-27).
 *
 * WORTGLEICH mit den in `migrations/V0053__audit_widerspruch_events.sql`
 * eingetragenen Codes und deren `erlaubte_kontext_keys`:
 *   - ERKLAERT:         { synthetic, zweck_code, subjekt_typ, erlaubnismodus, erfassungsweg }
 *   - ZURUECKGENOMMEN:  { synthetic, zweck_code, subjekt_typ }
 *
 * NIRGENDS enthalten: `quelle_ref`. Die Fundstelle eines Dokuments kann einen
 * Namen tragen („Schreiben Mueller vom ..."), und das Audit-Log ist eine breit
 * gelesene Hypertable, die der Krypto-Shred nicht erreicht.
 */
export const WIDERSPRUCH_EVENT_CODES = {
  ERKLAERT: 'widerspruch.consent.erklaert',
  ZURUECKGENOMMEN: 'widerspruch.consent.zurueckgenommen',
} as const;
