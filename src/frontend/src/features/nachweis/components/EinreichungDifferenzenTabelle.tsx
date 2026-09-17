import type { ReactNode } from 'react';
import { DataList, type DataListColumn } from '../../stammdaten/components/shared';
import { useEinreichungDifferenzenListeView, type EinreichungDifferenzZeileView } from '../hooks';
import { t } from '../../../shared/i18n/t';

export interface EinreichungDifferenzenTabelleProps {
  readonly einreichungId: string;
}

/**
 * Differenz-Report einer Korrektur-Einreichung: je Endkunde und Energieträger
 * der Wert vorher, der Wert nachher und die Abweichung. Das ist die
 * Darlegung, die eine Korrektur gegenüber der Bewilligungsbehörde begleitet.
 */
export function EinreichungDifferenzenTabelle({ einreichungId }: EinreichungDifferenzenTabelleProps): ReactNode {
  const view = useEinreichungDifferenzenListeView(einreichungId);

  const columns: readonly DataListColumn<EinreichungDifferenzZeileView>[] = [
    {
      key: 'endkundeId',
      header: t('nachweis.einreichung.differenzTabelle.endkundeId'),
      render: (zeile) => zeile.endkundeIdLabel,
    },
    {
      key: 'energietraeger',
      header: t('nachweis.einreichung.differenzTabelle.energietraeger'),
      render: (zeile) => zeile.energietraegerLabel,
    },
    { key: 'alt', header: t('nachweis.einreichung.differenzTabelle.wertAltKwh'), render: (zeile) => zeile.wertAltLabel },
    { key: 'neu', header: t('nachweis.einreichung.differenzTabelle.wertNeuKwh'), render: (zeile) => zeile.wertNeuLabel },
    { key: 'delta', header: t('nachweis.einreichung.differenzTabelle.deltaKwh'), render: (zeile) => zeile.deltaLabel },
    { key: 'ursache', header: t('nachweis.einreichung.differenzTabelle.ursacheCode'), render: (zeile) => zeile.ursacheLabel },
  ];

  return (
    <DataList<EinreichungDifferenzZeileView>
      caption={t('nachweis.einreichung.differenzTabelle.caption')}
      columns={columns}
      items={view.items}
      getRowKey={(zeile) => zeile.key}
      isPending={view.isPending}
      isError={view.isError}
      loadingMessage={t('stammdaten.common.laedt')}
      errorMessage={t('stammdaten.common.fehler')}
      emptyMessage={t('nachweis.einreichung.differenzTabelle.leer')}
      pagination={{
        hasNextPage: view.hasNextPage,
        isFetchingNextPage: view.isFetchingNextPage,
        onLoadMore: view.loadMore,
        loadMoreLabel: t('stammdaten.common.weitereLaden'),
      }}
    />
  );
}
