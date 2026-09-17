import type { ReactNode } from 'react';
import { DataList, type DataListColumn } from '../../stammdaten/components/shared';
import { Badge } from '../../../shared/ui/badge';
import { useEinsparlaufErgebnisseListeView, type EinsparlaufErgebnisZeileView } from '../hooks';
import { t } from '../../../shared/i18n/t';

export interface EinsparlaufErgebnisseTabelleProps {
  readonly einsparlaufId: string;
}

/**
 * Jahresergebnis je Endkunde und Energieträger.
 *
 * Die Tabelle zeigt bewusst AUCH Paare ohne Zahlenwert. Ein Nachweis, der nur
 * die ausgewiesenen Paare listet, sähe vollständiger aus, als er ist — die
 * Bewilligungsbehörde erwartet die Ausschlüsse mit.
 *
 * Der Ausschlussgrund erscheint in der neutralen Fassung, die der Server
 * liefert; er wird hier NICHT weiter aufgeschlüsselt.
 */
export function EinsparlaufErgebnisseTabelle({ einsparlaufId }: EinsparlaufErgebnisseTabelleProps): ReactNode {
  const view = useEinsparlaufErgebnisseListeView(einsparlaufId);

  const columns: readonly DataListColumn<EinsparlaufErgebnisZeileView>[] = [
    {
      key: 'endkundeId',
      header: t('nachweis.einsparlauf.ergebnisTabelle.endkundeId'),
      render: (zeile) => zeile.endkundeIdLabel,
    },
    {
      key: 'energietraeger',
      header: t('nachweis.einsparlauf.ergebnisTabelle.energietraeger'),
      render: (zeile) => zeile.energietraegerLabel,
    },
    {
      key: 'status',
      header: t('nachweis.einsparlauf.ergebnisTabelle.status'),
      render: (zeile) => (
        <span className="flex flex-wrap items-center gap-2">
          <Badge variant={zeile.statusBadgeVariante}>{zeile.statusLabel}</Badge>
          {zeile.wissAuswertungAusgenommen && (
            <Badge variant="outline">{t('nachweis.einsparlauf.ergebnisTabelle.ausgenommenJa')}</Badge>
          )}
        </span>
      ),
    },
    {
      key: 'einsparung',
      header: t('nachweis.einsparlauf.ergebnisTabelle.einsparungKwhEndenergie'),
      render: (zeile) => zeile.einsparungLabel,
    },
    {
      key: 'referenz',
      header: t('nachweis.einsparlauf.ergebnisTabelle.referenzKwhSumme'),
      render: (zeile) => zeile.referenzLabel,
    },
    { key: 'ist', header: t('nachweis.einsparlauf.ergebnisTabelle.istKwhSumme'), render: (zeile) => zeile.istLabel },
    { key: 'monate', header: t('nachweis.einsparlauf.ergebnisTabelle.monate'), render: (zeile) => zeile.monateLabel },
    {
      key: 'qualitaetsStufe',
      header: t('nachweis.einsparlauf.ergebnisTabelle.qualitaetsStufeMin'),
      render: (zeile) => <Badge variant={zeile.qualitaetsStufeBadgeVariante}>{zeile.qualitaetsStufeLabel}</Badge>,
    },
    {
      key: 'ausschlussGrund',
      header: t('nachweis.einsparlauf.ergebnisTabelle.ausschlussGrundCode'),
      render: (zeile) => zeile.ausschlussGrundLabel,
    },
  ];

  return (
    <DataList<EinsparlaufErgebnisZeileView>
      caption={t('nachweis.einsparlauf.ergebnisTabelle.caption')}
      columns={columns}
      items={view.items}
      getRowKey={(zeile) => zeile.key}
      isPending={view.isPending}
      isError={view.isError}
      loadingMessage={t('stammdaten.common.laedt')}
      errorMessage={t('stammdaten.common.fehler')}
      emptyMessage={t('nachweis.einsparlauf.ergebnisTabelle.leer')}
      pagination={{
        hasNextPage: view.hasNextPage,
        isFetchingNextPage: view.isFetchingNextPage,
        onLoadMore: view.loadMore,
        loadMoreLabel: t('stammdaten.common.weitereLaden'),
      }}
    />
  );
}
