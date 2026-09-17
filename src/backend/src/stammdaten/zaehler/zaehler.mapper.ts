import type { Zaehler, ZaehlerMitBetrieb } from '../persistence/energy/energy-zaehler.repository';
import type { GeraetZuordnung } from '../persistence/device/device-geraet-zuordnung.repository';
import type { GeraetAnbindung, ZaehlerDetail, ZaehlerListItem } from './zaehler.types';

/**
 * Reduziert eine Geraete-Zuordnung auf den Anzeige-Ausschnitt (ADR-0011 D7).
 * Die verschluesselte DevEUI (`deveuiEnc`), der Blind-Index und die
 * `cryptoKeyId` bleiben AUSDRUECKLICH draussen — sie verlassen die
 * Persistenzschicht nur ueber die break-glass-gehaertete Reverse-Aufloesung
 * (ADR-0005 §26.4 SEC-5).
 */
function mapGeraetAnbindung(zuordnung: GeraetZuordnung): GeraetAnbindung {
  return {
    id: zuordnung.id,
    status: zuordnung.status,
    gueltigVon: zuordnung.gueltigVon,
    gueltigBis: zuordnung.gueltigBis,
    pepperVersion: zuordnung.pepperVersion,
  };
}

export function mapZaehlerListItem(zaehler: ZaehlerMitBetrieb): ZaehlerListItem {
  return {
    id: zaehler.id,
    systemId: zaehler.systemId,
    systemBezeichnung: zaehler.systemBezeichnung,
    energietraeger: zaehler.energietraeger,
    status: zaehler.status,
    createdAt: zaehler.createdAt,
    angebunden: zaehler.angebunden,
    letzteUebertragung: zaehler.letzteUebertragung,
  };
}

/**
 * `anbindung` ist ein PFLICHT-Parameter, kein optionaler: Wer einen
 * `ZaehlerDetail` baut, soll sich entscheiden muessen, ob er die Zuordnung
 * geladen hat. Ein Default `undefined` haette an einer vergessenen Stelle
 * stillschweigend „nicht angebunden" behauptet — und das ist im Ingest-Kontext
 * eine Falschaussage mit Folgen.
 */
export function mapZaehlerDetail(zaehler: Zaehler, anbindung: GeraetZuordnung | undefined): ZaehlerDetail {
  return {
    id: zaehler.id,
    systemId: zaehler.systemId,
    geraetetyp: zaehler.geraetetyp,
    energietraeger: zaehler.energietraeger,
    status: zaehler.status,
    geraetAnbindung: anbindung !== undefined ? mapGeraetAnbindung(anbindung) : null,
    createdAt: zaehler.createdAt,
    updatedAt: zaehler.updatedAt,
  };
}
