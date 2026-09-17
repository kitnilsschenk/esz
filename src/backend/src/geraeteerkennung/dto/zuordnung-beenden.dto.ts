import { IsDateString, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * `POST /geraeteerkennung/zuordnungen/beenden` (TB-05).
 *
 * Der Grund ist PFLICHT, weil der Vorgang die Zuordnungsquote SENKT. Von den
 * beiden Richtungen ist die senkende die, die spaeter erklaert werden muss.
 */
export class ZuordnungBeendenDto {
  @IsString()
  geraetegruppeId!: string;

  @IsString()
  messkanalId!: string;

  @IsDateString({}, { message: 'gueltigBis muss ein Datum im Format YYYY-MM-DD sein.' })
  gueltigBis!: string;

  @IsString()
  @MinLength(3, { message: 'grund ist zu kurz -- er erklaert eine gesunkene Quote.' })
  @MaxLength(500)
  grund!: string;
}
