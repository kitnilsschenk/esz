import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import { Propagation, Transactional } from '@nestjs-cls/transactional';
import { istQuellenvermerkPlatzhalter } from '../../berechnung/klima/dwd-quellenvermerk.const';
import { ProblemDetailsException } from '../../common/exceptions/problem-details.exception';
// Direkter Dateiimport statt `PortalModule`-Import — dasselbe etablierte
// Muster wie bei `SyntheticOnlyConfigService`/`AnalyticsLaufLookupRepository`
// (s. `NutzerinfoModule`-Dok.): `PortalConfigService` ist ein zustandsloser
// Env-Leser ohne eigene Abhängigkeiten, und ein Modul-Import brächte die
// gesamte Portal-Provider-Oberfläche (Controller, Guards, Repositories) mit,
// für die dieser Dienst keine Verwendung hat. Kein Zirkelbezug: `PortalModule`
// importiert `NutzerinfoModule`, nicht umgekehrt — dieser Import geht am
// Modul vorbei direkt auf die Klasse.
import { PortalConfigService } from '../../portal/portal.config';
import { NutzerinfoRepository } from '../persistence/nutzerinfo.repository';
import { NutzerinformationService } from '../nutzerinformation.service';
import { rendereNutzerinfoDokument, type DokumentSeite } from './nutzerinfo-dokument.renderer';

const MONAT_FORM = /^\d{4}-\d{2}-01$/;

/** Ein fertiges Dokument samt Dateiname — das, was die Route ausliefert. */
export interface NutzerinfoDokument {
  readonly dateiname: string;
  readonly html: string;
  /** Anzahl enthaltener Informationen (1 beim Einzeldokument). */
  readonly anzahl: number;
}

/**
 * Erzeugt die Dokumente der monatlichen Nutzerinformation — den Gegenstand,
 * der den Endkunden erreicht.
 *
 * **Warum es diesen Dienst gibt.** V0054 hält den Befund selbst fest:
 * „Erzeugen ist nicht informieren." Bis hierher konnte das System die Zahlen
 * rechnen, einfrieren und hashen; es gab nur keinen Gegenstand, den man
 * jemandem hätte geben können. `vermerkeZustellung()` trug einen Versand
 * NACH, der außerhalb stattgefunden haben musste — womit die Auflage
 * praktisch nur erfüllbar war, indem jemand die Zahlen von Hand abschrieb.
 *
 * Der Dienst rechnet nichts. Er stellt zusammen, was der Bericht ohnehin
 * liefert, und ergänzt die eine Angabe, die der Bericht nicht kennt: ob in
 * den zugrunde liegenden Berechnungslauf echte DWD-Klimadaten eingegangen
 * sind (Auflage A-2 — der Quellenvermerk gehört auf jede kundengerichtete
 * Ausgabe bereinigter Werte, aber NUR dann).
 */
@Injectable()
export class NutzerinfoDokumentService {
  constructor(
    private readonly repository: NutzerinfoRepository,
    private readonly service: NutzerinformationService,
    private readonly portalConfig: PortalConfigService,
  ) {}

  /** Das Dokument zu EINER Information. */
  @Transactional(Propagation.Required)
  async einzeln(id: string): Promise<NutzerinfoDokument> {
    const bericht = await this.service.bericht(id);
    const mitDwd = await this.repository.findLaeufeMitDwdKlima([bericht.information.berechnungslaufId]);
    const seite: DokumentSeite = { bericht, klimaAusDwd: mitDwd.has(bericht.information.berechnungslaufId) };
    this.pruefeQuellenvermerk([seite]);

    return {
      dateiname: `energieinformation_${bericht.information.monat.slice(0, 7)}_${bericht.information.id}.html`,
      html: rendereNutzerinfoDokument([seite], null, this.portalConfig.portalUrl),
      anzahl: 1,
    };
  }

