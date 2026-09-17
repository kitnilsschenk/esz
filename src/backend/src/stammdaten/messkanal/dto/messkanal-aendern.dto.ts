import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { Messrichtung } from '../../persistence/energy/energy-messkanal.repository';
import { MESSRICHTUNG_WERTE } from '../../persistence/energy/energy-messkanal.repository';

/** `components/schemas/MesskanalAendern` (stammdaten.openapi.yaml, `minProperties: 1`). */
export class MesskanalAendernDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  einheit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  obisKennzahl?: string;

  /**
   * Korrigierbar, weil eine Messstelle falsch erfasst worden sein kann
   * (V0058). Die Aenderung wirkt auf KUENFTIGE Berechnungslaeufe; bereits
   * gerechnete bleiben unveraendert — sie sind append-only und tragen die
   * Zahlen, die damals galten.
   */
  @IsOptional()
  @IsBoolean({ message: 'istUntermessung muss ein Wahrheitswert sein.' })
  istUntermessung?: boolean;

  /**
   * Korrigierbar aus demselben Grund wie `istUntermessung`: Eine Messstelle
   * kann falsch erfasst worden sein, und der Default `bezug` aus V0074 ist
   * fuer Bestandskanaele eine Annahme, keine Messung. Die Aenderung wirkt auf
   * KUENFTIGE Berechnungslaeufe; bereits gerechnete bleiben unveraendert.
   */
  @IsOptional()
  @IsIn(MESSRICHTUNG_WERTE, {
    message: `richtung muss eine von: ${MESSRICHTUNG_WERTE.join(', ')} sein.`,
  })
  richtung?: Messrichtung;
}
