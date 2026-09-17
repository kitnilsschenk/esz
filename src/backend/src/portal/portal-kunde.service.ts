import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Propagation, Transactional } from '@nestjs-cls/transactional';
import { NutzerinformationService } from '../nutzerinfo/nutzerinformation.service';
import { NutzerinfoDokumentService } from '../nutzerinfo/dokument/nutzerinfo-dokument.service';
import type { NutzerinfoBericht, NutzerinformationItem } from '../nutzerinfo/nutzerinfo.types';
import { WiderspruchService } from '../consent/widerspruch.service';
import type { DigitaleErklaerung } from '../consent/widerspruch.service';
import type { WiderspruchItem } from '../consent/consent.types';

/**
 * Der Zweck, gegen den ein Endkunde im Portal widerspricht.
 *
 * `nutzerinformation` ist laut Zweck-Matrix `opt_out` für Endkunden — genau
 * die Verarbeitung, die [Q3] Kap. 6 mit einem Opt-out versieht. Gegen die
 * übrigen Zwecke widerspricht man nicht: `messdaten_verarbeitung` ist
 * vertraglich, der Rest läuft auf Einwilligung, und dagegen widerruft man
 * (Art. 7 Abs. 3).
 */
export const PORTAL_WIDERSPRUCH_ZWECK = 'nutzerinformation';

/** Wie viele Monate der Verlauf zeigt — zwei Jahre. */
const VERLAUF_MONATE = 24;

/**
 * EINE Meldung für „gibt es nicht" und „gehört Ihnen nicht".
 *
 * Zwei verschiedene wären dieselbe Auskunft wie zwei verschiedene
 * Statuscodes, nur ausgeschrieben.
 */
const FREMDE_INFORMATION = 'Diese Information gehört nicht zu Ihrem Zugang.';

export interface PortalWiderspruchStand {
  readonly zweckCode: string;
  readonly wirksam: boolean;
  readonly erklaertAt: string | null;
  /** Nur gesetzt, wenn ein wirksamer Widerspruch besteht — für die Rücknahme. */
  readonly widerspruchId: string | null;
}

/**
 * Alles, was ein angemeldeter Endkunde über sich sehen und tun darf.
 *
 * **Jede Methode nimmt die Endkunden-Kennung als ERSTES Argument — aus der
 * Sitzung, nie aus dem Request.** Der Controller reicht sie aus
 * `requirePortalKunde()` durch; es gibt keinen Weg, sie von außen zu setzen.
 * Wo eine Kennung aus dem Pfad kommt (die Nummer einer Monatsinformation),
 * wird die Zugehörigkeit hier geprüft, bevor irgendetwas herausgeht: Sonst
 * wäre der Blick in fremde Verbrauchsdaten eine Frage der URL.
 *
 * **Der Dienst rechnet nichts und rendert nichts selbst.** Er ruft dieselben
 * Dienste, die auch der Betrieb benutzt — sonst sähe der Kunde am Ende andere
 * Zahlen als die Bewilligungsbehörde, und jede Erklärung dafür wäre
 * schlechter als der Fehler.
 */
@Injectable()
export class PortalKundeService {
  constructor(
    private readonly nutzerinfoService: NutzerinformationService,
    private readonly dokumentService: NutzerinfoDokumentService,
    private readonly widerspruchService: WiderspruchService,
  ) {}

  /** Der Verlauf der eigenen Monatsinformationen. */
  @Transactional(Propagation.Required)
  async informationen(endkundeId: string): Promise<readonly NutzerinformationItem[]> {
    return this.nutzerinfoService.findeFuerEndkunde(endkundeId, VERLAUF_MONATE);
  }

  @Transactional(Propagation.Required)
  async bericht(endkundeId: string, informationId: string): Promise<NutzerinfoBericht> {
    // Zugehoerigkeit ZUERST — und ueber `pruefeEigene`, damit eine
    // nicht existierende Information dieselbe Antwort bekommt wie eine
    // fremde (s. dort).
    await this.pruefeEigene(endkundeId, informationId);
    return this.nutzerinfoService.bericht(informationId);
  }

  /** Dasselbe Dokument, das auch per Post ginge. */
  @Transactional(Propagation.Required)
  async dokument(endkundeId: string, informationId: string): Promise<string> {
    // Zugehoerigkeit ZUERST: `einzeln()` wuerde sonst schon rendern, bevor
    // feststeht, ob die Information ueberhaupt diesem Kunden gehoert.
    await this.pruefeEigene(endkundeId, informationId);
    return (await this.dokumentService.einzeln(informationId)).html;
  }

