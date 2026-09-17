import { Injectable } from '@nestjs/common';
import { EnergyStandortRepository } from '../stammdaten/persistence/energy/energy-standort.repository';
import { MeasurementMesswertRepository } from './persistence/measurement-messwert.repository';
import type { VerbrauchAggregatZeile } from './persistence/measurement-messwert.repository';
import { nichtGefunden, ungueltigeEingabe } from '../stammdaten/common/problem.util';
import type { Aufloesung, VerbrauchAggregatAntwort } from './verbrauch-aggregat.types';

/** Type-Guard: filtert erkannte Lücken (`wert===null`) aus der Zeitreihe heraus — s. Klassen-Dok "Lücken nie als 0". */
function hatWert(zeile: VerbrauchAggregatZeile): zeile is VerbrauchAggregatZeile & { readonly wert: number } {
  return zeile.wert !== null;
}

export interface VerbrauchAggregatOptions {
  readonly von: string;
  readonly bis: string;
  readonly aufloesung: Aufloesung;
  readonly inklusiveUnterknoten?: boolean;
  readonly stichtag?: string;
}

/**
 * `GET /messwerte/standorte/{standortId}/verbrauch` (`read:verbrauch_aggregat`)
 * — aggregierter, PII-freier Verbrauch je Standortknoten. Orchestriert
 * AUSSCHLIESSLICH bereits vorhandene/neue Repositories:
 *
 *   1. `EnergyStandortRepository.findZaehlerUnterKnoten()` (ADR-0010 D6, Kern-
 *      Query "alle Zähler unter Knoten X zum Stichtag T") liefert die
 *      MENGE der einzubeziehenden Zähler.
 *   2. `MeasurementMesswertRepository.findVerbrauchAggregiert()` (NEU)
 *      differenziert/summiert deren Messkanäle je Zeit-Bucket und
 *      (`messgroesse`,`einheit`)-Gruppe.
 *
 * **v1-Vereinfachung "Zeitscheiben-Korrektheit über eine Periode" (bitte im
 * Review bestätigen):** `findZaehlerUnterKnoten()` ist eine
 * PUNKT-in-der-Zeit-Abfrage (EIN Stichtag), die aggregierte Route fragt
 * dagegen einen ZEITRAUM `[von, bis)` ab. Diese Methode löst das, wie vom
 * Arbeitsauftrag vorgegeben ("nutzt die bereits vorhandene Kern-Query"), MIT
 * GENAU EINEM Stichtag für die GESAMTE Periode auf — Default `stichtag=bis`
 * (Zähler-Bestand "wie er am Ende der Periode war"), NICHT eine
 * bucket-genaue Neuauflösung der Standort-Zugehörigkeit für jeden einzelnen
 * Zeit-Bucket. Ein Zähler, der WÄHREND `[von, bis)` umgezogen wurde, wird
 * damit für die GESAMTE Periode einheitlich (nicht) gezählt, je nachdem, wo
 * er zum gewählten Stichtag stand — ADR-0010 D3 nennt als Ziel-Beispiel
 * ausdrücklich "Verbrauch Gebäude B im Januar zählt den Zähler dort, wo er
 * im Januar hing", was bei einem Umzug MITTEN in der Periode strenggenommen
 * eine bucket-genaue Neuauflösung verlangen würde. Diese v1-Fassung liefert
 * das NICHT — offener Punkt für eine spätere Ausbaustufe (`database-lead`/
 * `technical-director`), s. finale Antwort.
 */
@Injectable()
export class VerbrauchAggregatService {
  constructor(
    private readonly standortRepository: EnergyStandortRepository,
    private readonly messwertRepository: MeasurementMesswertRepository,
  ) {}

  async aggregiertePeriode(standortId: string, options: VerbrauchAggregatOptions): Promise<VerbrauchAggregatAntwort> {
    const standort = await this.standortRepository.findById(standortId);
    if (standort === undefined) {
      throw nichtGefunden('Standort');
    }

    if (Date.parse(options.von) >= Date.parse(options.bis)) {
      throw ungueltigeEingabe('von muss zeitlich VOR bis liegen (halboffenes Intervall [von, bis)).');
    }

    const stichtag = options.stichtag ?? options.bis;
    const inklusiveUnterknoten = options.inklusiveUnterknoten ?? true;

    const zaehler = await this.standortRepository.findZaehlerUnterKnoten({
      knotenId: standortId,
      stichtag,
      inklusiveUnterknoten,
    });
    const zaehlerIds = zaehler.map((z) => z.id);

    const [zeilen, kanalBestand] = await Promise.all([
      this.messwertRepository.findVerbrauchAggregiert({
        zaehlerIds,
        von: options.von,
        bis: options.bis,
        aufloesung: options.aufloesung,
      }),
      this.messwertRepository.ermittleAktiveMesskanaele(zaehlerIds),
    ]);

    const zeitreihe = zeilen
      .filter(hatWert)
      .map((zeile) => ({
        zeitpunkt: zeile.zeitpunkt,
        messgroesse: zeile.messgroesse,
        einheit: zeile.einheit,
        wert: zeile.wert,
      }));
    const erkannteLuecken = zeilen.length - zeitreihe.length;

    return {
      zeitreihe,
      metadaten: {
        einbezogeneZaehler: zaehler.length,
        einbezogeneKanaele: kanalBestand.hauptmessungen,
        ausgelasseneUntermessungen: kanalBestand.untermessungen,
        erkannteLuecken,
      },
    };
  }
}
