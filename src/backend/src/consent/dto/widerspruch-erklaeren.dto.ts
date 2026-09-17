import { IsDateString, IsIn, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { ERFASSUNGSWEGE, SUBJEKT_TYPEN } from '../consent.types';
import type { Erfassungsweg, SubjektTyp } from '../consent.types';

/**
 * `POST /consent/widersprueche` (Auflage AW-27).
 *
 * Spiegelbild zu `EinwilligungErteilenDto` — mit denselben Grundsaetzen:
 * kein Default (DS-02), kein `now()` fuer den Erklaerungszeitpunkt, keine
 * zweite Zweck-Liste im DTO.
 *
 * **KEIN `erlaubnismodus` im Body.** Er wird serverseitig aus der Matrix
 * `consent.zweck_subjekt` bestimmt — dieselbe Begruendung wie bei A12-1 fuer
 * die Rechtsgrundlage: Ob eine Verarbeitung geschuldet ist oder auf einer
 * Einwilligung beruht, entscheidet nicht, wer das Formular ausfuellt.
 */
export class WiderspruchErklaerenDto {
  @IsIn(SUBJEKT_TYPEN, { message: `subjektTyp muss einer von ${SUBJEKT_TYPEN.join(', ')} sein.` })
  subjektTyp!: SubjektTyp;

  @IsUUID(undefined, { message: 'subjektId muss eine UUID sein.' })
  subjektId!: string;

  /** Form 1:1 aus `ck_zweck_code_form` (V0044) gespiegelt. */
  @Matches(/^[a-z][a-z0-9_]{2,63}$/, {
    message: 'zweckCode darf nur Kleinbuchstaben, Ziffern und Unterstrich enthalten (erstes Zeichen ein Buchstabe).',
  })
  zweckCode!: string;

  @IsIn(ERFASSUNGSWEGE, { message: `erfassungsweg muss einer von ${ERFASSUNGSWEGE.join(', ')} sein.` })
  erfassungsweg!: Erfassungsweg;

  /**
   * Zeitpunkt der ERKLAERUNG, nicht der Erfassung.
   *
   * Beim Widerspruch wiegt der Unterschied schwerer als bei der
   * Einwilligung: Er sagt, ab wann NICHT MEHR verarbeitet werden durfte. Ein
   * Erfassungszeitpunkt an dieser Stelle verkuerzte den Zeitraum, in dem die
   * Verarbeitung ungedeckt war -- zugunsten des Verantwortlichen.
   */
  @IsDateString({}, { message: 'erklaertAt muss ein Zeitpunkt im ISO-8601-Format sein (UTC, mit Z).' })
  erklaertAt!: string;

  /** Fundstelle des zugrundeliegenden Dokuments -- Ordnungsnummer, kein Personendatum. */
  @IsString()
  @MinLength(1, { message: 'quelleRef darf nicht leer sein -- ohne Fundstelle ist das Dokument nicht auffindbar.' })
  @MaxLength(200)
  quelleRef!: string;
}
