import { IsIn } from 'class-validator';
import { STANDORT_STILLLEGEN_GRUND_WERTE } from '../standort.constants';
import type { StandortStilllegenGrund } from '../standort.constants';

/**
 * `components/schemas/StandortStilllegen` (stammdaten.openapi.yaml, ADR-0010
 * §5) — whitelisted Grund (kein Freitext, Linie 2), analog `ShredAblehnenAnweisungDto`.
 */
export class StandortStilllegenDto {
  @IsIn(STANDORT_STILLLEGEN_GRUND_WERTE)
  grund!: StandortStilllegenGrund;
}
