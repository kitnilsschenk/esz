import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import {
  EINSCHRAENKUNG_GRUND_CODES,
  type EinschraenkungGrundCode,
} from '../../../nachweis/domain/paar-einschraenkung';

/**
 * `components/schemas/EndkundeSperren` (stammdaten.openapi.yaml) —
 * `POST /stammdaten/endkunden/{endkundeId}/sperren`, ADR-0007 A11.1.
 *
 * Der Grund ist PFLICHT, ohne Ausnahme, und stammt aus der geschlossenen
 * Liste des Art. 18 Abs. 1. Begruendung (compliance-director, 2026-08-26):
 *
 * 1. Art. 18 Abs. 2 ist ohne den Grund nicht anwendbar — welcher der vier
 *    abschliessenden Erlaubnistatbestaende die Uebermittlung traegt, haengt
 *    am Sperrgrund (ADR-0007 C4 Punkt 4). Ohne Grund muss fail-closed
 *    ausgeschlossen werden, was die betroffene Person SCHLECHTER stellt: sie
 *    verliert den Ausweis im Nachweis, obwohl bei 1a/1c der Ausweis MIT
 *    Kennzeichnung der richtige Weg waere. Der Grund ist das ermoeglichende
 *    Datum, nicht Buerokratie.
 * 2. Die Tatbestaende 1a und 1d sind ihrem Wortlaut nach BEFRISTET. Ohne
 *    Grund ist das Fristende nicht bestimmbar und die Einschraenkung wird
 *    versehentlich dauerhaft (Art. 5 Abs. 1 lit. e).
 * 3. Art. 5 Abs. 2 — ein Statusfeld `gesperrt` ohne Grund ist ein Nachweis,
 *    der nichts nachweist.
 *
 * KEIN Default, KEIN optionaler Parameter und ausdruecklich KEIN fuenfter
 * Auffangcode („sonstiges"): ein solcher waere binnen Wochen der Sammeleimer
 * und stellte ueber die Hintertuer genau den Pauschal-Blocker wieder her, den
 * Auflage A11 beseitigt hat.
 *
 * ABGRENZUNG: Verarbeitungsstopps, die KEINE Art.-18-Faelle sind —
 * Einwilligungswiderruf (Art. 7 Abs. 3, im System separat ueber
 * `consent_status` modelliert), betrieblicher Legal-Hold, Incident-bedingtes
 * Einfrieren — duerfen NICHT ueber diesen Pfad laufen. Sie braeuchten einen
 * eigenstaendig benannten Mechanismus mit eigener Rechtsgrundlage und eigenem
 * RVT-Eintrag. `sperren()` ist ein Art.-18-Vorgang, Punkt.
 *
 * Rechtsgrundlage fuer das SPEICHERN des Grundes ist Art. 6 Abs. 1 lit. c
 * (Erfuellung der rechtlichen Verpflichtung aus Art. 18/Art. 12) i. V. m.
 * Art. 5 Abs. 2 — nicht Art. 18 selbst, der die Pflicht begruendet, nicht die
 * Erlaubnis.
 *
 * `gesperrtSeit` ist BEWUSST kein Feld dieses DTO: der Zeitpunkt wird
 * serverseitig gesetzt (A11.3), damit er nicht rueckdatiert werden kann. Ein
 * abweichendes Antragseingangsdatum gehoert in die Vorgangsakte.
 */
export class EndkundeSperrenDto {
  @IsIn(EINSCHRAENKUNG_GRUND_CODES)
  grund!: EinschraenkungGrundCode;

  /**
   * Auflage C-8 (ADR-0012 Stufe C) — bei Sperrgrund Art. 18 Abs. 1 lit. b
   * oder lit. d PFLICHT, bei lit. a und lit. c UNZULAESSIG. Beide Regeln
   * setzt `pruefeNeuerhebungsEntscheidung()` durch, nicht dieses DTO: sie
   * haengen am Wert eines ANDEREN Feldes, und die Fehlermeldung soll den
   * fachlichen Grund nennen statt eines Schema-Verstosses.
   *
   * `true` = die Messdaten-Erhebung laeuft trotz der Einschraenkung weiter,
   * `false` = das Ingest-Gate liefert fuer die Zaehler dieses Subjekts ab
   * sofort `false` und Uplinks werden verworfen. Die Entscheidung ist keine
   * Voreinstellung, die man nachjustiert — sie erzeugt oder verhindert eine
   * Messluecke, die sich nachtraeglich nicht schliessen laesst.
   */
  @IsOptional()
  @IsBoolean()
  neuerhebungFortsetzen?: boolean;
}
