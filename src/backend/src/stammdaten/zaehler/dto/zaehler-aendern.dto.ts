import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** `components/schemas/ZaehlerAendern` (stammdaten.openapi.yaml, `minProperties: 1`). */
export class ZaehlerAendernDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  geraetetyp?: string;
}
