/**
 * ADR-0005 §26.4 SEC-5 — EIGENSTÄNDIGE break-glass-Härtung für
 * `read:geraet_zuordnung` (Reverse-Auflösung Blind-Index/Zeile → Klartext-
 * DevEUI). Bewusst NICHT `break-glass.constants.ts` (die dortigen
 * `BREAK_GLASS_ZWECK_WHITELIST`/`MAX_FENSTER_TAGE` sind für
 * `read:verbrauch_detail` gedacht) — SEC-5 verlangt wörtlich eine
 * EIGENSTÄNDIGE Härtung, keine Übernahme dieses Musters:
 *   - eigene, enge Rolle `geraete-support` statt `betrieb` (s. `app-role.ts`),
 *   - Begründungs-/Ticket-Pflicht (strukturiert, kein Zweck-Code-Freitext),
 *   - eigene Zweck-Whitelist,
 *   - Punkt-Auflösung + Velocity/Quota statt Zeitraum-Fenster,
 *   - Echtzeit-Alert bei JEDEM `permit` (`GeraetReverseAlertPort`/
 *     `LogGeraetReverseAlertAdapter`, `stammdaten/geraet-zuordnung/`).
 *
 * (f) Periodischer Audit-Review (ADR-0005 §26.4 SEC-5 Punkt 5, letzter
 * Halbsatz: "... + periodischer Audit-Review als Pflichtprozess") ist
 * ORGANISATORISCHER PROZESS, KEIN Code in diesem Paket — ein wiederkehrender
 * (z. B. monatlicher) manueller/teilautomatisierter Review ALLER
 * `geraet_zuordnung.stammdaten.reverse_aufgeloest`-Ereignisse (`ergebnis=
 * 'ok'` UND `'denied'`) durch `compliance-director`/`security-lead`, analog
 * dem bereits etablierten periodischen Zugriffsreview für
 * `read:verbrauch_detail` (ADR-0008 §16). Operative Ausgestaltung
 * (Reporting-Query, Kalenderturnus, Verantwortlichkeit) ist ein
 * Folgeauftrag außerhalb dieses Backend-Pakets (`/audit-report`,
 * `documentation-lead`/`compliance-director`).
 */

/**
 * (c) Eigene Zweck-Whitelist, UNABHÄNGIG von `BREAK_GLASS_ZWECK_WHITELIST`.
 * PROVISORISCH — Erweiterung NUR nach Review
 * (`access-control-engineer`/`compliance-director`), kein Freitext (rote
 * Linie 2).
 */
export const GERAET_REVERSE_ZWECK_WHITELIST = ['geraete_stoerungsdiagnose'] as const;

export type GeraetReverseZweckCode = (typeof GERAET_REVERSE_ZWECK_WHITELIST)[number];

export function isGeraetReverseZweckCode(value: string): value is GeraetReverseZweckCode {
  return (GERAET_REVERSE_ZWECK_WHITELIST as readonly string[]).includes(value);
}

/**
 * (b) Strukturiertes Pflicht-Ticket-Format — kein Freitext-Roman (rote
 * Linie 2). `GROSSBUCHSTABEN-ZIFFERN` (z. B. `HD-1234`), angelehnt an
 * gängige Ticket-System-Präfixe (Jira/ServiceNow-artig). Format PROVISORISCH
 * — final `security-lead`/`access-control-engineer` je nach eingesetztem
 * Ticket-System.
 */
export const TICKET_REF_FORMAT = /^[A-Z]+-[0-9]+$/;

export function isValidTicketRef(value: string): boolean {
  return TICKET_REF_FORMAT.test(value);
}

/**
 * (d) Punkt-Auflösungs-Fenster: KEIN Datumsbereich (anders als
 * `MAX_FENSTER_TAGE` bei `read:verbrauch_detail`) — eine Reverse-Auflösung
 * ist immer ein EINZELNER Blind-Index → eine Zeile, kein Zeitraum-Browsing
 * (ADR-0005 §26.4 SEC-5 Punkt 4). Diese Konstante dokumentiert das
 * gleitende Fenster, über das die Velocity/Quota (s. u.) gezählt wird.
 */
export const GERAET_REVERSE_FENSTER_STUNDEN = 24;

/**
 * (d) Velocity/Quota je Subjekt im gleitenden `GERAET_REVERSE_FENSTER_STUNDEN`-
 * Fenster — Quelle der Wahrheit ist der Audit-Trail selbst (Zählung der
 * `ok`-Ereignisse `geraet_zuordnung.stammdaten.reverse_aufgeloest` je
 * `actor_sub`, s. `GeraetReverseQuotaRepository`), KEIN neuer State/keine
 * neue Tabelle. Wert PROVISORISCH (analog `MAX_FENSTER_TAGE`s Herkunft) —
 * final `security-lead`/`compliance-director` zu bestätigen, bevor ein
 * echter (nicht-synthetischer) Support-Betrieb startet.
 */
export const GERAET_REVERSE_QUOTA_JE_SUBJEKT_24H = 20;
