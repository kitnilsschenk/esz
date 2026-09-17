import { useState } from 'react';
import type { Zustellweg } from '@edms/shared';
import { formatiereKalenderdatum, formatiereZeitpunkt } from '../../../shared/format/datum';
import { t } from '../../../shared/i18n/t';
import { mutationViewBasis, type MutationViewBasis } from '../../stammdaten/hooks/shared/mutationView';
import { useNutzerinformationen, useZustellungVermerken } from '../api';

/** Eine Zeile des Verlaufs — ein Monat. */
export interface MonatsInfoView {
  readonly id: string;
  readonly monatLabel: string;
  readonly energietraeger: string;
  /** „230,5 kWh eingespart" bzw. „180,0 kWh mehr verbraucht". */
  readonly ergebnisLabel: string;
  /** `true` bei Mehrverbrauch — die Ansicht hebt ihn hervor statt ihn zu verstecken. */
  readonly istMehrverbrauch: boolean;
  readonly verbrauchLabel: string;
  readonly erwartungLabel: string;
  readonly guteLabel: string;
  /** `undefined` = noch nicht zugestellt. */
  readonly zugestelltLabel: string | undefined;
  readonly zustellwegLabel: string | undefined;
  readonly istZugestellt: boolean;
}

export interface ZustellungAngaben {
  /** Tag der Zustellung, `YYYY-MM-DD` aus einem Datumsfeld. */
  readonly zugestelltAm: string;
  readonly zustellweg: Zustellweg;
}

export interface NutzerinfoVerlaufView extends MutationViewBasis {
  readonly monate: readonly MonatsInfoView[];
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly ladeFehlerMeldung: string;
  readonly leerMeldung: string;
  /** Wie viele Monate erzeugt, aber noch NICHT zugestellt sind. */
  readonly anzahlOffen: number;
  readonly offenHinweis: string | undefined;
  readonly angaben: ZustellungAngaben;
  readonly setzeAngaben: (angaben: ZustellungAngaben) => void;
  readonly vermerke: (informationId: string) => void;
}

function formatiereKwh(wert: number): string {
  return `${wert.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kWh`;
}

/**
 * Der Verlauf der monatlichen Nutzerinformation eines Endkunden (TB-06).
 *
 * **Drei Dinge, die diese Ansicht ausdrücklich zeigt.**
 *
 * 1. **Mehrverbräuche als das, was sie sind.** Das Merkblatt verlangt die
 *    Angabe von „Einsparungen und/oder Mehrverbräuchen"; die Zahl kommt
 *    vorzeichenbehaftet vom Server, und die Oberfläche kehrt sie nicht um.
 *    Ein Monat mit Mehrverbrauch wird hervorgehoben — wer ihn übersieht,
 *    übersieht das Gesprächsthema mit dem Kunden.
 * 2. **Die Güte des Monats.** Eine Einsparung aus einem Monat mit acht
 *    fehlenden Tagen ist eine andere Aussage als eine aus einem
 *    vollständigen. Kap. 6 verlangt „nachvollziehbar" — dazu gehört, wie
 *    belastbar die Zahl ist.
 * 3. **Was noch NICHT zugestellt ist.** Eine erzeugte, aber nicht zugestellte
 *    Information erfüllt die Auflage nicht. Die Zahl steht oben, nicht am
 *    Ende einer Liste.
 */
export function useNutzerinfoVerlaufView(endkundeId: string): NutzerinfoVerlaufView {
  const informationen = useNutzerinformationen(endkundeId);
  const mutation = useZustellungVermerken();

  const [angaben, setzeAngaben] = useState<ZustellungAngaben>({ zugestelltAm: '', zustellweg: 'brief' });

  const monate: MonatsInfoView[] = (informationen.data ?? []).map((info) => {
    const istMehrverbrauch = info.deltaKwh < 0;
    return {
      id: info.id,
      monatLabel: formatiereKalenderdatum(info.monat),
      energietraeger: info.energietraeger,
      // `t()` kennt keine Platzhalter (s. `shared/i18n/t.ts`) — Zahl und
      // Text werden hier zusammengesetzt, nicht im JSON interpoliert.
      ergebnisLabel: istMehrverbrauch
        ? `${formatiereKwh(Math.abs(info.deltaKwh))} ${t('nutzerinfo.verlauf.mehrverbrauchSuffix')}`
        : `${formatiereKwh(info.deltaKwh)} ${t('nutzerinfo.verlauf.einsparungSuffix')}`,
      istMehrverbrauch,
      verbrauchLabel: formatiereKwh(info.istKwh),
      erwartungLabel: formatiereKwh(info.referenzKwh),
      guteLabel:
        info.tageFehlend === 0
          ? t(`nutzerinfo.qualitaet.${info.qualitaetsStufe}`)
          : `${t(`nutzerinfo.qualitaet.${info.qualitaetsStufe}`)} — ${String(info.tageFehlend)} ${t('nutzerinfo.verlauf.tageFehlendSuffix')}`,
      zugestelltLabel: info.zugestelltAt === null ? undefined : formatiereZeitpunkt(info.zugestelltAt),
      zustellwegLabel: info.zustellweg === null ? undefined : t(`nutzerinfo.zustellweg.${info.zustellweg}`),
      istZugestellt: info.zugestelltAt !== null,
    };
  });

  const anzahlOffen = monate.filter((monat) => !monat.istZugestellt).length;

  return {
    monate,
    isPending: informationen.isPending,
    isError: informationen.isError,
    ladeFehlerMeldung: t('nutzerinfo.verlauf.ladeFehler'),
    leerMeldung: t('nutzerinfo.verlauf.leer'),
    anzahlOffen,
    // Nur wenn es wirklich etwas zu melden gibt — ein dauerhaft sichtbarer
    // „0 offen"-Hinweis stumpft ab, und dann wird auch die 5 uebersehen.
    offenHinweis:
      anzahlOffen === 0
        ? undefined
        : `${String(anzahlOffen)} ${t('nutzerinfo.verlauf.offenHinweisSuffix')}`,
    angaben,
    setzeAngaben,
    vermerke: (informationId: string) => {
      mutation.mutate({
        informationId,
        eingabe: {
          zustellweg: angaben.zustellweg,
          // Der Tag kommt aus einem Datumsfeld; der Server erwartet einen
          // Zeitpunkt. Mittag statt Mitternacht, damit die Zuordnung zum Tag
          // in keiner Zeitzone kippt.
          zugestelltAt: new Date(`${angaben.zugestelltAm}T12:00:00Z`).toISOString(),
        },
      });
    },
    ...mutationViewBasis(mutation, t('nutzerinfo.verlauf.zustellungErfolg')),
  };
}
