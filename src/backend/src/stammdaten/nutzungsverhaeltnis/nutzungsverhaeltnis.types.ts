import type { Datenklasse, NutzungsRolle } from '../persistence/energy/energy-nutzungsverhaeltnis.repository';

export interface NutzungsverhaeltnisListItem {
  readonly id: string;
  readonly endkundeId: string;
  readonly anschlussnutzerId: string;
  readonly systemId: string;
  readonly datenklasse: Datenklasse;
  readonly rolle: NutzungsRolle;
  readonly gueltigVon: string;
  readonly gueltigBis: string | null;
  readonly createdAt: string;
}

export interface NutzungsverhaeltnisDetail extends NutzungsverhaeltnisListItem {
  readonly updatedAt: string;
}
