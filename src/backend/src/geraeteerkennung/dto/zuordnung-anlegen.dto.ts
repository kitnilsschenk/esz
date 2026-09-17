import { IsDateString, IsIn, IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ERKENNUNGSMETHODEN } from '../geraeteerkennung.types';
import type { Erkennungsmethode } from '../geraeteerkennung.types';

/**
 * `POST /geraeteerkennung/zuordnungen` (TB-05, [Q3] Kap. 5).
 *
 * KEIN Feld hat einen Default ausser `anteilProzent`. Methode, Topologie und
 * Gueltigkeitsbeginn sind Angaben, die jemand TREFFEN muss -- ein stiller
 * Default waere genau die Vorbelegung, die niemand mehr sieht.
 */
export class ZuordnungAnlegenDto {
  @IsUUID(undefined, { message: 'geraetegruppeId muss eine UUID sein.' })
  geraetegruppeId!: string;

  @IsUUID(undefined, { message: 'messkanalId muss eine UUID sein.' })
  messkanalId!: string;

  /** [Q3] Kap. 5 verlangt die Angabe ausdruecklich. */
  @IsIn(ERKENNUNGSMETHODEN, {
    message: `methode muss eine von ${ERKENNUNGSMETHODEN.join(', ')} sein.`,
  })
  methode!: Erkennungsmethode;

  /**
   * Erwartete Genauigkeit in Prozent -- [Q3] Kap. 5 verlangt sie ebenfalls
   * ausdruecklich. Pflicht, sobald NICHT direkt gemessen wird; der Service
   * weist eine fehlende Angabe mit einer sprechenden Meldung ab.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'genauigkeitPct muss eine Zahl sein.' })
  @Min(0.01)
  @Max(100)
  genauigkeitPct?: number;

  /** Anteil des Kanalverbrauchs, der dieser Gruppe zuzurechnen ist. Default 100. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'anteilProzent muss eine Zahl sein.' })
  @Min(0.01)
  @Max(100)
  anteilProzent?: number;

  // KEINE Angabe zur Untermessung: Sie steht seit V0058 am Messkanal und wird
  // von dort gelesen. Sie hier entgegenzunehmen hiesse, dieselbe Aussage ein
  // zweites Mal zu fuehren — und wer beim Zuordnen etwas anderes eintraegt als
  // an der Messstelle steht, erzeugte einen Widerspruch, den hinterher niemand
  // aufloesen kann.

  @IsDateString({}, { message: 'gueltigVon muss ein Datum im Format YYYY-MM-DD sein.' })
  gueltigVon!: string;
}
