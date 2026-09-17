import { IsDateString, IsIn, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { ERFASSUNGSWEGE, SUBJEKT_TYPEN } from '../consent.types';
import type { Erfassungsweg, SubjektTyp } from '../consent.types';

/**
 * `POST /consent/einwilligungen` (ADR-0012 B1).
 *
 * KEIN Feld hat einen Default — DS-02 („optionale Abfragen nie
 * vorausgewaehlt") gilt nicht nur fuer Haekchen in der Oberflaeche. Ein
 * DTO-Default fuer `erfassungsweg` waere genau das: eine Vorbelegung, die
 * niemand mehr sieht und die im Zweifel eine Behauptung ueber einen Vorgang
 * aufstellt, den es so nicht gab.
 *
 * KEINE `rechtsgrundlage` (A12-1): Sie wird serverseitig aus der Matrix
 * `consent.zweck_subjekt` BESTIMMT. Eine Rechtsgrundlage, die ein
 * Sachbearbeiter aus einem Dropdown waehlt, ist von der falschen Stelle
 * gewaehlt — und der haeufigste Fehler waere, dem Endkunden eine
 * Einwilligung anzubieten, wo ein Vertrag traegt.
 *
 * `zweckCode` wird bewusst NICHT gegen eine hier gepflegte Liste geprueft:
 * Der Katalog steht in `consent.zweck` (V0044), und eine zweite Liste im DTO
 * liefe auseinander. Ein unbekannter Zweck scheitert am Fremdschluessel.
 */
export class EinwilligungErteilenDto {
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
   * Zeitpunkt der ERKLAERUNG (A12-27) -- Pflichtfeld, kein `now()`.
   *
   * Der Regelfall dieser API ist das NACHTRAGEN: Eine auf Papier erteilte
   * Einwilligung wird Tage oder Wochen spaeter erfasst. Setzte der Server
   * hier den Erfassungszeitpunkt ein, wiese der Nachweis systematisch den
   * falschen Tag aus und liesse den Zeitraum dazwischen als ohne
   * Rechtsgrundlage verarbeitet erscheinen.
   *
   * In der ZUKUNFT liegende Werte weist der Service ab; die Datenbank haelt
   * dieselbe Grenze (V0046).
   */
  @IsDateString({}, { message: 'erteiltAt muss ein Zeitpunkt im ISO-8601-Format sein (UTC, mit Z).' })
  erteiltAt!: string;

  /**
   * Fundstelle des zugrundeliegenden Dokuments (A12-28) -- Vertrags-,
   * Akten- oder Ablagekennung.
   *
   * Ohne sie bedeutet `erfassungsweg: vertrag_schriftlich` nicht "es gibt
   * eine unterschriebene Erklaerung", sondern nur "jemand hat einen
   * Listeneintrag gewaehlt". Es ist eine ORDNUNGSNUMMER, kein Personendatum
   * -- wer hier einen Namen eintraegt, missbraucht das Feld.
   */
  @IsString()
  @MinLength(1, { message: 'quelleRef darf nicht leer sein -- ohne Fundstelle ist das Dokument nicht auffindbar.' })
  @MaxLength(200)
  quelleRef!: string;
}