  /**
   * Die Versandmappe eines Monats — alle Informationen, eine je Seite.
   *
   * Bewusst ALLE, nicht nur die unzugestellten: die Mappe ist auch der
   * Beleg, was in diesem Monat hinausgegangen ist. Wer sie ein zweites Mal
   * erzeugt, bekommt dasselbe Dokument (die Zahlen sind eingefroren) — genau
   * das macht sie als Nachweis brauchbar.
   */
  @Transactional(Propagation.Required)
  async monatsmappe(monat: string): Promise<NutzerinfoDokument> {
    if (!MONAT_FORM.test(monat)) {
      throw new BadRequestException('monat muss ein Monatserster in der Form YYYY-MM-01 sein.');
    }

    const informationen = await this.repository.findByMonat(monat);
    if (informationen.length === 0) {
      throw new BadRequestException(
        `Für ${monat} ist keine Nutzerinformation erzeugt. Erst den Erzeugungslauf ausführen, dann die Mappe drucken.`,
      );
    }

    const mitDwd = await this.repository.findLaeufeMitDwdKlima(
      informationen.map((information) => information.berechnungslaufId),
    );

    // Die Berichte werden NACHEINANDER geholt: jeder zieht Gruppen- und
    // Vormonatsabfragen nach, und eine Mappe über tausend Kunden würde
    // parallel die Verbindung fluten. Der Druck ist kein Anzeigepfad.
    const seiten: DokumentSeite[] = [];
    for (const information of informationen) {
      const bericht = await this.service.bericht(information.id);
      seiten.push({ bericht, klimaAusDwd: mitDwd.has(information.berechnungslaufId) });
    }
    this.pruefeQuellenvermerk(seiten);

    return {
      dateiname: `energieinformationen_${monat.slice(0, 7)}.html`,
      html: rendereNutzerinfoDokument(seiten, monat, this.portalConfig.portalUrl),
      anzahl: seiten.length,
    };
  }

  /**
   * Fail-closed vor der Ausgabe: Kein Kundendokument mit DWD-abgeleiteten
   * Werten, solange der Quellenvermerk noch der Platzhalter ist (Auflage
   * A-1).
   *
   * **Warum das hier stehen muss und FJ-08 nicht genügt.** FJ-08 blockt den
   * FÖRDERJAHR-Preflight und damit den Nachweis an die Bewilligungsbehörde.
   * Das Kundendokument geht an dieser Prüfung vorbei — es hängt an keinem
   * Preflight und an keinem Einsparlauf. Ohne diesen Riegel würde die erste
   * Instanz mit `EDMS_KLIMA_QUELLE=dwd` Briefe erzeugen, in deren Fußzeile
   * wörtlich „PLATZHALTER" steht. Das wäre schlimmer als gar kein Vermerk:
   * Er behauptet eine Quelle und verrät im selben Satz, dass die Behauptung
   * nicht abgenommen ist.
   *
   * Der Riegel greift NUR, wenn tatsächlich DWD-Werte eingegangen sind. Bei
   * synthetischem Klima trägt das Dokument ohnehin keinen Vermerk (A20) und
   * lässt sich unverändert erzeugen — der heutige Dev-/Testbetrieb ist also
   * nicht betroffen.
   */
  private pruefeQuellenvermerk(seiten: readonly DokumentSeite[]): void {
    if (!seiten.some((seite) => seite.klimaAusDwd) || !istQuellenvermerkPlatzhalter()) {
      return;
    }
    throw new ProblemDetailsException({
      status: HttpStatus.CONFLICT,
      title: 'Conflict',
      detail:
        'Das Kundendokument enthaelt witterungsbereinigte Werte aus echten DWD-Klimadaten, aber der ' +
        'Quellenvermerk ist noch der Platzhalter (Auflage A-1, docs/datenquellen.md DQ-001). Ein Brief mit ' +
        'diesem Text waere eine unbelegte Quellenangabe. Erst den woertlichen DWD-Vermerk hinterlegen ' +
        '(compliance-director-Votum), dann erzeugen.',
    });
  }
}
