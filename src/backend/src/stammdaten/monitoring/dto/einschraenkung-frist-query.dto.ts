import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  EINSCHRAENKUNG_WIEDERVORLAGE_TAGE_MAX,
  EINSCHRAENKUNG_WIEDERVORLAGE_TAGE_MIN,
} from '../einschraenkung-frist.constants';

/**
 * Query von `GET /monitoring/einschraenkung-fristen`.
 *
 * `schwelleTage` ist ueberschreibbar, weil Art. 18 KEINE Zahl nennt und die
 * Vorgabe (30 Tage, angelehnt an die Art.-12-Abs.-3-Reaktionsfrist) eine
 * betriebliche Setzung ist, keine Rechtsfolge. Die Fachseite soll anders
 * schneiden koennen, ohne dass Code geaendert wird.
 */
export class EinschraenkungFristQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(EINSCHRAENKUNG_WIEDERVORLAGE_TAGE_MIN)
  @Max(EINSCHRAENKUNG_WIEDERVORLAGE_TAGE_MAX)
  schwelleTage?: number;
}
