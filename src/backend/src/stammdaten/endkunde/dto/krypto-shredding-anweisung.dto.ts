import { IsIn } from 'class-validator';

const BESTAETIGUNG_WERTE = ['ENDGUELTIG_LOESCHEN'] as const;
const GRUND_WERTE = ['betroffenenantrag_art17', 'aufbewahrung_abgelaufen', 'sonstige_rechtsgrundlage'] as const;

export type KryptoShreddingGrund = (typeof GRUND_WERTE)[number];

/**
 * `components/schemas/KryptoShreddingAnweisung` (stammdaten.openapi.yaml) —
 * expliziter Vorsatz für die irreversible Art.-17-Löschung
 * (Fehlbedienungsschutz). `bestaetigung` MUSS exakt `ENDGUELTIG_LOESCHEN`
 * sein; `grund` ist ein whitelisted Code (kein Freitext, Linie 2).
 */
export class KryptoShreddingAnweisungDto {
  @IsIn(BESTAETIGUNG_WERTE)
  bestaetigung!: (typeof BESTAETIGUNG_WERTE)[number];

  @IsIn(GRUND_WERTE)
  grund!: KryptoShreddingGrund;
}
