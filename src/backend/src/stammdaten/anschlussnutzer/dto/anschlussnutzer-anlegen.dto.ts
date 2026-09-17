import { Type } from 'class-transformer';
import { IsUUID, ValidateNested } from 'class-validator';
import { AnschlussnutzerPiiDto } from './anschlussnutzer-pii.dto';

/** `components/schemas/AnschlussnutzerAnlegen` (stammdaten.openapi.yaml). */
export class AnschlussnutzerAnlegenDto {
  @IsUUID()
  endkundeId!: string;

  @ValidateNested()
  @Type(() => AnschlussnutzerPiiDto)
  stammdatenPii!: AnschlussnutzerPiiDto;
}
