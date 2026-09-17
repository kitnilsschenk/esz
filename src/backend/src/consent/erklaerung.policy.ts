import { BadRequestException } from '@nestjs/common';
import type { Erfassungsweg } from './consent.types';

/**
 * Was für JEDE Erklärung einer betroffenen Person gilt — für die
 * Einwilligung (ADR-0012 B1) wie für den Widerspruch (AW-27).
 *
 * Diese Regeln standen bis 2026-09-07 im `EinwilligungService`. Sie liegen
 * jetzt hier, weil der Widerspruch dieselben braucht: Zwei Kopien wären
 * früher oder später auseinandergelaufen, und zwar an der Stelle, an der es
 * am teuersten ist — bei der Frage, welcher Erfassungsweg einen Nachweis
 * trägt.
 */

/**
 * Erfassungswege, die über die BETRIEBS-API zulässig sind.
 *
 * **`digital_opt_in` fehlt hier mit Absicht.** DS-03 verlangt bei einer
 * digitalen Erklärung die IP der erklärenden Person. In der Betriebssicht
 * handelt aber nicht die betroffene Person, sondern ein Mitarbeiter, der eine
 * anderswo (auf Papier, am Telefon) abgegebene Erklärung nachträgt. Die
 * einzige IP, die dort verfügbar wäre, ist seine — sie als IP der betroffenen
 * Person zu protokollieren, wäre eine **Fälschung des Nachweises**: Der Beleg
 * behauptete einen digitalen Vorgang, den es nie gab, an einer Adresse, die
 * nichts mit der Person zu tun hat.
 *
 * `digital_opt_in` entsteht erst im Nutzerportal (ADR-0012 Stufe D), wo die
 * betroffene Person selbst handelt.
 */
export const BETRIEBLICHE_ERFASSUNGSWEGE: readonly Erfassungsweg[] = [
  'vertrag_schriftlich',
  'uebernahme_altbestand',
];

/**
 * Erfassungswege, die STRUKTURELL vorgesehen, derzeit aber gesperrt sind
 * (Votum 2026-09-07, Auflage AW-20).
 *
 * `uebernahme_altbestand` bildet die Übernahme aus einem Alt- oder
 * Fremdsystem ab. Auf die Frage nach Altkunden ohne belegbare Einwilligung
 * (Fragenkatalog C2) hat der User am 2026-09-07 geantwortet: **„Gibt es
 * nicht."**
 *
 * Daraus folgt die Sperre, und zwar in beide Richtungen: Stimmt die Antwort,
 * kostet sie nichts. Stimmt sie nicht, verhindert sie den schwersten
 * denkbaren Fehler in diesem Modul — eine dokumentierte Erklärung ohne
 * Beleg. Ein erfundener Nachweis ist schlimmer als ein fehlender, weil er die
 * Prüfung besteht.
 *
 * Der Weg bleibt im SCHEMA (V0044/V0052). Ihn dort zu entfernen hiesse, ihn
 * bei der ersten echten Altdatenübernahme wieder einzubauen. Gesperrt wird an
 * der Stelle, an der er benutzt würde.
 */
export const GESPERRTE_ERFASSUNGSWEGE: readonly Erfassungsweg[] = ['uebernahme_altbestand'];

/** Wortlaut der Sperre — an allen Stellen derselbe, damit er nicht auseinanderläuft. */
export const GESPERRT_MELDUNG =
  'Der Erfassungsweg "uebernahme_altbestand" ist gesperrt. Nach der Feststellung der ' +
  'Geschaeftsfuehrung vom 2026-09-07 gibt es keinen Altbestand zu uebernehmen (Fragenkatalog C2); ' +
  'eine auf diesem Weg erfasste Erklaerung waere daher ein Nachweis ohne zugrundeliegenden ' +
  'Vorgang. Soll doch uebernommen werden, ist das eine eigene, vorab zu pruefende Entscheidung ' +
  '(Votum 2026-09-07, AW-20). Eine schriftlich abgegebene Erklaerung wird als ' +
  '"vertrag_schriftlich" erfasst.';

/**
 * Prüft, ob über die Betriebs-API auf diesem Weg erfasst werden darf.
 *
 * @param digitalMeldung Der Text für den `digital_opt_in`-Fall — er
 *   unterscheidet sich je nach Vorgang (Erteilen, Widerrufen, Widersprechen)
 *   und gehört deshalb zum Aufrufer, nicht hierher.
 */
export function pruefeErfassungsweg(erfassungsweg: Erfassungsweg, digitalMeldung: string): void {
  if (!BETRIEBLICHE_ERFASSUNGSWEGE.includes(erfassungsweg)) {
    throw new BadRequestException(digitalMeldung);
  }
  if (GESPERRTE_ERFASSUNGSWEGE.includes(erfassungsweg)) {
    throw new BadRequestException(GESPERRT_MELDUNG);
  }
}

/**
 * Der Zeitpunkt, zu dem ERKLÄRT wurde — nicht der, zu dem erfasst wurde
 * (A12-27).
 *
 * Bei einem nachgetragenen Schreiben liegen beide Wochen auseinander, und für
 * die Frage, ab wann eine Verarbeitung gedeckt war bzw. nicht mehr laufen
 * durfte, zählt der erste.
 */
export function pruefeErklaerungszeitpunkt(wert: string, jetzt: Date, feld: string): Date {
  const zeitpunkt = new Date(wert);
  if (Number.isNaN(zeitpunkt.getTime())) {
    throw new BadRequestException(`${feld} ist kein gueltiger Zeitpunkt.`);
  }
  if (zeitpunkt.getTime() > jetzt.getTime()) {
    throw new BadRequestException(
      `${feld} liegt in der Zukunft. Erfasst wird, was bereits erklaert wurde — nicht, was erwartet wird.`,
    );
  }
  return zeitpunkt;
}
