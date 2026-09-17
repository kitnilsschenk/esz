import { IsDateString, IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { ERFASSUNGSWEGE } from '../consent.types';
import type { Erfassungsweg } from '../consent.types';

/**
 * `POST /consent/einwilligungen/{id}/widerruf` (A12-29).
 *
 * Der Widerruf war bis V0046 ein Aufruf ohne Rumpf: kein Kanal, keine
 * Fundstelle, kein Erklaerungszeitpunkt. Damit war die Erteilung dreifach
 * belegt (Fachzeile, Beleg, Audit) und der Widerruf einfach -- eine
 * Asymmetrie zulasten der betroffenen Person, denn Art. 7 Abs. 3 S. 4
 * verlangt, dass der Widerruf so einfach sein muss wie die Erteilung; dann
 * muss er auch so belegt sein.
 */
export class EinwilligungWiderrufenDto {
  /**
   * Zeitpunkt, zu dem der Widerruf ERKLAERT wurde -- nicht der Zeitpunkt der
   * Erfassung.
   *
   * Hier wiegt der Unterschied schwerer als bei der Erteilung: Ein am 1.
   * brieflich erklaerter, am 20. erfasster Widerruf liesse neunzehn Tage
   * rechtswidriger Verarbeitung rechtmaessig aussehen.
   */
  @IsDateString({}, { message: 'widerrufenAt muss ein Zeitpunkt im ISO-8601-Format sein (UTC, mit Z).' })
  widerrufenAt!: string;

  /** Auf welchem Weg der Widerruf erklaert wurde. Digital ist ueber die Betriebssicht nicht erfassbar (E9). */
  @IsIn(ERFASSUNGSWEGE, { message: `erfassungsweg muss einer von ${ERFASSUNGSWEGE.join(', ')} sein.` })
  erfassungsweg!: Erfassungsweg;

  /** Fundstelle des Widerrufsschreibens bzw. der Gespraechsnotiz. */
  @IsString()
  @MinLength(1, { message: 'quelleRef darf nicht leer sein -- ohne Fundstelle ist der Widerruf nicht belegt.' })
  @MaxLength(200)
  quelleRef!: string;
}
