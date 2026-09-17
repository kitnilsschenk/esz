import { IsIn, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import type { Energietraeger } from '../../persistence/energy/energy-zaehler.repository';

const ENERGIETRAEGER_WERTE: readonly Energietraeger[] = ['strom', 'waerme', 'kaelte', 'gas', 'oel', 'biomasse'];

/** `components/schemas/ZaehlerAnlegen` (stammdaten.openapi.yaml). KEIN `geraeteReferenz` (§12). */
export class ZaehlerAnlegenDto {
  @IsUUID()
  systemId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  geraetetyp!: string;

  @IsIn(ENERGIETRAEGER_WERTE)
  energietraeger!: Energietraeger;
}
