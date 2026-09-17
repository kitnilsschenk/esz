import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { DataList, type DataListColumn } from '../../stammdaten/components/shared';
import { Badge } from '../../../shared/ui/badge';
import { useEinsparlaeufeListeView, type EinsparlaufZeileView } from '../hooks';
import type { EinsparlaeufeListenFilter } from '../api';
import { t } from '../../../shared/i18n/t';

export interface EinsparlaufTabelleProps {
  /**
   * Schränkt die Liste SERVERSEITIG auf ein Förderjahr ein (Einbettung in
   * dessen Detailseite). Die dann redundante Förderjahr-Spalte entfällt
   * automatisch — sie stünde in jeder Zeile gleich (Muster
   * `SystemeTabelle`).
   */
  readonly foerderjahrId?: string;
  /** Zusätzliche Filter der globalen Listenseite (Art, nur aktuelle Läufe). */
  readonly filter?: EinsparlaeufeListenFilter;
}

export function EinsparlaufTabelle({ foerderjahrId, filter }: EinsparlaufTabelleProps = {}): ReactNode {
  const eingebettet = foerderjahrId !== undefined;
  const view = useEinsparlaeufeListeView({
    ...(filter ?? {}),
    ...(eingebettet ? { foerderjahr: foerderjahrId } : {}),
  });

  const alleSpalten: readonly DataListColumn<EinsparlaufZeileView>[] = [
    { key: 'id', header: t('nachweis.einsparlauf.tabelle.id'), render: (zeile) => zeile.idLabel },
    {
      key: 'foerderjahrId',
      header: t('nachweis.einsparlauf.tabelle.foerderjahrId'),
      render: (zeile) => (
        <Link to={`/nachweis/foerderjahre/${zeile.foerderjahrId}`} className="text-link underline-offset-4 hover:underline">
          {zeile.foerderjahrIdLabel}
        </Link>
      ),
    },
    { key: 'art', header: t('nachweis.einsparlauf.tabelle.art'), render: (zeile) => zeile.artLabel },
    {
      key: 'qualitaetsStufeMin',
      header: t('nachweis.einsparlauf.tabelle.qualitaetsStufeMin'),
      render: (zeile) => <Badge variant={zeile.qualitaetsStufeBadgeVariante}>{zeile.qualitaetsStufeLabel}</Badge>,
    },
    {
      key: 'status',
      header: t('nachweis.einsparlauf.tabelle.status'),
      render: (zeile) =>
        zeile.istKorrekturlauf ? (
          <Badge variant="secondary">{t('nachweis.einsparlauf.tabelle.korrektur')}</Badge>
        ) : (
          <Badge variant="outline">{t('nachweis.einsparlauf.tabelle.erstlauf')}</Badge>
        ),
    },
    { key: 'erstelltAt', header: t('nachweis.einsparlauf.tabelle.erstelltAt'), render: (zeile) => zeile.erstelltAtLabel },
  ];

  const columns = eingebettet ? alleSpalten.filter((spalte) => spalte.key !== 'foerderjahrId') : alleSpalten;

  return (
    <DataList<EinsparlaufZeileView>
      caption={eingebettet ? t('nachweis.einsparlauf.tabelle.captionFuerFoerderjahr') : t('nachweis.einsparlauf.tabelle.caption')}
      columns={columns}
      items={view.items}
      getRowKey={(zeile) => zeile.id}
      isPending={view.isPending}
      isError={view.isError}
      loadingMessage={t('stammdaten.common.laedt')}
      errorMessage={t('stammdaten.common.fehler')}
      emptyMessage={eingebettet ? t('nachweis.einsparlauf.tabelle.leerFuerFoerderjahr') : t('nachweis.einsparlauf.tabelle.leer')}
      actionHeader={t('stammdaten.common.aktion')}
      renderRowAction={(zeile) => (
        <Link
          to={`/nachweis/einsparlaeufe/${zeile.id}`}
          aria-label={`${t('nachweis.einsparlauf.tabelle.detailsAnzeigen')} ${zeile.idLabel}`}
          className="text-link underline-offset-4 hover:underline"
        >
          {t('nachweis.einsparlauf.tabelle.detailsAnzeigen')}
        </Link>
      )}
      pagination={{
        hasNextPage: view.hasNextPage,
        isFetchingNextPage: view.isFetchingNextPage,
        onLoadMore: view.loadMore,
        loadMoreLabel: t('stammdaten.common.weitereLaden'),
      }}
    />
  );
}
