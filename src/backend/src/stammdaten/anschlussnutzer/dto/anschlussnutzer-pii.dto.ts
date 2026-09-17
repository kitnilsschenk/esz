import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** `components/schemas/AnschlussnutzerPii` (stammdaten.openapi.yaml) — DS-07-Datensubjekt, pii=true. */
export class AnschlussnutzerPiiDto {
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  kontakt?: string;
}
