import type { AusfallVorgangStatus } from '../persistence/ingest/ingest-freshness.repository';

export type { AusfallVorgangStatus };

/**
 * `components/schemas/AusfallListeItem` (stammdaten.openapi.yaml,
 * `GET /monitoring/ausfaelle`, ADR-0005 §27/TB-04) — PII-frei, NUR
 * Pseudonym-Surrogate + Betriebs-Metadaten.
 */
export interface AusfallListeItem {
  readonly messkanalId: string;
  readonly zaehlerId: string;
  readonly letzteUebertragung: string;
  readonly ueberfaellig: boolean;
  readonly ausfallStatus: AusfallVorgangStatus | null;
  readonly ausfallSeit: string | null;
}

/**
 * `components/schemas/MesskanalFreshnessItem` (stammdaten.openapi.yaml,
 * `GET /stammdaten/zaehler/{zaehlerId}/freshness`) — Betriebs-Metadatum
 * („wann kam zuletzt etwas an?"), KEIN Messwert, KEIN Lastgang, KEIN
 * break-glass. `letzteUebertragung=null` = noch nie empfangen (Empty-State).
 */
export interface MesskanalFreshnessItem {
  readonly messkanalId: string;
  readonly letzteUebertragung: string | null;
  readonly ueberfaellig: boolean;
  readonly ausfallStatus: AusfallVorgangStatus | null;
  readonly ausfallSeit: string | null;
}
