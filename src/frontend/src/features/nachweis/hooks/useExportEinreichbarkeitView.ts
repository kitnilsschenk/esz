import { useEinsparlaufDetail } from '../api';
import { t } from '../../../shared/i18n/t';

export interface ExportEinreichbarkeitView {
  readonly isPending: boolean;
  /** `true`, sobald feststeht, dass auf diesem Export eine Einreichung vermerkt werden darf. */
  readonly istEinreichbar: boolean;
  /** Grund, warum nicht — fertiger Anzeigetext, `undefined` solange nichts entgegensteht oder noch geladen wird. */
  readonly sperrGrund: string | undefined;
}

/**
 * Beantwortet auf der Export-Detailseite die Frage, ob der Abschnitt
 * „Einreichung vermerken" ein Formular oder eine Begründung zeigt.
 *
 * Vermerken lässt sich nur ein Export, der auf einem Förderjahr-Nachweis ohne
 * synthetische Daten beruht — der Server lehnt alles andere mit einem
 * Konflikt ab. Der Export selbst trägt diese Angaben nicht; sie stehen am
 * zugrunde liegenden Einspar-Lauf, der deshalb hier mitgelesen wird.
 *
 * Die dritte Bedingung des Servers — eine bestandene Vollständigkeitsprüfung
 * — ist darin bereits enthalten: Ein Lauf mit `art=foerderjahr_nachweis` kann
 * gar nicht anders entstanden sein, und Prüfungen werden nie nachträglich
 * verändert.
 *
 * `einsparlaufId` darf `undefined` sein (Export-Kopf noch nicht geladen) —
 * die Abfrage bleibt dann aus.
 */
export function useExportEinreichbarkeitView(einsparlaufId: string | undefined): ExportEinreichbarkeitView {
  const query = useEinsparlaufDetail(einsparlaufId ?? '', { enabled: einsparlaufId !== undefined });
  const lauf = query.data;

  if (lauf === undefined) {
    return { isPending: true, istEinreichbar: false, sperrGrund: undefined };
  }

  if (lauf.art !== 'foerderjahr_nachweis') {
    return { isPending: false, istEinreichbar: false, sperrGrund: t('nachweis.einreichung.vermerken.gesperrtHinweis') };
  }

  if (lauf.synthetic) {
    return {
      isPending: false,
      istEinreichbar: false,
      sperrGrund: t('nachweis.einreichung.vermerken.gesperrtSyntheticHinweis'),
    };
  }

  return { isPending: false, istEinreichbar: true, sperrGrund: undefined };
}
