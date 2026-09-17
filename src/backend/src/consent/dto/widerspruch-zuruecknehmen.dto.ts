import { IsDateString, IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { ERFASSUNGSWEGE } from '../consent.types';
import type { Erfassungsweg } from '../consent.types';

/**
 * `POST /consent/widersprueche/{id}/ruecknahme` (Auflage AW-27).
 *
 * Die Ruecknahme ist ein eigener Vorgang mit eigenem Zeitpunkt und eigenem
 * Beleg -- nicht das Loeschen des ersten. Sie laesst eine Verarbeitung WIEDER
 * anlaufen und setzt bei `wiss_auswertung` ein Bestandsmerkmal zurueck; von
 * beidem muss belegbar sein, worauf es beruhte.
 */
export class WiderspruchZuruecknehmenDto {
  @IsDateString({}, { message: 'zurueckgenommenAt muss ein Zeitpunkt im ISO-8601-Format sein (UTC, mit Z).' })
  zurueckgenommenAt!: string;

  @IsIn(ERFASSUNGSWEGE, { message: `erfassungsweg muss einer von ${ERFASSUNGSWEGE.join(', ')} sein.` })
  erfassungsweg!: Erfassungsweg;

  @IsString()
  @MinLength(1, { message: 'quelleRef darf nicht leer sein -- ohne Fundstelle ist das Dokument nicht auffindbar.' })
  @MaxLength(200)
  quelleRef!: string;
}
