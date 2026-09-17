import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/** `GET /nutzerinfo/informationen?endkundeId=&limit=` */
export class NutzerinfoQueryDto {
  @IsUUID(undefined, { message: 'endkundeId muss eine UUID sein.' })
  endkundeId!: string;

  /** Wie viele Monate zurueck. Default 24 — zwei Jahre sind die uebliche Kundensicht. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit muss eine ganze Zahl sein.' })
  @Min(1)
  @Max(100)
  limit?: number;
}
