import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { EndkundePiiDto } from './endkunde-pii.dto';

/** `components/schemas/EndkundeAnlegen` (stammdaten.openapi.yaml). */
export class EndkundeAnlegenDto {
  @ValidateNested()
  @Type(() => EndkundePiiDto)
  stammdatenPii!: EndkundePiiDto;

  @IsOptional()
  @IsBoolean()
  vonWissAuswertungAusgenommen?: boolean;

  /**
   * Endkundengruppe/Branche fuer den LK-Nachweis (V0074).
   *
   * FREITEXT: Die maßgebliche Werteliste ist die des BAFA-Formulars
   * „Nachweis der leistungsabhaengigen Komponente"; sie liegt dem Repository
   * nicht vor. Eine erfundene Kategorienliste saehe verbindlich aus und
   * muesste beim ersten echten Nachweis umgeschluesselt werden.
   *
   * Der Wert verlaesst das System im pseudonymisierten Nachweis — das ist
   * sein Zweck (Blatt 6b/7 der Nachweis-Vorlage).
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  endkundengruppe?: string;
}