  /** Der Stand des Opt-outs — die Grundlage für den Schalter im Portal. */
  @Transactional(Propagation.Required)
  async widerspruchStand(endkundeId: string): Promise<PortalWiderspruchStand> {
    const wirksamer = await this.findeWirksamen(endkundeId);
    return {
      zweckCode: PORTAL_WIDERSPRUCH_ZWECK,
      wirksam: wirksamer !== undefined,
      erklaertAt: wirksamer?.erklaertAt ?? null,
      widerspruchId: wirksamer?.id ?? null,
    };
  }

  /**
   * Der Widerspruch gegen die monatliche Nutzerinformation — das digitale
   * Opt-out, das [Q3] Kap. 6 verlangt.
   *
   * Der Erklärungszeitpunkt ist JETZT und nicht wählbar: Hier trägt niemand
   * etwas nach, die betroffene Person erklärt in diesem Augenblick selbst.
   */
  @Transactional(Propagation.Required)
  async widersprich(endkundeId: string, digital: DigitaleErklaerung): Promise<PortalWiderspruchStand> {
    await this.widerspruchService.erklaereDigital(
      {
        subjektTyp: 'endkunde',
        subjektId: endkundeId,
        zweckCode: PORTAL_WIDERSPRUCH_ZWECK,
        erklaertAt: new Date().toISOString(),
      },
      digital,
    );
    return this.widerspruchStand(endkundeId);
  }

  /**
   * Nimmt den Widerspruch zurück — der Kunde will wieder informiert werden.
   *
   * Die Zeile bleibt erhalten; gelöscht verschwände der Nachweis über den
   * Zeitraum, in dem widersprochen war, und genau der entscheidet, ob in
   * dieser Zeit informiert werden durfte.
   */
  @Transactional(Propagation.Required)
  async nimmWiderspruchZurueck(endkundeId: string, digital: DigitaleErklaerung): Promise<PortalWiderspruchStand> {
    const wirksamer = await this.findeWirksamen(endkundeId);
    if (wirksamer === undefined) {
      // Kein stiller Erfolg: Wer glaubt, einen Widerspruch zurueckzunehmen,
      // den es nicht gibt, hat eine falsche Vorstellung vom Zustand.
      throw new ForbiddenException('Es besteht kein wirksamer Widerspruch, der zurückgenommen werden könnte.');
    }
    await this.widerspruchService.nimmZurueckDigital(wirksamer.id, endkundeId, digital);
    return this.widerspruchStand(endkundeId);
  }

  private async findeWirksamen(endkundeId: string): Promise<WiderspruchItem | undefined> {
    const alle = await this.widerspruchService.findeFuerSubjekt('endkunde', endkundeId);
    return alle.find((w) => w.zweckCode === PORTAL_WIDERSPRUCH_ZWECK && w.wirksam);
  }

  /**
   * Fail-closed: Eine Information, die nicht diesem Zugang gehört, wird
   * abgewiesen — OHNE zu verraten, ob es sie überhaupt gibt.
   *
   * **`403` in BEIDEN Fällen, auch für eine nicht existierende Kennung.**
   * Das ist der ganze Punkt: Antwortete das Portal auf eine unbekannte
   * Kennung mit 404 und auf eine fremde mit 403, wäre der Statuscode selbst
   * die Auskunft — wer Kennungen durchprobiert, erführe an genau diesem
   * Unterschied, welche existieren. Dieselbe Überlegung wie bei der
   * einheitlichen Anmeldemeldung.
   *
   * Deshalb wird der `NotFoundException` des Fachdienstes hier bewusst
   * gefangen und in dieselbe Antwort überführt.
   */
  private async pruefeEigene(endkundeId: string, informationId: string): Promise<void> {
    let information: NutzerinformationItem;
    try {
      information = await this.nutzerinfoService.findeById(informationId);
    } catch (fehler) {
      if (fehler instanceof NotFoundException) {
        throw new ForbiddenException(FREMDE_INFORMATION);
      }
      throw fehler;
    }

    if (information.endkundeId !== endkundeId) {
      throw new ForbiddenException(FREMDE_INFORMATION);
    }
  }
}
