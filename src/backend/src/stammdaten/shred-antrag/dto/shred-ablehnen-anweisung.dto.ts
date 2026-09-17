import { IsIn } from 'class-validator';
import { SHRED_ABLEHNUNGSGRUND_WERTE } from '../shred-antrag.constants';
import type { ShredAblehnungsgrund } from '../shred-antrag.constants';

/**
 * `components/schemas/ShredAblehnenAnweisung` (stammdaten.openapi.yaml,
 * ADR-0009 §2.1/§2.4/§8) — whitelisted Ablehnungsgrund, kein Freitext
 * (rote Linie 2). PROVISORISCHE v1-Liste (s. `shred-antrag.constants.ts`).
 */
export class ShredAblehnenAnweisungDto {
  @IsIn(SHRED_ABLEHNUNGSGRUND_WERTE)
  ablehnungsgrund!: ShredAblehnungsgrund;
}
