import { IsBoolean, IsOptional, Matches } from 'class-validator';

/**
 * `POST /nutzerinfo/laeufe` (TB-06).
 *
 * `ausfuehren` hat KEINEN Default und ist optional — fehlt es, ist der Lauf
 * ein Probelauf. Dieselbe Linie wie beim Retention-Runner und beim
 * Migrations-Runner: Bevor etwas erzeugt wird, soll jemand sehen koennen, WIE
 * VIEL erzeugt wuerde und vor allem, wie viele Kunden NICHT informierbar
 * sind.
 */
export class NutzerinfoLaufDto {
  /** Monatserster des abgeschlossenen Monats, ISO `YYYY-MM-01`. */
  @Matches(/^\d{4}-\d{2}-01$/, {
    message: 'monat muss ein Monatserster in der Form YYYY-MM-01 sein.',
  })
  monat!: string;

  @IsOptional()
  @IsBoolean({ message: 'ausfuehren muss ein Wahrheitswert sein.' })
  ausfuehren?: boolean;
}
