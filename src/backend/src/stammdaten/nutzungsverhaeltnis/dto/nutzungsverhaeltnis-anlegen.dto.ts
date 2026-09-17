import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';
import type { Datenklasse, NutzungsRolle } from '../../persistence/energy/energy-nutzungsverhaeltnis.repository';

const DATENKLASSE_WERTE: readonly Datenklasse[] = ['abrechnungsminimum', 'detailverbrauch'];
const ROLLE_WERTE: readonly NutzungsRolle[] = ['mieter', 'eigentuemer_selbstnutzer', 'gewerbe_nutzer', 'sonstige'];

/** `components/schemas/NutzungsverhaeltnisAnlegen` (stammdaten.openapi.yaml). */
export class NutzungsverhaeltnisAnlegenDto {
  @IsUUID()
  endkundeId!: string;

  @IsUUID()
  anschlussnutzerId!: string;

  @IsUUID()
  systemId!: string;

  @IsOptional()
  @IsIn(DATENKLASSE_WERTE)
  datenklasse?: Datenklasse;

  @IsIn(ROLLE_WERTE)
  rolle!: NutzungsRolle;

  @IsDateString()
  gueltigVon!: string;
}
