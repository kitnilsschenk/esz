import type { LueckenTyp } from '../persistence/energy/energy-monitoring.repository';

export type { LueckenTyp };

export interface VollstaendigkeitItem {
  readonly endkundeId: string;
  readonly systemId: string | null;
  readonly zaehlerId: string | null;
  readonly ebene: 'endkunde' | 'system' | 'zaehler';
  readonly luecken: readonly LueckenTyp[];
  readonly geprueftAm: string;
}
