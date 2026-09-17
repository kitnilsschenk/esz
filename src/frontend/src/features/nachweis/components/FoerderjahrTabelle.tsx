import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { DataList, type DataListColumn } from '../../stammdaten/components/shared';
import { useFoerderjahreListeView, type FoerderjahrZeileView } from '../hooks';
import { t } from '../../../shared/i18n/t';

/**
 * Liste der angelegten Förderjahre — der Einstieg in die Nachweis-Kette
 * (Förderjahr → Vollständigkeitsprüfung → Einspar-Lauf → Export →
 * Einreichung). Alle Felder sind PII-frei.
 */
export function FoerderjahrTabelle(): ReactNode {
  const view = useFoerderjahreListeView();

  const columns: readonly DataListColumn<FoerderjahrZeileView>[] = [
    { key: 'code', header: t('nachweis.foerderjahr.tabelle.code'), render: (zeile) => zeile.code },
    { key: 'nummer', header: t('nachweis.foerderjahr.tabelle.nummer'), render: (zeile) => zeile.nummerLabel },
    { key: 'zeitraum', header: t('nachweis.foerderjahr.tabelle.zeitraum'), render: (zeile) => zeile.zeitraumLabel },
    {
      key: 'definitionQuelle',
      header: t('nachweis.foerderjahr.tabelle.definitionQuelle'),
      render: (zeile) => zeile.definitionQuelleLabel,
    },
    { key: 'vorhabenRef', header: t('nachweis.foerderjahr.tabelle.vorhabenRef'), render: (zeile) => zeile.vorhabenRef },
    { key: 'createdAt', header: t('nachweis.foerderjahr.tabelle.createdAt'), render: (zeile) => zeile.createdAtLabel },
  ];

  return (
    <DataList<FoerderjahrZeileView>
      caption={t('nachweis.foerderjahr.tabelle.caption')}
      columns={columns}
      items={view.items}
      getRowKey={(zeile) => zeile.id}
      isPending={view.isPending}
      isError={view.isError}
      loadingMessage={t('stammdaten.common.laedt')}
      errorMessage={t('stammdaten.common.fehler')}
      emptyMessage={t('nachweis.foerderjahr.tabelle.leer')}
      actionHeader={t('stammdaten.common.aktion')}
      renderRowAction={(zeile) => (
        <Link
          to={`/nachweis/foerderjahre/${zeile.id}`}
          aria-label={`${t('nachweis.foerderjahr.tabelle.detailsAnzeigen')} ${zeile.code}`}
          className="text-link underline-offset-4 hover:underline"
        >
          {t('nachweis.foerderjahr.tabelle.detailsAnzeigen')}
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
