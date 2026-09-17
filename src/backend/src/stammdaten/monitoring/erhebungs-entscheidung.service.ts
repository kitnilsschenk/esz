import { Injectable } from '@nestjs/common';
import { isEinschraenkungGrundCode, type EinschraenkungGrundCode } from '../../nachweis/domain/paar-einschraenkung';
import { GRUENDE_MIT_NEUERHEBUNGSFRAGE } from '../common/sperr-entscheidung.util';
import { EnergyEinschraenkungFristRepository } from '../persistence/energy/energy-einschraenkung-frist.repository';

export type ErhebungsLage = 'entscheidung_offen' | 'erhebung_gestoppt' | 'erhebung_laeuft';

export interface ErhebungsEntscheidungItem {
  readonly subjektTyp: 'endkunde' | 'anschlussnutzer';
  readonly subjektId: string;
  readonly endkundeId: string;
  readonly einschraenkungGrundCode: EinschraenkungGrundCode;
  readonly gesperrtSeit: string;
  readonly tageOffen: number;
  readonly lage: ErhebungsLage;
}

export interface ErhebungsEntscheidungReport {
  readonly items: readonly ErhebungsEntscheidungItem[];
  /** Sperren mit lit. b / lit. d, bei denen niemand entschieden hat. */
  readonly entscheidungOffenAnzahl: number;
  /** Sperren, bei denen die Messung ausdruecklich gestoppt wurde. */
  readonly erhebungGestopptAnzahl: number;
}

/**
 * Auflage C-8 — die Entscheidungen ueber die WEITERE ERHEBUNG sichtbar
 * machen (ADR-0012 Stufe C, Behandlungsschritt aus `risk-register/R-0008`).
 *
 * Zwei Zustaende brauchen Aufmerksamkeit, aus entgegengesetzten Gruenden:
 *
 *   `entscheidung_offen`  Eine Sperre mit Grund lit. b oder lit. d, bei der
 *                         die Spalte `neuerhebung_fortsetzen` leer ist. Das
 *                         sind Bestandszeilen aus der Zeit vor V0087 — die
 *                         Migration hat sie bewusst NICHT nachtraeglich
 *                         entschieden (der CHECK ist deshalb `NOT VALID`),
 *                         weil eine Entscheidung, die niemand getroffen hat,
 *                         auch keine Migration erfinden darf. Fachlich ist
 *                         das der schlechteste Zustand: Das Gate misst
 *                         weiter, und niemand hat das je so beschlossen.
 *
 *   `erhebung_gestoppt`   Es wurde ausdruecklich entschieden, NICHT weiter zu
 *                         erheben. Eine korrekte, dokumentierte Lage — aber
 *                         eine, die niemand von selbst beendet. Jeder Tag
 *                         erzeugt eine Messluecke, die sich nicht nachfuellen
 *                         laesst. Faellt der Sperrgrund weg, ohne dass
 *                         jemand hinsieht, laeuft der Stopp weiter.
 *
 * `erhebung_laeuft` ist mit aufgefuehrt, aber nicht gezaehlt: Es ist der
 * unauffaellige Fall. Er steht in der Liste, damit erkennbar bleibt, wie
 * viele Vorgaenge insgesamt unter dieser Frage stehen — eine Liste, die nur
 * Auffaelliges zeigt, laesst die Bezugsgroesse offen.
 *
 * Der Report MELDET, er entscheidet nicht — dieselbe Linie wie bei der
 * Fristenueberwachung (`EinschraenkungFristService`): Weder das Nachtragen
 * einer Entscheidung noch das Wiederaufnehmen der Messung darf automatisch
 * geschehen. Beides sind fachliche Feststellungen mit Rechtsfolge.
 */
@Injectable()
export class ErhebungsEntscheidungService {
  constructor(private readonly fristRepository: EnergyEinschraenkungFristRepository) {}

  async report(): Promise<ErhebungsEntscheidungReport> {
    const zeilen = await this.fristRepository.findErhebungsEntscheidungen(GRUENDE_MIT_NEUERHEBUNGSFRAGE);

    const items = zeilen.flatMap((zeile): ErhebungsEntscheidungItem[] => {
      // Fail-closed gegen die geschlossene Liste — dieselbe Begruendung wie
      // in `EinschraenkungFristService`: lieber eine fehlende Zeile als eine
      // Zeile mit erfundenem Grund.
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
          lage: lageAus(zeile.neuerhebungFortsetzen),
        },
      ];
    });

    return {
      items,
      entscheidungOffenAnzahl: items.filter((item) => item.lage === 'entscheidung_offen').length,
      erhebungGestopptAnzahl: items.filter((item) => item.lage === 'erhebung_gestoppt').length,
    };
  }
}

/**
 * `null` heisst „nicht entschieden", NICHT „entschieden, nicht zu erheben".
 * Die Unterscheidung ist der ganze Punkt dieses Reports — sie im Mapping zu
 * verwischen waere derselbe Fehler, den die Spalte ohne Default vermeidet.
 */
function lageAus(neuerhebungFortsetzen: boolean | null): ErhebungsLage {
  if (neuerhebungFortsetzen === null) {
    return 'entscheidung_offen';
  }
  return neuerhebungFortsetzen ? 'erhebung_laeuft' : 'erhebung_gestoppt';
}
