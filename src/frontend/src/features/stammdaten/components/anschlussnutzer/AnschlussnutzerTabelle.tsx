import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { AnschlussnutzerListItem } from '@edms/shared';
import { DataList, kurzId, type DataListColumn } from '../shared';
import { useAnschlussnutzerListeView } from '../../hooks/anschlussnutzer';
import { t } from '../../../../shared/i18n/t';
import { formatiereZeitpunkt } from '../../../../shared/format/datum';

/**
 * Anschlussnutzer-Liste (`ADR-0008 §23 / D11 Phase 4c Pass 2`, Muster =
 * `EndkundenTabelle`): Pseudonym-`id` (gekürzt), Endkunde (gekürzt),
 * Verarbeitungsstatus, `createdAt` — KEIN Name/Kontakt (Linie 2, die API
 * liefert hier ohnehin nur PII-freie `AnschlussnutzerListItem`s).
 */
export interface AnschlussnutzerTabelleProps {
  /**
   * Schränkt die Liste serverseitig auf EINEN übergeordneten Datensatz ein
   * (Einbettung in dessen Detailseite). Die dann redundante
   * `endkundeId`-Spalte entfällt automatisch — sie stünde in jeder Zeile
   * gleich und würde nur Breite kosten.
   */
  readonly endkundeId?: string;
}

export function AnschlussnutzerTabelle({ endkundeId }: AnschlussnutzerTabelleProps = {}): ReactNode {
  const view = useAnschlussnutzerListeView(endkundeId !== undefined ? { endkundeId: endkundeId } : {});

  const eingebettet = endkundeId !== undefined;

  const alleSpalten: readonly DataListColumn<AnschlussnutzerListItem>[] = [
    { key: 'id', header: t('stammdaten.anschlussnutzer.tabelle.id'), render: (item) => kurzId(item.id) },
    {
      key: 'endkundeId',
      header: t('stammdaten.anschlussnutzer.tabelle.endkundeId'),
      render: (item) => kurzId(item.endkundeId),
    },
    {
      key: 'verarbeitungsStatus',
      header: t('stammdaten.anschlussnutzer.tabelle.verarbeitungsStatus'),
      render: (item) => t(`stammdaten.common.enums.verarbeitungsStatus.${item.verarbeitungsStatus}`),
    },
    { key: 'createdAt', header: t('stammdaten.anschlussnutzer.tabelle.createdAt'), render: (item) => formatiereZeitpunkt(item.createdAt) },
  ];

  // Im eingebetteten Modus ist `endkundeId` in jeder Zeile derselbe Wert.
  const columns = eingebettet ? alleSpalten.filter((spalte) => spalte.key !== 'endkundeId') : alleSpalten;

  return (
    <DataList<AnschlussnutzerListItem>
      caption={eingebettet ? t('stammdaten.anschlussnutzer.tabelle.captionFuerEndkunde') : t('stammdaten.anschlussnutzer.tabelle.caption')}
      columns={columns}
      items={view.items}
      getRowKey={(item) => item.id}
      isPending={view.isPending}
      isError={view.isError}
      loadingMessage={t('stammdaten.common.laedt')}
      errorMessage={t('stammdaten.common.fehler')}
      emptyMessage={eingebettet ? t('stammdaten.anschlussnutzer.tabelle.leerFuerEndkunde') : t('stammdaten.anschlussnutzer.tabelle.leer')}
      actionHeader={t('stammdaten.common.aktion')}
      renderRowAction={(item) => (
        <Link
          to={`/stammdaten/anschlussnutzer/${item.id}`}
          aria-label={`${t('stammdaten.anschlussnutzer.tabelle.detailsAnzeigen')} ${kurzId(item.id)}`}
          className="text-link underline-offset-4 hover:underline"
        >
          {t('stammdaten.anschlussnutzer.tabelle.detailsAnzeigen')}
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
