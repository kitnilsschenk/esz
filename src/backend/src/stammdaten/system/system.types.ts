import type { BetriebsStatus } from '../persistence/energy/energy-system.repository';

export interface SystemListItem {
  readonly id: string;
  readonly endkundeId: string;
  readonly bezeichnung: string;
  readonly status: BetriebsStatus;
  readonly createdAt: string;
}

export interface SystemDetail {
  readonly id: string;
  readonly endkundeId: string;
  readonly bezeichnung: string;
  readonly systemgrenze: string;
  readonly systembeschreibung: string | null;
  /** Standort der Berechnungseinheit (V0074); `null` = nicht erfasst. */
  readonly standortId: string | null;
  readonly status: BetriebsStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}
