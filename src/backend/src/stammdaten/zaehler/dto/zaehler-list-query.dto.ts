import { IsOptional, IsUUID } from 'class-validator';
import { ListQueryDto } from '../../common/list-query.dto';

export class ZaehlerListQueryDto extends ListQueryDto {
  @IsOptional()
  @IsUUID()
  systemId?: string;
}
