import { IsIn } from 'class-validator';

const BESTAETIGUNG_WERTE = ['ENDGUELTIG_LOESCHEN'] as const;

/**
 * `components/schemas/ShredFreigebenAnweisung` (stammdaten.openapi.yaml,
 * ADR-0009 §2.4) — die ZWEITE Person bestätigt bewusst über ein EIGENES
 * Type-to-confirm (nicht durch bloßes Anklicken der Antragsentscheidung).
 * Kein `grund` (der steht bereits im ursprünglichen Antrag,
 * `KryptoShreddingAnweisungDto`).
 */
export class ShredFreigebenAnweisungDto {
  @IsIn(BESTAETIGUNG_WERTE)
  bestaetigung!: (typeof BESTAETIGUNG_WERTE)[number];
}
