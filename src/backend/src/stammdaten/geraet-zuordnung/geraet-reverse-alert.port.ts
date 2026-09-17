/**
 * ADR-0005 §26.4 SEC-5 (e) — Echtzeit-Alert bei JEDEM `permit` einer
 * Reverse-Auflösung (Blind-Index/Zeile → Klartext-DevEUI). Ports & Adapters,
 * analog `KeyManagementPort`/`BlindIndexPepperPort` — Prod-Adapter (später,
 * NICHT Teil dieses Pakets): Anbindung an ein reales Alerting-/SIEM-System
 * (z. B. Slack-Webhook, PagerDuty, DSB-Mailer). Dev-Adapter =
 * `LogGeraetReverseAlertAdapter` (strukturiertes `Logger.warn`).
 *
 * RL-2 (rote Linie, VERBINDLICH): der Payload enthält AUSSCHLIESSLICH die
 * fünf Felder unten — NIEMALS DevEUI, `deveui_blind_index`, `deveuiEnc`
 * oder sonstiges Rohmaterial. `zaehlerId` ist ein Pseudonym (logischer
 * Verweis auf `energy.zaehler.id`, kein Geräte-Korrelat).
 */
export interface GeraetReverseAlertPayload {
  readonly actorSub: string;
  readonly zaehlerId: string;
  readonly zweck: string;
  readonly ticketRef: string;
  /** ISO-8601, UTC (`.claude/rules/backend-nestjs.md`: Zeitstempel immer UTC). */
  readonly zeitpunkt: string;
}

export interface AlertPort {
  readonly emit: (payload: GeraetReverseAlertPayload) => Promise<void> | void;
}

export const GERAET_REVERSE_ALERT_PORT = Symbol('GERAET_REVERSE_ALERT_PORT');
