import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

/**
 * `nurAktive` kommt als Query-STRING (`?nurAktive=true`) — `Boolean(...)`
 * würde jeden nicht-leeren String (auch `"false"`) als `true` interpretieren.
 * Daher ein explizites String-Mapping statt `@Type(() => Boolean)` (analog
 * `NutzungsverhaeltnisListQueryDto`/`MonitoringListQueryDto`).
 */
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
 * `components/schemas/StandortListeQuery` (stammdaten.openapi.yaml, ADR-0010
 * §5, `GET /stammdaten/endkunden/{endkundeId}/standorte`) — bewusst KEINE
 * Cursor-Pagination (die ADR-API-Skizze kennt für diese Route weder `cursor`
 * noch `limit`, s. `EnergyStandortRepository.listByEndkunde`-Kommentar).
 */
export class StandortListeQueryDto {
  @IsOptional()
  @IsUUID()
  wurzelId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9)
  maxTiefe?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parseBooleanQueryParam(value))
  @IsBoolean()
  nurAktive?: boolean;
}
