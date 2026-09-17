import { IsOptional, IsUUID } from 'class-validator';
import { ListQueryDto } from '../../common/list-query.dto';

export class AnschlussnutzerListQueryDto extends ListQueryDto {
  @IsOptional()
  @IsUUID()
  endkundeId?: string;
}
