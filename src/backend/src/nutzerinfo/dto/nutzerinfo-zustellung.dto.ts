import { IsDateString, IsIn, Matches } from 'class-validator';
import { ZUSTELLWEGE } from '../nutzerinfo.types';
import type { Zustellweg } from '../nutzerinfo.types';

/**
 * `POST /nutzerinfo/informationen/{id}/zustellung` — der Versand-/
 * Bereitstellungsnachweis, den TB-06 verlangt.
 *
 * `zugestelltAt` ist Pflicht und kein `now()`: Der Regelfall ist das
 * NACHTRAGEN eines Vorgangs, der ausserhalb des Systems stattgefunden hat
 * (Brief, Uebergabe). Setzte der Server den Erfassungszeitpunkt ein, wiese
 * der Nachweis systematisch den falschen Tag aus.
 */
export class NutzerinfoZustellungDto {
  @IsIn(ZUSTELLWEGE, { message: `zustellweg muss einer von ${ZUSTELLWEGE.join(', ')} sein.` })
  zustellweg!: Zustellweg;

  @IsDateString({}, { message: 'zugestelltAt muss ein Zeitpunkt im ISO-8601-Format sein (UTC, mit Z).' })
  zugestelltAt!: string;
}

/**
 * `POST /nutzerinfo/zustellungen` — der Versandnachweis für einen GANZEN
 * Monat.
 *
 * Derselbe Vorgang wie einzeln, nur über den Stapel: Post läuft nicht Kunde
 * für Kunde, sondern einmal drucken, einmal einliefern. Ohne diesen Weg
 * bliebe der Nachweis in der Praxis lückenhaft — und ein lückenhafter
 * Versandnachweis ist gegenüber der Bewilligungsbehörde dasselbe wie keiner.
 */
export class NutzerinfoSammelZustellungDto {
  @Matches(/^\d{4}-\d{2}-01$/, { message: 'monat muss ein Monatserster in der Form YYYY-MM-01 sein.' })
  monat!: string;

  @IsIn(ZUSTELLWEGE, { message: `zustellweg muss einer von ${ZUSTELLWEGE.join(', ')} sein.` })
  zustellweg!: Zustellweg;

  @IsDateString({}, { message: 'zugestelltAt muss ein Zeitpunkt im ISO-8601-Format sein (UTC, mit Z).' })
  zugestelltAt!: string;
}
