import { formatiereKalenderdatum } from '../../../shared/format/datum';
import { t } from '../../../shared/i18n/t';
import { useNutzerinfoStatus } from '../../nutzerinfo/api';

export interface NutzerinfoKachelView {
  readonly isPending: boolean;
  readonly isError: boolean;
  /** Der ausgewertete Monat, wie ihn der Server bestimmt hat. */
  readonly monatLabel: string;
  readonly anzahlOffen: number;
  readonly anzahlErzeugt: number;
  /** `true`, solange fuer den Monat ueberhaupt nichts erzeugt wurde. */
  readonly nichtsErzeugt: boolean;
  /** Beschreibungstext — sagt, WAS zu tun ist, nicht nur was fehlt. */
  readonly beschreibung: string;
}

/**
 * Arbeitsplatz-Kachel „Monatliche Nutzerinformation" (TB-06).
 *
 * **Drei Zustaende, drei verschiedene Aussagen** — und keiner davon ist
 * „alles gut", solange er es nicht ist:
 *
 *   * Nichts erzeugt → der Monat ist noch gar nicht gelaufen. Das ist der
 *     haeufigste und der leiseste Fehler: Niemand bemerkt eine Auflage, an
 *     die ihn nichts erinnert.
 *   * Erzeugt, aber offen → die Zustellung fehlt. Erzeugen ist nicht
 *     informieren.
 *   * Alles zugestellt → der Monat ist durch.
 *
 * Der Monat kommt vom SERVER, nicht aus dieser Ansicht: Welcher gerade zaehlt,
 * haengt an der Zeitzone, und zwei Rechnungen derselben Sache laufen frueher
 * oder spaeter auseinander.
 */
export function useNutzerinfoKachelView(): NutzerinfoKachelView {
  const query = useNutzerinfoStatus();
  const daten = query.data;

  const anzahlErzeugt = daten?.anzahlErzeugt ?? 0;
  const anzahlOffen = daten?.anzahlOffen ?? 0;
  const nichtsErzeugt = daten !== undefined && anzahlErzeugt === 0;

  return {
    isPending: query.isPending,
    isError: query.isError,
    monatLabel: daten === undefined ? '' : formatiereKalenderdatum(daten.monat),
    anzahlOffen,
    anzahlErzeugt,
    nichtsErzeugt,
    beschreibung: nichtsErzeugt
      ? t('dashboard.kachel.nutzerinfo.beschreibungNichtErzeugt')
      : anzahlOffen > 0
        ? t('dashboard.kachel.nutzerinfo.beschreibungOffen')
        : t('dashboard.kachel.nutzerinfo.beschreibungDurch'),
  };
}
