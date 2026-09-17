import { IsDateString } from 'class-validator';

/** `components/schemas/MesswertZeitreiheQuery` — halboffenes Intervall `[von, bis)` (UTC). */
export class MesskanalZeitreiheQueryDto {
  @IsDateString()
  von!: string;

  @IsDateString()
  bis!: string;
}
