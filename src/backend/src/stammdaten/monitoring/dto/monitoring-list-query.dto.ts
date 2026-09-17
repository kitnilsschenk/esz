import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { ListQueryDto } from '../../common/list-query.dto';

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

export class MonitoringListQueryDto extends ListQueryDto {
  @IsOptional()
  @IsUUID()
  endkundeId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parseBooleanQueryParam(value))
  @IsBoolean()
  nurMitLuecken?: boolean;
}
