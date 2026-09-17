import type { BetriebsStatus, Energietraeger } from '../persistence/energy/energy-zaehler.repository';
import type { GeraetZuordnungStatus } from '../persistence/device/device-geraet-zuordnung.repository';

/**
 * Anzeige-Ausschnitt der aktiven Geraete-Zuordnung eines Zaehlers
 * (ADR-0011 D7). Enthaelt WEDER DevEUI NOCH Blind-Index — nur den
 * Lebenszyklus-Zustand (RL-2, O4 Design-Prinzip 1). `zaehlerId` fehlt: sie
 * ist der Zaehler, an dem dieses Objekt haengt.
 */
export interface GeraetAnbindung {
  readonly id: string;
  readonly status: GeraetZuordnungStatus;
  readonly gueltigVon: string;
  readonly gueltigBis: string | null;
  readonly pepperVersion: number;
}

export interface ZaehlerListItem {
  readonly id: string;
  readonly systemId: string;
  /**
   * Name des Systems, an dem der Zähler hängt.
   *
   * Ohne ihn stand in der Liste „System 77a6c17f" — eine Kennung, die man
   * erst nachschlagen muss. Kein Personenbezug: dieselbe Angabe steht in der
   * globalen Systemliste ohnehin sichtbar.
   */
  readonly systemBezeichnung: string;
  readonly energietraeger: Energietraeger;
  readonly status: BetriebsStatus;
  readonly createdAt: string;
  /**
   * `true`, wenn dem Zähler derzeit ein Gerät aktiv zugeordnet ist.
   *
   * Sagt DASS, nicht welches: DevEUI und Blind-Index verlassen den
   * Ingest-Pfad nicht (§26.6). Ohne diese Angabe beantwortete die Übersicht
   * nicht, welche Zähler überhaupt an etwas hängen — die Auskunft stand nur
   * auf der Detailseite, also ein Klick je Zähler.
   */
  readonly angebunden: boolean;
  /**
   * Jüngster Empfangszeitpunkt über alle Kanäle des Zählers; `null` = noch nie
   * etwas empfangen. Betriebs-Metadatum, kein Messwert.
   */
  readonly letzteUebertragung: string | null;
}

export interface ZaehlerDetail {
  readonly id: string;
  readonly systemId: string;
  readonly geraetetyp: string;
  readonly energietraeger: Energietraeger;
  readonly status: BetriebsStatus;
  /** `null` = derzeit keine aktive Geraete-Zuordnung (ADR-0011 D7). Keine Historie. */
  readonly geraetAnbindung: GeraetAnbindung | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}
