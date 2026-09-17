import { Injectable } from '@nestjs/common';
import { isEinschraenkungGrundCode, type EinschraenkungGrundCode } from '../../nachweis/domain/paar-einschraenkung';
import { EnergyEinschraenkungFristRepository } from '../persistence/energy/energy-einschraenkung-frist.repository';
import {
  BEFRISTETE_EINSCHRAENKUNG_GRUENDE,
  EINSCHRAENKUNG_WIEDERVORLAGE_TAGE_DEFAULT,
} from './einschraenkung-frist.constants';

export interface EinschraenkungFristItem {
  readonly subjektTyp: 'endkunde' | 'anschlussnutzer';
  readonly subjektId: string;
  readonly endkundeId: string;
  readonly einschraenkungGrundCode: EinschraenkungGrundCode;
  readonly gesperrtSeit: string;
  readonly tageOffen: number;
  readonly ueberfaellig: boolean;
}

export interface EinschraenkungFristReport {
  readonly schwelleTage: number;
  readonly items: readonly EinschraenkungFristItem[];
  readonly ueberfaelligAnzahl: number;
}

/**
 * Wiedervorlage der befristeten Art.-18-Einschraenkungen (ADR-0007 A11.11).
 *
 * Der Report meldet, er ENTSCHEIDET nicht: eine ueberfaellige Einschraenkung
 * wird NICHT automatisch aufgehoben. Das waere aus zwei Gruenden falsch —
 * erstens verlangt Art. 18 Abs. 3 die Unterrichtung VOR der Aufhebung (ein
 * Automatismus koennte sie nicht leisten), zweitens ist der Wegfall des
 * Grundes eine fachliche Feststellung, keine Zeitfunktion. Die Liste macht
 * sichtbar, damit jemand hinsieht.
 *
 * Sie liefert BEWUSST alle offenen befristeten Einschraenkungen, nicht nur die
 * ueberfaelligen: eine Liste, die erst beim Ueberschreiten der Schwelle etwas
 * zeigt, laesst die Sachbearbeitung nie erkennen, was demnaechst faellig wird.
 * `ueberfaellig` markiert, `tageOffen` ordnet.
 */
@Injectable()
export class EinschraenkungFristService {
  constructor(private readonly fristRepository: EnergyEinschraenkungFristRepository) {}

  async report(schwelleTage: number = EINSCHRAENKUNG_WIEDERVORLAGE_TAGE_DEFAULT): Promise<EinschraenkungFristReport> {
    const zeilen = await this.fristRepository.findOffeneFristen(BEFRISTETE_EINSCHRAENKUNG_GRUENDE);

    const items = zeilen.flatMap((zeile) => {
      // Fail-closed gegen die geschlossene Liste: einen Code, den die
      // Anwendung nicht kennt, meldet dieser Report NICHT als befristet —
      // eine erfundene Frist waere schlimmer als eine fehlende Zeile. Der
      // Fall ist durch `ck_*_einschraenkung_grund_code` (V0024) und die
      // Repository-Parametrisierung strukturell ausgeschlossen; die Pruefung
      // haelt ihn ausgeschlossen, falls sich eines von beidem aendert.
      if (!isEinschraenkungGrundCode(zeile.einschraenkungGrundCode)) {
        return [];
      }

      return [
        {
          subjektTyp: zeile.subjektTyp,
          subjektId: zeile.subjektId,
          endkundeId: zeile.endkundeId,
          einschraenkungGrundCode: zeile.einschraenkungGrundCode,
          gesperrtSeit: zeile.gesperrtSeit,
          tageOffen: zeile.tageOffen,
          ueberfaellig: zeile.tageOffen >= schwelleTage,
        },
      ];
    });

    return {
      schwelleTage,
      items,
      ueberfaelligAnzahl: items.filter((item) => item.ueberfaellig).length,
    };
  }
}
