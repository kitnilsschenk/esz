import type { Nutzungsverhaeltnis } from '../persistence/energy/energy-nutzungsverhaeltnis.repository';
import type { NutzungsverhaeltnisDetail, NutzungsverhaeltnisListItem } from './nutzungsverhaeltnis.types';

export function mapNutzungsverhaeltnisListItem(nutzung: Nutzungsverhaeltnis): NutzungsverhaeltnisListItem {
  return {
    id: nutzung.id,
    endkundeId: nutzung.endkundeId,
    anschlussnutzerId: nutzung.anschlussnutzerId,
    systemId: nutzung.systemId,
    datenklasse: nutzung.datenklasse,
    rolle: nutzung.rolle,
    gueltigVon: nutzung.gueltigVon,
    gueltigBis: nutzung.gueltigBis,
    createdAt: nutzung.createdAt,
  };
}

export function mapNutzungsverhaeltnisDetail(nutzung: Nutzungsverhaeltnis): NutzungsverhaeltnisDetail {
  return { ...mapNutzungsverhaeltnisListItem(nutzung), updatedAt: nutzung.updatedAt };
}
