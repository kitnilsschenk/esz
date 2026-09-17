/**
 * ADR-0005 §15 (D3, M3) — "Worker-seitiger Reconnect: exponentielles
 * Backoff (z. B. 1 s → 30 s Cap)". `mqtt.js`s eingebautes `reconnectPeriod`
 * ist ein FIXER Intervall — fuer echtes exponentielles Backoff deaktiviert
 * der Adapter das eingebaute Reconnect (`reconnectPeriod: 0`) und steuert
 * die Wartezeit selbst ueber diese reine, deterministisch testbare Funktion.
 */
export const MQTT_BACKOFF_INITIAL_MS = 1_000;
export const MQTT_BACKOFF_MAX_MS = 30_000;

export function naechsteBackoffWartezeitMs(bisherigeWartezeitMs: number): number {
  return Math.min(MQTT_BACKOFF_MAX_MS, bisherigeWartezeitMs * 2);
}
