import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { Messrichtung, MessgroesseArt } from '../../persistence/energy/energy-messkanal.repository';
import { MESSRICHTUNG_WERTE } from '../../persistence/energy/energy-messkanal.repository';

const ART_WERTE: readonly MessgroesseArt[] = ['kumulativ_zaehlerstand', 'intervall_verbrauch'];

/** `components/schemas/MesskanalAnlegen` (stammdaten.openapi.yaml). */
export class MesskanalAnlegenDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  messgroesse!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  einheit!: string;

  @IsIn(ART_WERTE)
  art!: MessgroesseArt;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  obisKennzahl?: string;

  /**
   * `true` = dieser Kanal misst eine TEILMENGE dessen, was ein anderer Kanal
   * desselben Systems bereits erfasst — eine Untermessung (V0058).
   *
   * Die Angabe gehoert hierher und nicht an die Geraetegruppen-Zuordnung: Ob
   * ein Zaehler eine Teilmenge misst, steht beim EINBAU fest. Die
   * Einsparberechnung laesst solche Kanaele aus; ohne die Angabe zaehlt sie
   * denselben Verbrauch mehrfach und weist eine falsche Einsparung aus.
   *
   * Default `false` — die Hauptmessung ist der Regelfall, und ein stiller
   * `true` nähme einen Kanal unbemerkt aus der Berechnung.
   */
  @IsOptional()
  @IsBoolean({ message: 'istUntermessung muss ein Wahrheitswert sein.' })
  istUntermessung?: boolean;

  /**
   * Bezug, Eigenerzeugung oder Einspeisung (V0074).
   *
   * Der Einsparungsnachweis rechnet `Ist-Verbrauch = Σ bezug +
   * eigenerzeugung − einspeisung` ([Q3] Kap. 9) und verlangt, dass
   * selbsterzeugte Energie GETRENNT vom Netzbezug ausgewiesen wird —
   * selbsterzeugter Strom ist keine Einsparung.
   *
   * Default `bezug`: Der Verbrauchszaehler ist der Regelfall. Ein still auf
   * `einspeisung` gesetzter Kanal wuerde vom Ist-Verbrauch ABGEZOGEN und die
   * Einsparung rechnerisch erhoehen — das darf nie unbemerkt passieren.
   */
  @IsOptional()
  @IsIn(MESSRICHTUNG_WERTE, {
    message: `richtung muss eine von: ${MESSRICHTUNG_WERTE.join(', ')} sein.`,
  })
  richtung?: Messrichtung;
}
