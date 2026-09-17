import { IsOptional, IsUUID } from 'class-validator';
import { ListQueryDto } from '../../common/list-query.dto';

export class SystemListQueryDto extends ListQueryDto {
  @IsOptional()
  @IsUUID()
  endkundeId?: string;
}
