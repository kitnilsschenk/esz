import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { ListQueryDto } from '../../common/list-query.dto';

/**
 * `nurAktuelle` kommt als Query-STRING (`?nurAktuelle=true`) — `Boolean(...)`
 * würde jeden nicht-leeren String (auch `"false"`) als `true` interpretieren.
 * Daher ein explizites String-Mapping statt `@Type(() => Boolean)`.
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

export class NutzungsverhaeltnisListQueryDto extends ListQueryDto {
  @IsOptional()
  @IsUUID()
  endkundeId?: string;

  @IsOptional()
  @IsUUID()
  anschlussnutzerId?: string;

  @IsOptional()
  @IsUUID()
  systemId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parseBooleanQueryParam(value))
  @IsBoolean()
  nurAktuelle?: boolean;
}
