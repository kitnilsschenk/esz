import { IsIn } from 'class-validator';
import {
  UNTERRICHTUNG_KANAELE,
  type UnterrichtungKanal,
} from '../persistence/energy/energy-einschraenkung-unterrichtung.repository';

/**
 * `components/schemas/EinschraenkungUnterrichtung` — Body von
 * `POST .../{id}/einschraenkung-unterrichtung` (Art. 18 Abs. 3 DSGVO,
 * ADR-0007 A11.10). Geteilt von Endkunde und Anschlussnutzer: der Vorgang ist
 * fuer beide identisch, und die geschlossene Kanal-Liste soll es bleiben.
 *
 * `kanal` ist eine geschlossene Liste und ausdruecklich KEIN Freitext — ein
 * Freitextfeld wuerde binnen Wochen Kontaktdaten enthalten („Mail an …") und
 * damit PII in eine Tabelle und ein Audit-Log tragen, die beide bewusst keine
 * fuehren.
 *
 * Kein Feld fuer den Zeitpunkt und keines fuer den Ausfuehrenden: beides wird
 * serverseitig gesetzt (`now()` bzw. der authentifizierte Principal) — sonst
 * waere der Nachweis rueckdatierbar bzw. einem Dritten zuschreibbar, und
 * genau das soll er belegen.
 */
export class EinschraenkungUnterrichtungDto {
  @IsIn(UNTERRICHTUNG_KANAELE)
  kanal!: UnterrichtungKanal;
}
