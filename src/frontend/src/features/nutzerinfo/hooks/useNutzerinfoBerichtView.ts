import type { NutzerinfoBericht } from '@edms/shared';
import { formatiereKalenderdatum } from '../../../shared/format/datum';
import { t } from '../../../shared/i18n/t';
import { useNutzerinfoBericht } from '../api';

export interface BerichtGruppeView {
  readonly id: string;
  readonly bezeichnung: string;
  readonly verbrauchLabel: string;
  readonly anteilLabel: string;
  /** 0–100, für die Balkenbreite. */
  readonly anteilPct: number;
}

export interface NutzerinfoBerichtView {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly ladeFehlerMeldung: string;
  readonly zeitraumLabel: string;
  readonly energietraegerLabel: string;

  /** „230,5 kWh eingespart" bzw. „180,0 kWh mehr verbraucht als erwartet". */
  readonly ergebnisLabel: string;
  readonly istMehrverbrauch: boolean;
  readonly verbrauchLabel: string;
  readonly erwartungLabel: string;
  readonly guteLabel: string;
  /** Hinweis, wenn die Datenlage die Aussage einschränkt — sonst `undefined`. */
  readonly guteHinweis: string | undefined;

  readonly gruppen: readonly BerichtGruppeView[];
  readonly nichtZugeordnetLabel: string;
  readonly gruppenLeerMeldung: string | undefined;

  /** „im Vormonat 180,0 kWh eingespart" — `undefined`, wenn es keinen gab. */
  readonly vormonatLabel: string | undefined;
  readonly zugestelltLabel: string | undefined;
}

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

function kwh(wert: number): string {
  return `${wert.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kWh`;
}

function prozent(wert: number): string {
  return `${wert.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`;
}

/**
 * Der Bericht, den ein Endkunde zu sehen bekommt (TB-06, [Q3] Kap. 6).
 *
 * **Das Vorzeichen ist die Aussage, nicht der Betrag.** `deltaKwh` ist positiv
 * bei einer Einsparung und negativ bei einem Mehrverbrauch — und diese Ansicht
 * schreibt beides aus. Einen Mehrverbrauch als Betrag ohne Vorzeichen zu
 * zeigen wäre gegenüber dem Kunden eine Beschönigung; das Merkblatt verlangt
 * ausdrücklich die Angabe von Einsparungen UND Mehrverbräuchen.
 *
 * **Ohne Zuordnung keine Torte.** Ist keine Gerätegruppe zugeordnet, sagt die
 * Ansicht das — statt eine leere Aufteilung zu zeigen, die aussähe, als gäbe
 * es nichts zu verteilen.
 */
export function useNutzerinfoBerichtView(informationId: string): NutzerinfoBerichtView {
  const query = useNutzerinfoBericht(informationId);
  return baueBerichtView(query.data, { isPending: query.isPending, isError: query.isError });
}

/** Ladezustand der Quelle — die Abbildung selbst holt nichts. */
export interface BerichtLadezustand {
  readonly isPending: boolean;
  readonly isError: boolean;
}

/**
 * Die reine Abbildung Bericht → Ansicht, OHNE Datenzugriff.
 *
 * Sie steht getrennt vom Hook, weil derselbe Bericht aus zwei Quellen kommt:
 * `GET /nutzerinfo/...` (Betrieb, Bearer) und `GET /portal/...` (Endkunde,
 * Sitzungs-Cookie). Der Endkunde soll GENAU dieselbe Darstellung sehen wie
 * die Vorschau des Betriebs — zwei Formulierungen derselben Zahl wären die
 * Stelle, an der die Auskunft an die betroffene Person von der Betriebssicht
 * abweicht.
 */
export function baueBerichtView(
  bericht: NutzerinfoBericht | undefined,
  zustand: BerichtLadezustand,
): NutzerinfoBerichtView {
  const leer: NutzerinfoBerichtView = {
    isPending: zustand.isPending,
    isError: zustand.isError,
    ladeFehlerMeldung: t('nutzerinfo.bericht.ladeFehler'),
    zeitraumLabel: '',
    energietraegerLabel: '',
    ergebnisLabel: '',
    istMehrverbrauch: false,
    verbrauchLabel: '',
    erwartungLabel: '',
    guteLabel: '',
    guteHinweis: undefined,
    gruppen: [],
    nichtZugeordnetLabel: '',
    gruppenLeerMeldung: undefined,
    vormonatLabel: undefined,
    zugestelltLabel: undefined,
  };

  if (bericht === undefined) {
    return leer;
  }

  const info = bericht.information;
  const istMehrverbrauch = info.deltaKwh < 0;

  return {
    ...leer,
    zeitraumLabel: `${formatiereKalenderdatum(bericht.vonTag)} – ${formatiereKalenderdatum(bericht.bisTag)}`,
    // Der Energietraeger kommt als freier String aus der API; die
    // `t()`-Schluessel sind ein geschlossener Satz. Ein unbekannter Wert wird
    // deshalb ROH gezeigt statt durch einen fehlenden Schluessel zu einem
    // leeren Feld zu werden.
    energietraegerLabel: energietraegerLabel(info.energietraeger),
    ergebnisLabel: istMehrverbrauch
      ? `${kwh(Math.abs(info.deltaKwh))} ${t('nutzerinfo.bericht.mehrverbrauchSuffix')}`
      : `${kwh(info.deltaKwh)} ${t('nutzerinfo.bericht.einsparungSuffix')}`,
    istMehrverbrauch,
    verbrauchLabel: kwh(info.istKwh),
    erwartungLabel: kwh(info.referenzKwh),
    guteLabel: t(`nutzerinfo.qualitaet.${info.qualitaetsStufe}`),
    // Der Hinweis erscheint NUR, wenn die Datenlage die Aussage wirklich
    // einschraenkt. Ein Guete-Vermerk unter jeder belastbaren Zahl waere
    // Rauschen, das man nach dem dritten Bericht nicht mehr liest.
    guteHinweis:
      info.qualitaetsStufe === 'belastbar'
        ? undefined
        : `${t('nutzerinfo.bericht.guteHinweis')} ${prozent(info.abdeckungPct)}.`,
    gruppen: bericht.gruppen.map((gruppe) => ({
      id: gruppe.geraetegruppeId,
      bezeichnung: gruppe.bezeichnung,
      verbrauchLabel: kwh(gruppe.verbrauchKwh),
      anteilLabel: prozent(gruppe.anteilPct),
      anteilPct: Math.min(Math.max(gruppe.anteilPct, 0), 100),
    })),
    nichtZugeordnetLabel: kwh(bericht.nichtZugeordnetKwh),
    gruppenLeerMeldung: bericht.ohneTageswerte
      ? t('nutzerinfo.bericht.ohneTageswerte')
      : bericht.gruppen.length === 0
        ? t('nutzerinfo.bericht.gruppenLeer')
        : undefined,
    vormonatLabel:
      bericht.vormonatDeltaKwh === null
        ? undefined
        : bericht.vormonatDeltaKwh < 0
          ? `${t('nutzerinfo.bericht.vormonatPrefix')} ${kwh(Math.abs(bericht.vormonatDeltaKwh))} ${t('nutzerinfo.bericht.mehrverbrauchSuffix')}`
          : `${t('nutzerinfo.bericht.vormonatPrefix')} ${kwh(bericht.vormonatDeltaKwh)} ${t('nutzerinfo.bericht.einsparungSuffix')}`,
    zugestelltLabel:
      info.zugestelltAt === null ? undefined : formatiereKalenderdatum(info.zugestelltAt.slice(0, 10)),
  };
}
