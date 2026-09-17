import { IsIn, IsUUID } from 'class-validator';
import { PREFLIGHT_PROFIL_CODE } from '../verfahren.const';

/**
 * `POST /nachweis/preflights` (`create:nachweis_preflight`, ADR-0007 B4/B10
 * — "Body: `foerderjahrId`, `profilCode`"). `profilCode` ist in v1 auf GENAU
 * den EINEN Katalog-Eintrag beschränkt, den V0024 seedet
 * (`foerderjahr_preflight_de02`) — fail-closed statt eines generischen
 * `@IsString()`, weil ein unbekannter Code sonst erst spät (Service-Lookup)
 * statt schon an der DTO-Grenze abgelehnt würde.
 */
export class PreflightAusfuehrenDto {
  @IsUUID()
  foerderjahrId!: string;

  @IsIn([PREFLIGHT_PROFIL_CODE])
  profilCode!: string;
}
