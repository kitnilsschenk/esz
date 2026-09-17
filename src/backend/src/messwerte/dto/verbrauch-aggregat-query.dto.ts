import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsOptional } from 'class-validator';
import { AUFLOESUNG_WERTE } from '../verbrauch-aggregat.types';
import type { Aufloesung } from '../verbrauch-aggregat.types';

/** Analog `standort/dto/zaehler-unter-knoten-query.dto.ts` — Boolean-Query-Parameter kommen als literale Strings an. */
function parseBooleanQueryParam(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return value;
}

/**
 * `components/schemas/VerbrauchAggregatQuery` (schemas/openapi/messwerte.openapi.yaml).
 * `von`/`bis` beschreiben ein HALBOFFENES Intervall `[von, bis)` (UTC).
 * `stichtag` (Default `bis`) legt fest, WELCHER Zähler-Bestand unter dem
 * Knoten für die gesamte Periode gilt (v1-Vereinfachung — s.
 * `verbrauch-aggregat.service.ts`-Klassen-Dok, "Zeitscheiben-Korrektheit").
 */
export class VerbrauchAggregatQueryDto {
  @IsDateString()
  von!: string;

  @IsDateString()
  bis!: string;

  @IsIn(AUFLOESUNG_WERTE)
  aufloesung!: Aufloesung;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parseBooleanQueryParam(value))
  @IsBoolean()
  inklusiveUnterknoten?: boolean;

  @IsOptional()
  @IsDateString()
  stichtag?: string;
}
