import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '../../../../shared/ui/badge';
import { DataList, kurzId, type DataListColumn } from '../shared';
import { useBerechnungslaufListeView, type BerechnungslaufListeZeileView } from '../../hooks/berechnung';
import { t } from '../../../../shared/i18n/t';

export interface BerechnungslaufTabelleProps {
  readonly endkundeId: string;
}

/**
 * Berechnungsläufe-Liste EINES Endkunden (`GET
 * /berechnung/endkunden/{endkundeId}/laeufe`, `read:berechnungslauf`,
 * Cursor-paginiert, PII-frei). Zeilen-Klick (Link) führt zum Lauf-Detail
 * inkl. Monatsergebnissen + Diagramm (`BerechnungslaufDetailAnsicht`).
 */
export function BerechnungslaufTabelle({ endkundeId }: BerechnungslaufTabelleProps): ReactNode {
  const view = useBerechnungslaufListeView(endkundeId);

  const columns: readonly DataListColumn<BerechnungslaufListeZeileView>[] = [
    { key: 'periode', header: t('stammdaten.berechnung.tabelle.periode'), render: (zeile) => zeile.periodeLabel },
    { key: 'energietraeger', header: t('stammdaten.berechnung.tabelle.energietraeger'), render: (zeile) => zeile.energietraegerLabel },
    {
      key: 'qualitaet',
      header: t('stammdaten.berechnung.tabelle.qualitaet'),
      render: (zeile) => <Badge variant={zeile.qualitaetsStufeBadgeVariante}>{zeile.qualitaetsStufeLabel}</Badge>,
    },
    { key: 'erstelltAt', header: t('stammdaten.berechnung.tabelle.erstelltAt'), render: (zeile) => zeile.erstelltAt },
  ];

  return (
    <DataList<BerechnungslaufListeZeileView>
      caption={t('stammdaten.berechnung.tabelle.caption')}
      columns={columns}
      items={view.items}
      getRowKey={(zeile) => zeile.id}
      isPending={view.isPending}
      isError={view.isError}
      loadingMessage={t('stammdaten.common.laedt')}
      errorMessage={t('stammdaten.common.fehler')}
      emptyMessage={t('stammdaten.berechnung.tabelle.leer')}
      actionHeader={t('stammdaten.common.aktion')}
      renderRowAction={(zeile) => (
        <Link
          to={`/stammdaten/endkunden/${endkundeId}/berechnungen/${zeile.id}`}
          aria-label={`${t('stammdaten.berechnung.tabelle.detailsAnzeigen')} ${kurzId(zeile.id)}`}
          className="text-link underline-offset-4 hover:underline"
        >
          {t('stammdaten.berechnung.tabelle.detailsAnzeigen')}
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
