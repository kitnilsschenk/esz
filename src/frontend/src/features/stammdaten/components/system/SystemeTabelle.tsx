import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { SystemListItem } from '@edms/shared';
import { DataList, kurzId, type DataListColumn } from '../shared';
import { useSystemeListeView } from '../../hooks/system';
import { t } from '../../../../shared/i18n/t';
import { formatiereZeitpunkt } from '../../../../shared/format/datum';

/**
 * Systeme-Liste (`ADR-0008 §23 / D11 Pass 1`, Status-Spalte ergänzt in
 * Feature-Pass A): Pseudonym-`id` (gekürzt), `endkundeId` (gekürzt),
 * `bezeichnung`, `status` (deutsche Enum-Labels, analog `ZaehlerTabelle`),
 * `createdAt`. Cursor-Pagination via `DataList`s „Weitere laden" (analog
 * `EndkundenTabelle`, Referenz-Muster).
 */
export interface SystemeTabelleProps {
  /**
   * Schränkt die Liste serverseitig auf EINEN übergeordneten Datensatz ein
   * (Einbettung in dessen Detailseite). Die dann redundante
   * `endkundeId`-Spalte entfällt automatisch — sie stünde in jeder Zeile
   * gleich und würde nur Breite kosten.
   */
  readonly endkundeId?: string;
}

export function SystemeTabelle({ endkundeId }: SystemeTabelleProps = {}): ReactNode {
  const view = useSystemeListeView(endkundeId !== undefined ? { endkundeId: endkundeId } : {});

  const eingebettet = endkundeId !== undefined;

  const alleSpalten: readonly DataListColumn<SystemListItem>[] = [
    { key: 'id', header: t('stammdaten.system.tabelle.id'), render: (item) => kurzId(item.id) },
    { key: 'endkundeId', header: t('stammdaten.system.tabelle.endkundeId'), render: (item) => kurzId(item.endkundeId) },
    { key: 'bezeichnung', header: t('stammdaten.system.tabelle.bezeichnung'), render: (item) => item.bezeichnung },
    {
      key: 'status',
      header: t('stammdaten.system.tabelle.status'),
      render: (item) => t(`stammdaten.common.enums.betriebsStatus.${item.status}`),
    },
    { key: 'createdAt', header: t('stammdaten.system.tabelle.createdAt'), render: (item) => formatiereZeitpunkt(item.createdAt) },
  ];

  // Im eingebetteten Modus ist `endkundeId` in jeder Zeile derselbe Wert.
  const columns = eingebettet ? alleSpalten.filter((spalte) => spalte.key !== 'endkundeId') : alleSpalten;

  return (
    <DataList<SystemListItem>
      caption={eingebettet ? t('stammdaten.system.tabelle.captionFuerEndkunde') : t('stammdaten.system.tabelle.caption')}
      columns={columns}
      items={view.items}
      getRowKey={(item) => item.id}
      isPending={view.isPending}
      isError={view.isError}
      loadingMessage={t('stammdaten.common.laedt')}
      errorMessage={t('stammdaten.common.fehler')}
      emptyMessage={eingebettet ? t('stammdaten.system.tabelle.leerFuerEndkunde') : t('stammdaten.system.tabelle.leer')}
      actionHeader={t('stammdaten.common.aktion')}
      renderRowAction={(item) => (
        <Link
          to={`/stammdaten/systeme/${item.id}`}
          aria-label={`${t('stammdaten.system.tabelle.detailsAnzeigen')} ${kurzId(item.id)}`}
          className="text-link underline-offset-4 hover:underline"
        >
          {t('stammdaten.system.tabelle.detailsAnzeigen')}
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
