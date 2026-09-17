import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { NutzungsverhaeltnisListItem } from '@edms/shared';
import { DataList, kurzId, type DataListColumn } from '../shared';
import { useNutzungsverhaeltnisseListeView } from '../../hooks/nutzungsverhaeltnis';
import { t } from '../../../../shared/i18n/t';
import { formatiereZeitpunkt, formatiereZeitpunktOder } from '../../../../shared/format/datum';

/**
 * Nutzungsverhältnisse-Liste (`ADR-0008 §23 / D11 Pass 1`): Pseudonym-`id`
 * (gekürzt), Endkunde/Anschlussnutzer/System (gekürzt), Datenklasse/Rolle
 * (deutsche Enum-Labels), Gültigkeitszeitraum. Cursor-Pagination via
 * `DataList`s „Weitere laden" (analog `ZaehlerTabelle`).
 */
export function NutzungsverhaeltnisseTabelle(): ReactNode {
  const view = useNutzungsverhaeltnisseListeView();

  const columns: readonly DataListColumn<NutzungsverhaeltnisListItem>[] = [
    { key: 'id', header: t('stammdaten.nutzungsverhaeltnis.tabelle.id'), render: (item) => kurzId(item.id) },
    {
      key: 'endkundeId',
      header: t('stammdaten.nutzungsverhaeltnis.tabelle.endkundeId'),
      render: (item) => kurzId(item.endkundeId),
    },
    {
      key: 'anschlussnutzerId',
      header: t('stammdaten.nutzungsverhaeltnis.tabelle.anschlussnutzerId'),
      render: (item) => kurzId(item.anschlussnutzerId),
    },
    { key: 'systemId', header: t('stammdaten.nutzungsverhaeltnis.tabelle.systemId'), render: (item) => kurzId(item.systemId) },
    {
      key: 'datenklasse',
      header: t('stammdaten.nutzungsverhaeltnis.tabelle.datenklasse'),
      render: (item) => t(`stammdaten.common.enums.datenklasse.${item.datenklasse}`),
    },
    {
      key: 'rolle',
      header: t('stammdaten.nutzungsverhaeltnis.tabelle.rolle'),
      render: (item) => t(`stammdaten.common.enums.nutzungsRolle.${item.rolle}`),
    },
    { key: 'gueltigVon', header: t('stammdaten.nutzungsverhaeltnis.tabelle.gueltigVon'), render: (item) => formatiereZeitpunkt(item.gueltigVon) },
    {
      key: 'gueltigBis',
      header: t('stammdaten.nutzungsverhaeltnis.tabelle.gueltigBis'),
      render: (item) => formatiereZeitpunktOder(item.gueltigBis, t('stammdaten.nutzungsverhaeltnis.detail.gueltigBisAktuell')),
    },
  ];

  return (
    <DataList<NutzungsverhaeltnisListItem>
      caption={t('stammdaten.nutzungsverhaeltnis.tabelle.caption')}
      columns={columns}
      items={view.items}
      getRowKey={(item) => item.id}
      isPending={view.isPending}
      isError={view.isError}
      loadingMessage={t('stammdaten.common.laedt')}
      errorMessage={t('stammdaten.common.fehler')}
      emptyMessage={t('stammdaten.nutzungsverhaeltnis.tabelle.leer')}
      actionHeader={t('stammdaten.common.aktion')}
      renderRowAction={(item) => (
        <Link
          to={`/stammdaten/nutzungsverhaeltnisse/${item.id}`}
          aria-label={`${t('stammdaten.nutzungsverhaeltnis.tabelle.detailsAnzeigen')} ${kurzId(item.id)}`}
          className="text-link underline-offset-4 hover:underline"
        >
          {t('stammdaten.nutzungsverhaeltnis.tabelle.detailsAnzeigen')}
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
