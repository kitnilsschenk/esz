/**
 * V0002/V0013/V0014-Kanon (verbindlich, NIEMALS direkt als Zahlenliteral im
 * Anwendungscode vergleichen — jede Vorrangentscheidung laeuft ausschliesslich
 * ueber `measurement.rang()` in der DB, s. `messwert-schreibpfad.repository.ts`
 * und die "LESER-FALLE" in V0013).
 */
export const QUALITAET_GEMESSEN = 0;
export const QUALITAET_GESCHAETZT = 1;
export const QUALITAET_KORRIGIERT = 2;
export const QUALITAET_ERSATZWERT = 3;

export const HERKUNFT_INGEST_LIVE = 0;
export const HERKUNFT_BACKFILL = 1;
export const HERKUNFT_MANUELL = 2;
export const HERKUNFT_IMPORT_ALTSYSTEM = 3;

/**
 * ADR-0005 §21 (D9) — Abgrenzung `ingest_live` vs. `backfill`: `herkunft`
 * kodiert den ZUSTELLUNGS-Pfad, nicht das Alter des Werts. Ein verspaeteter
 * Uplink, der ganz normal ueber die LIVE-MQTT-Subscription eintrifft, bleibt
 * `ingest_live` (gewoehnliche Backfill-Faehigkeit des MQTT-Pfads, M3).
 * `backfill` ist reserviert fuer einen expliziten, separat ausgeloesten
 * Batch-Nachlade-Vorgang (kein v1-Bestandteil dieses Pakets, aber der
 * Ingest-Flow unterstuetzt den Parameter bereits, s. `ingest-flow.service.ts`).
 */
export type IngestHerkunft = 'ingest_live' | 'backfill';

export function herkunftCode(herkunft: IngestHerkunft): number {
  return herkunft === 'backfill' ? HERKUNFT_BACKFILL : HERKUNFT_INGEST_LIVE;
}
