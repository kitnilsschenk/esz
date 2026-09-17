import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Optionale Overrides der Verfahrensparameter (`analytics.verfahren_version.
 * parameter_schema` `witterung_gtz_vdi3807@1`, ADR-0006 B12.1). Fehlt ein
 * Feld, greift der Kern-Default aus `domain/witterung-gtz.ts`
 * (`GTZ_T_INNEN_C_DEFAULT`/`GTZ_T_HEIZGRENZE_C_DEFAULT`/
 * `TAGE_PRO_JAHR_DEFAULT`) bzw. `'Europe/Berlin'` für `tagesZeitzone`
 * (Schema-Default, `parameter_schema.properties.tages_zeitzone.default`).
 */
export class BerechnungslaufParameterDto {
  @IsOptional()
  @IsNumber()
  @Min(-50)
  @Max(50)
  tInnenC?: number;

  @IsOptional()
  @IsNumber()
  @Min(-50)
  @Max(50)
  tHeizgrenzeC?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(366)
  tageProJahr?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  tagesZeitzone?: string;
}
