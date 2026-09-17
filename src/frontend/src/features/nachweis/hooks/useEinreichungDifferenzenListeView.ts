import { useEinreichungDifferenzenListe } from '../api';
import { kurzId } from '../../stammdaten/components/shared';
import { formatiereKwh } from '../../stammdaten/hooks/berechnung';
import { energietraegerLabel, korrekturGrundLabel } from './nachweisFormat';
import { t } from '../../../shared/i18n/t';

export interface EinreichungDifferenzZeileView {
  /** `endkundeId` + `energietraeger` — die Differenzzeile hat keinen eigenen Schlüssel. */
  readonly key: string;
  readonly endkundeIdLabel: string;
  readonly energietraegerLabel: string;
  readonly wertAltLabel: string;
  readonly wertNeuLabel: string;
  readonly deltaLabel: string;
  readonly ursacheLabel: string;
}

export interface EinreichungDifferenzenListeView {
  readonly items: readonly EinreichungDifferenzZeileView[];
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly loadMore: () => void;
}

/**
 * Anzeige-Modell des Differenz-Reports einer Korrektur-Einreichung: je Paar
 * der Wert vorher, der Wert nachher und die Abweichung. Bei einer
 * Erst-Einreichung ist die Liste leer.
 */
export function useEinreichungDifferenzenListeView(einreichungId: string): EinreichungDifferenzenListeView {
  const query = useEinreichungDifferenzenListe({ einreichungId });
  const keineAngabe = t('stammdaten.common.keineAngabe');

  const items: readonly EinreichungDifferenzZeileView[] = query.data
    ? query.data.pages.flatMap((seite) =>
        seite.daten.map((zeile) => ({
          key: `${zeile.endkundeId}:${zeile.energietraeger}`,
          endkundeIdLabel: kurzId(zeile.endkundeId),
          energietraegerLabel: energietraegerLabel(zeile.energietraeger),
          wertAltLabel: zeile.wertAltKwh !== null ? formatiereKwh(zeile.wertAltKwh) : keineAngabe,
          wertNeuLabel: zeile.wertNeuKwh !== null ? formatiereKwh(zeile.wertNeuKwh) : keineAngabe,
          deltaLabel: formatiereKwh(zeile.deltaKwh),
          ursacheLabel: korrekturGrundLabel(zeile.ursacheCode),
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
