import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * `components/schemas/StandortPiiAendern` (stammdaten.openapi.yaml, ADR-0010
 * §5, `PUT .../standorte/{id}/pii`) — `bezeichnung` PFLICHT (Vollersatz,
 * analog `EndkundePiiDto`, kein Teil-Update auf Feldebene: ein weggelassenes
 * `adresse` LÖSCHT die hinterlegte Adresse — s. `standort.service.ts`).
 */
export class StandortPiiAendernDto {
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  bezeichnung!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  adresse?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  geo?: string;
}
