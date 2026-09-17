import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { MesskonzeptVersionListItem } from '@edms/shared';
import { DataList, type DataListColumn } from '../shared';
import { useMesskonzeptVersionenListeView } from '../../hooks/messkonzept';
import { t } from '../../../../shared/i18n/t';
import { formatiereZeitpunkt, formatiereZeitpunktOder } from '../../../../shared/format/datum';

export interface MesskonzeptVersionenTabelleProps {
  readonly endkundeId: string;
}

/**
 * Messkonzept-Versionen-Liste EINES Endkunden (`ADR-0008 §23 / D11 Phase 4c
 * Pass 2`, Sub-Ressource `/stammdaten/endkunden/{endkundeId}/messkonzept/
 * versionen`, append-only, „neueste zuerst") — eingebettet in
 * `EndkundeDetailAnsicht` (KEIN eigener Top-Level-Listen-Route, analog
 * `MesskanaeleTabelle` in `ZaehlerDetailAnsicht`).
 */
export function MesskonzeptVersionenTabelle({ endkundeId }: MesskonzeptVersionenTabelleProps): ReactNode {
  const view = useMesskonzeptVersionenListeView(endkundeId);

  const columns: readonly DataListColumn<MesskonzeptVersionListItem>[] = [
    { key: 'versionNr', header: t('stammdaten.messkonzept.tabelle.versionNr'), render: (item) => item.versionNr },
    {
      key: 'typ',
      header: t('stammdaten.messkonzept.tabelle.typ'),
      render: (item) => t(`stammdaten.common.enums.messkonzeptTyp.${item.typ}`),
    },
    { key: 'gueltigVon', header: t('stammdaten.messkonzept.tabelle.gueltigVon'), render: (item) => formatiereZeitpunkt(item.gueltigVon) },
    {
      key: 'gueltigBis',
      header: t('stammdaten.messkonzept.tabelle.gueltigBis'),
      render: (item) => formatiereZeitpunktOder(item.gueltigBis, t('stammdaten.messkonzept.detail.gueltigBisAktuell')),
    },
    { key: 'createdAt', header: t('stammdaten.messkonzept.tabelle.createdAt'), render: (item) => formatiereZeitpunkt(item.createdAt) },
  ];

  return (
    <DataList<MesskonzeptVersionListItem>
      caption={t('stammdaten.messkonzept.tabelle.caption')}
      columns={columns}
      items={view.items}
      getRowKey={(item) => String(item.versionNr)}
      isPending={view.isPending}
      isError={view.isError}
      loadingMessage={t('stammdaten.common.laedt')}
      errorMessage={t('stammdaten.common.fehler')}
      emptyMessage={t('stammdaten.messkonzept.tabelle.leer')}
      actionHeader={t('stammdaten.common.aktion')}
      renderRowAction={(item) => (
        <Link
          to={`/stammdaten/endkunden/${endkundeId}/messkonzept/versionen/${String(item.versionNr)}`}
          aria-label={`${t('stammdaten.messkonzept.tabelle.detailsAnzeigen')} ${String(item.versionNr)}`}
          className="text-link underline-offset-4 hover:underline"
        >
          {t('stammdaten.messkonzept.tabelle.detailsAnzeigen')}
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
