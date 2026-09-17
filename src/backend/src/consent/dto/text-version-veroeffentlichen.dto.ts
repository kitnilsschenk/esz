import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * `POST /consent/texte` (ADR-0012 B1/E3, DS-04).
 *
 * Der SHA-256 wird NICHT entgegengenommen, sondern serverseitig aus dem
 * Wortlaut gebildet. Ein mitgelieferter Hash waere eine Behauptung ueber den
 * Text statt einer Pruefung desselben.
 */
export class TextVersionVeroeffentlichenDto {
  /** Form 1:1 aus `ck_zweck_code_form` (V0044). */
  @Matches(/^[a-z][a-z0-9_]{2,63}$/, {
    message: 'zweckCode darf nur Kleinbuchstaben, Ziffern und Unterstrich enthalten (erstes Zeichen ein Buchstabe).',
  })
  zweckCode!: string;

  /** Form 1:1 aus `ck_text_version_fassung_form` (V0044): `<major>.<minor>`. */
  @Matches(/^[0-9]+\.[0-9]+$/, { message: 'fassung muss die Form <Zahl>.<Zahl> haben, z. B. 1.0 oder 2.1.' })
  fassung!: string;

  /**
   * Die Mindestlaenge spiegelt `ck_text_version_wortlaut_gefuellt` (V0044).
   * Sie ist bewusst niedrig: Sie faengt das leere und das versehentlich
   * einzeilige Feld ab, MASST SICH ABER NICHT AN, die Vollstaendigkeit der
   * Art.-13-Angaben zu pruefen. Das ist eine juristische Beurteilung, keine
   * Zeichenzaehlung -- ein Formular, das mit 20 Zeichen zufrieden ist, darf
   * nicht den Eindruck erwecken, den Text geprueft zu haben.
   */
  @IsString()
  @MinLength(20, { message: 'wortlaut ist zu kurz — bitte die vollstaendige Erklaerung einstellen.' })
  @MaxLength(100_000)
  wortlaut!: string;
}
