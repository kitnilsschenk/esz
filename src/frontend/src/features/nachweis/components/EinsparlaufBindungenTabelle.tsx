import type { ReactNode } from 'react';
import { DataList, type DataListColumn } from '../../stammdaten/components/shared';
import { Badge } from '../../../shared/ui/badge';
import { useEinsparlaufBindungenListeView, type EinsparlaufBindungZeileView } from '../hooks';
import { t } from '../../../shared/i18n/t';

export interface EinsparlaufBindungenTabelleProps {
  readonly einsparlaufId: string;
}

/**
 * Monatsbindungen eines Einspar-Laufs — die Belegkette zwischen Jahreswert
 * und den monatlichen Berechnungen, mit den zum Zeitpunkt des Laufs
 * eingefrorenen Werten.
 *
 * `mehrdeutigAufgeloest` markiert Monate, für die mehrere gleichwertige
 * Berechnungen vorlagen. Das ist kein Fehler — abweichende Werte wären einer
 * und würden schon die Vollständigkeitsprüfung blockieren —, aber es gehört
 * sichtbar gemacht.
 */
export function EinsparlaufBindungenTabelle({ einsparlaufId }: EinsparlaufBindungenTabelleProps): ReactNode {
  const view = useEinsparlaufBindungenListeView(einsparlaufId);

  const columns: readonly DataListColumn<EinsparlaufBindungZeileView>[] = [
    {
      key: 'endkundeId',
      header: t('nachweis.einsparlauf.bindungTabelle.endkundeId'),
      render: (zeile) => zeile.endkundeIdLabel,
    },
    {
      key: 'energietraeger',
      header: t('nachweis.einsparlauf.bindungTabelle.energietraeger'),
      render: (zeile) => zeile.energietraegerLabel,
    },
    { key: 'monat', header: t('nachweis.einsparlauf.bindungTabelle.monat'), render: (zeile) => zeile.monatLabel },
    { key: 'referenz', header: t('nachweis.einsparlauf.bindungTabelle.referenzKwh'), render: (zeile) => zeile.referenzLabel },
    { key: 'ist', header: t('nachweis.einsparlauf.bindungTabelle.istKwh'), render: (zeile) => zeile.istLabel },
    { key: 'delta', header: t('nachweis.einsparlauf.bindungTabelle.deltaKwh'), render: (zeile) => zeile.deltaLabel },
    {
      key: 'deltaAusgewiesen',
      header: t('nachweis.einsparlauf.bindungTabelle.deltaAusgewiesenKwh'),
      render: (zeile) => zeile.deltaAusgewiesenLabel,
    },
    {
      key: 'qualitaetsStufe',
      header: t('nachweis.einsparlauf.bindungTabelle.qualitaetsStufe'),
      render: (zeile) => <Badge variant={zeile.qualitaetsStufeBadgeVariante}>{zeile.qualitaetsStufeLabel}</Badge>,
    },
    {
      key: 'behandlung',
      header: t('nachweis.einsparlauf.bindungTabelle.behandlung'),
      render: (zeile) => (
        <span className="flex flex-wrap items-center gap-2">
          {zeile.behandlungLabel}
          {zeile.mehrdeutigAufgeloest && (
            <Badge variant="outline">{t('nachweis.einsparlauf.bindungTabelle.mehrdeutigBadge')}</Badge>
          )}
        </span>
      ),
    },
    {
      key: 'berechnungslaufId',
      header: t('nachweis.einsparlauf.bindungTabelle.berechnungslaufId'),
      render: (zeile) => zeile.berechnungslaufIdLabel,
    },
  ];

  return (
    <DataList<EinsparlaufBindungZeileView>
      caption={t('nachweis.einsparlauf.bindungTabelle.caption')}
      columns={columns}
      items={view.items}
      getRowKey={(zeile) => zeile.key}
      isPending={view.isPending}
      isError={view.isError}
      loadingMessage={t('stammdaten.common.laedt')}
      errorMessage={t('stammdaten.common.fehler')}
      emptyMessage={t('nachweis.einsparlauf.bindungTabelle.leer')}
      pagination={{
        hasNextPage: view.hasNextPage,
        isFetchingNextPage: view.isFetchingNextPage,
        onLoadMore: view.loadMore,
        loadMoreLabel: t('stammdaten.common.weitereLaden'),
      }}
    />
  );
}
