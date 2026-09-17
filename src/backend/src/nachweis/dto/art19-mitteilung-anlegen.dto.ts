import { IsIn, IsUUID } from 'class-validator';
import { ART19_ANLAESSE, type Art19Anlass } from '../persistence/art19-pflicht.repository';
import { UNTERRICHTUNG_KANAELE, type UnterrichtungKanal } from '../../stammdaten/persistence/energy/energy-einschraenkung-unterrichtung.repository';

/**
 * Body von `POST /nachweis/art19-pflichten/mitteilungen` (ADR-0007
 * A18/A11.12).
 *
 * `kanal` nutzt DIESELBE geschlossene Liste wie die Art.-18-Unterrichtung
 * (V0035/V0037) — es ist derselbe Vorgangstyp „jemand wurde auf einem Weg
 * unterrichtet", und zwei getrennte Listen wuerden frueher oder spaeter
 * auseinanderlaufen.
 *
 * Kein Feld fuer Zeitpunkt oder Ausfuehrenden: beides serverseitig, sonst
 * waere der Beleg rueckdatierbar bzw. einem Dritten zuschreibbar.
 *
 * Kein Feld fuer den Einschraenkungsgrund: er verlaesst das System nicht
 * (ADR-0007 C4 Punkt 6). `anlass` sagt, ob eine Einschraenkung (Art. 18) oder
 * eine Loeschung (Art. 17) mitgeteilt wurde — mehr braucht der Empfaenger
 * nicht, und mehr bekommt er nicht.
 */
export class Art19MitteilungAnlegenDto {
  @IsUUID()
  einreichungId!: string;

  @IsIn(['endkunde', 'anschlussnutzer'])
  subjektTyp!: 'endkunde' | 'anschlussnutzer';

  @IsUUID()
  subjektId!: string;

  @IsIn(ART19_ANLAESSE)
  anlass!: Art19Anlass;

  @IsIn(UNTERRICHTUNG_KANAELE)
  kanal!: UnterrichtungKanal;
}
