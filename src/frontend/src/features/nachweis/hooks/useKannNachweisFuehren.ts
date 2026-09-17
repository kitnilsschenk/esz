import { useKannStammdatenAnlegen } from '../../stammdaten/hooks/shared/useKannStammdatenAnlegen';

/**
 * Trägt die aktuelle Sitzung die Rolle `betrieb`?
 *
 * Im Nachweis-Kontext entscheidet genau diese Rolle über ALLES Schreibende
 * (Förderjahr anlegen, Preflight ausführen, Einspar-Lauf starten, Export
 * erzeugen, Einreichung vermerken) UND zusätzlich über das LESEN des Exports:
 * `read:nachweis_export` ist die einzige Leseaktion des Nachweis-Kontexts,
 * die `compliance-auditor` ausdrücklich verwehrt bleibt — die Einreichungs-
 * Metadaten dagegen sind sein Prüfgegenstand und bleiben ihm zugänglich.
 *
 * Delegiert an die bestehende Sitzungs-Abfrage, statt sie nachzubauen; der
 * eigene Name steht hier, weil „Stammdaten anlegen" die Bedeutung an diesen
 * Stellen nicht trifft. Wie dort gilt: Das ist reine Anzeige-Politur, KEINE
 * Autorisierungsentscheidung — durchgesetzt wird sie ausschließlich vom
 * Server.
 */
export function useKannNachweisFuehren(): boolean {
  return useKannStammdatenAnlegen();
}
