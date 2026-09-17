import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsOptional } from 'class-validator';

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
 * `components/schemas/ZaehlerUnterKnotenQuery` (stammdaten.openapi.yaml,
 * ADR-0010 §5, `GET .../standorte/{id}/zaehler`) — `stichtag` Default `now()`
 * (service-seitig), `inklusiveUnterknoten` Default `true` (ADR wörtlich).
 */
export class ZaehlerUnterKnotenQueryDto {
  @IsOptional()
  @IsDateString()
  stichtag?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parseBooleanQueryParam(value))
  @IsBoolean()
  inklusiveUnterknoten?: boolean;
}
