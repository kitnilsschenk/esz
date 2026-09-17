import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * `components/schemas/EndkundePii` (stammdaten.openapi.yaml). Direkt-PII des
 * Vertragspartners — pii=true (ADR-0004 Anhang B P1-P3). NUR im Request-
 * Body (Anlegen/Ändern) bzw. im maskierten Detail-Response — NIE in Listen
 * (Linie 2).
 */
export class EndkundePiiDto {
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  anschrift!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  kontakt?: string;
}
