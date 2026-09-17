import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/** `components/schemas/SystemAendern` (stammdaten.openapi.yaml, `minProperties: 1`). */
export class SystemAendernDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  bezeichnung?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  systemgrenze?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  systembeschreibung?: string;

  /**
   * Standort (Liegenschaft/Gebaeude) dieser Berechnungseinheit (V0074).
   *
   * Der Einsparungsnachweis rechnet je System, und ein System ist dort
   * definiert als „1 Energietraeger an 1 Standort eines Endkunden".
   * Optional: Bestandssysteme haben keinen, und eine Pflichtangabe braeche
   * jeden bestehenden Schreibpfad. Der Standort MUSS demselben Endkunden
   * gehoeren — die Datenbank haelt das ueber einen zusammengesetzten
   * Fremdschluessel auf, der Dienst gibt dafuer einen erklaerten Fehler.
   */
  @IsOptional()
  @IsUUID()
  standortId?: string;
}
