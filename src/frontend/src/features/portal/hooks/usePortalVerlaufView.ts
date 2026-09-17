import type { Nutzerinformation } from '@edms/shared';
import { formatiereKalenderdatum } from '../../../shared/format/datum';
import { t } from '../../../shared/i18n/t';
import { usePortalInformationen } from '../api';

export interface PortalMonatZeile {
  readonly id: string;
  readonly monatLabel: string;
  /** „Strom", „Wärme" — ohne ihn stehen zwei Zeilen desselben Monats ununterscheidbar untereinander. */
  readonly energietraegerLabel: string;
  readonly ergebnisLabel: string;
  readonly istMehrverbrauch: boolean;
  readonly verbrauchLabel: string;
}

export interface PortalVerlaufView {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly ladeFehlerMeldung: string;
  readonly zeilen: readonly PortalMonatZeile[];
  readonly istLeer: boolean;
}

/**
 * Die Energieträger, die eine Monatsinformation tragen kann.
 *
 * Ein unbekannter Wert wird ROH gezeigt statt durch einen fehlenden
 * Übersetzungsschlüssel zu einer leeren Zelle zu werden — dieselbe Linie wie
 * in `useNutzerinfoBerichtView`.
 */
const ENERGIETRAEGER_SCHLUESSEL = {
  strom: 'stammdaten.common.enums.energietraeger.strom',
  waerme: 'stammdaten.common.enums.energietraeger.waerme',
  kaelte: 'stammdaten.common.enums.energietraeger.kaelte',
  gas: 'stammdaten.common.enums.energietraeger.gas',
  oel: 'stammdaten.common.enums.energietraeger.oel',
  biomasse: 'stammdaten.common.enums.energietraeger.biomasse',
} as const;

function energietraegerLabel(wert: string): string {
  const schluessel = ENERGIETRAEGER_SCHLUESSEL[wert as keyof typeof ENERGIETRAEGER_SCHLUESSEL];
  return schluessel === undefined ? wert : t(schluessel);
}

const MONATE = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
] as const;

/** „März 2026" — nicht „2026-03-01": Das hier liest kein Betriebsmensch. */
export function monatLabel(monatsErster: string): string {
  const jahr = monatsErster.slice(0, 4);
  const nummer = Number.parseInt(monatsErster.slice(5, 7), 10);
  const name = MONATE[nummer - 1];
  return name === undefined ? formatiereKalenderdatum(monatsErster) : `${name} ${jahr}`;
}

function kwh(wert: number): string {
  return `${wert.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kWh`;
}

/**
 * Der eigene Verlauf, für den Kunden aufbereitet.
 *
 * **Das Vorzeichen ist die Aussage.** `deltaKwh` ist positiv bei einer
 * Einsparung und negativ bei einem Mehrverbrauch; beides wird ausgeschrieben.
 * Einen Mehrverbrauch als blanken Betrag zu zeigen wäre gegenüber dem Kunden
 * eine Beschönigung — dieselbe Linie wie in der Betriebs-Vorschau.
 */
export function usePortalVerlaufView(): PortalVerlaufView {
  const query = usePortalInformationen();
  const informationen: readonly Nutzerinformation[] = query.data ?? [];

  return {
    isPending: query.isPending,
    isError: query.isError,
    ladeFehlerMeldung: t('portal.uebersicht.ladeFehler'),
    istLeer: !query.isPending && !query.isError && informationen.length === 0,
    zeilen: informationen.map((information) => {
      const istMehrverbrauch = information.deltaKwh < 0;
      return {
        id: information.id,
        monatLabel: monatLabel(information.monat),
        energietraegerLabel: energietraegerLabel(information.energietraeger),
        ergebnisLabel: istMehrverbrauch
          ? `${kwh(Math.abs(information.deltaKwh))} ${t('portal.uebersicht.mehrverbrauch')}`
          : `${kwh(information.deltaKwh)} ${t('portal.uebersicht.einsparung')}`,
        istMehrverbrauch,
        verbrauchLabel: kwh(information.istKwh),
      };
    }),
  };
}
