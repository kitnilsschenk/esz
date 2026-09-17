import { useEinsparlaufErgebnisseListe } from '../api';
import { kurzId } from '../../stammdaten/components/shared';
import { formatiereKwh } from '../../stammdaten/hooks/berechnung';
import {
  ausschlussGrundLabel,
  energietraegerLabel,
  ergebnisStatusBadgeVariante,
  ergebnisStatusLabel,
  formatiereAnzahl,
  jahresQualitaetsStufeBadgeVariante,
  jahresQualitaetsStufeLabel,
  type BadgeVariante,
} from './nachweisFormat';
import { t } from '../../../shared/i18n/t';

export interface EinsparlaufErgebnisZeileView {
  /** `endkundeId` + `energietraeger` — die Ergebniszeile hat keinen eigenen Schlüssel. */
  readonly key: string;
  readonly endkundeIdLabel: string;
  readonly energietraegerLabel: string;
  readonly statusLabel: string;
  readonly statusBadgeVariante: BadgeVariante;
  readonly einsparungLabel: string;
  readonly referenzLabel: string;
  readonly istLabel: string;
  readonly monateLabel: string;
  readonly qualitaetsStufeLabel: string;
  readonly qualitaetsStufeBadgeVariante: BadgeVariante;
  readonly ausschlussGrundLabel: string;
  readonly wissAuswertungAusgenommen: boolean;
}

export interface EinsparlaufErgebnisseListeView {
  readonly items: readonly EinsparlaufErgebnisZeileView[];
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly loadMore: () => void;
}

/**
 * Anzeige-Modell der Jahres-Ergebniszeilen. Enthält bewusst AUCH Paare ohne
 * Zahlenwert (ausgeschlossen/nicht nachweisbar) — der Nachweis ist nur
 * vollständig, wenn er die Ausschlüsse mit ausweist.
 *
 * Der Ausschlussgrund kommt in einer geschlossenen, neutralen Fassung vom
 * Server (`datenschutzrechtliche_einschraenkung`). Die Oberfläche reicht ihn
 * unverändert durch und reichert ihn NICHT an: Woran genau eine
 * Einschränkung liegt, gehört nicht in eine Nachweis-Ansicht.
 */
export function useEinsparlaufErgebnisseListeView(einsparlaufId: string): EinsparlaufErgebnisseListeView {
  const query = useEinsparlaufErgebnisseListe({ einsparlaufId });
  const keineAngabe = t('stammdaten.common.keineAngabe');

  const items: readonly EinsparlaufErgebnisZeileView[] = query.data
    ? query.data.pages.flatMap((seite) =>
        seite.daten.map((zeile) => ({
          key: `${zeile.endkundeId}:${zeile.energietraeger}`,
          endkundeIdLabel: kurzId(zeile.endkundeId),
          energietraegerLabel: energietraegerLabel(zeile.energietraeger),
          statusLabel: ergebnisStatusLabel(zeile.status),
          statusBadgeVariante: ergebnisStatusBadgeVariante(zeile.status),
          einsparungLabel:
            zeile.einsparungKwhEndenergie !== null ? formatiereKwh(zeile.einsparungKwhEndenergie) : keineAngabe,
          referenzLabel: zeile.referenzKwhSumme !== null ? formatiereKwh(zeile.referenzKwhSumme) : keineAngabe,
          istLabel: zeile.istKwhSumme !== null ? formatiereKwh(zeile.istKwhSumme) : keineAngabe,
          monateLabel: `${formatiereAnzahl(zeile.monateAusgewiesen)} / ${formatiereAnzahl(zeile.monateFehlend)}`,
          qualitaetsStufeLabel: jahresQualitaetsStufeLabel(zeile.qualitaetsStufeMin),
          qualitaetsStufeBadgeVariante: jahresQualitaetsStufeBadgeVariante(zeile.qualitaetsStufeMin),
          ausschlussGrundLabel:
            zeile.ausschlussGrundCode !== null ? ausschlussGrundLabel(zeile.ausschlussGrundCode) : keineAngabe,
          wissAuswertungAusgenommen: zeile.wissAuswertungAusgenommen,
        })),
      )
    : [];

  return {
    items,
    isPending: query.isPending,
    isError: query.isError,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    loadMore: () => {
      void query.fetchNextPage();
    },
  };
}
