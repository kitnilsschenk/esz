import { IsUUID, Matches } from 'class-validator';

/** `GET /geraeteerkennung/gruppen` und `.../zuordnungen`. */
export class EndkundeQueryDto {
  @IsUUID(undefined, { message: 'endkundeId muss eine UUID sein.' })
  endkundeId!: string;
}

/** `GET /geraeteerkennung/quote` — die Quote ist je Foerderjahr definiert. */
export class QuoteQueryDto {
  @IsUUID(undefined, { message: 'endkundeId muss eine UUID sein.' })
  endkundeId!: string;

  @IsUUID(undefined, { message: 'foerderjahrId muss eine UUID sein.' })
  foerderjahrId!: string;

  /**
   * Energietraeger-Code. BEWUSST ohne eigene Liste im DTO: Der Katalog steht
   * an `energy.zaehler`, und eine zweite Liste hier liefe frueher oder
   * spaeter davon weg. Ein unbekannter Wert liefert schlicht keine Zeilen.
   */
  @Matches(/^[a-z][a-z0-9_]{1,31}$/, {
    message: 'energietraeger darf nur Kleinbuchstaben, Ziffern und Unterstrich enthalten.',
  })
  energietraeger!: string;
}
