import type { GeraetZuordnung } from '../persistence/device/device-geraet-zuordnung.repository';
import type { GeraetZuordnungDetail } from './geraet-zuordnung.types';

/** KEIN `deveuiEnc`/`deveuiBlindIndex` in der Projektion — s. `geraet-zuordnung.types.ts`-Kommentar. */
export function mapGeraetZuordnungDetail(zuordnung: GeraetZuordnung): GeraetZuordnungDetail {
  return {
    id: zuordnung.id,
    zaehlerId: zuordnung.zaehlerId,
    status: zuordnung.status,
    pepperVersion: zuordnung.pepperVersion,
    gueltigVon: zuordnung.gueltigVon,
    gueltigBis: zuordnung.gueltigBis,
    createdAt: zuordnung.createdAt,
    updatedAt: zuordnung.updatedAt,
  };
}
