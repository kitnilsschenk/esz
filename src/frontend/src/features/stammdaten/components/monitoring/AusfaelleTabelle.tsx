import type { ReactNode } from 'react';
import type { AusfallListeItem } from '@edms/shared';
import { DataList, kurzId, type DataListColumn } from '../shared';
import { Badge } from '../../../../shared/ui/badge';
import { useAusfaelleListeView } from '../../hooks/monitoring';
import { t } from '../../../../shared/i18n/t';

function AusfallStatusZelle({ item }: { readonly item: AusfallListeItem }): ReactNode {
  if (item.ausfallStatus !== null) {
    return (
      <Badge variant="destructive">{t(`stammdaten.monitoring.ausfaelle.tabelle.ausfallStatus.${item.ausfallStatus}`)}</Badge>
    );
  }
  return <Badge variant="warning">{t('stammdaten.monitoring.ausfaelle.tabelle.nurUeberfaellig')}</Badge>;
}

/**
 * TB-04-Ausfall-/Überfälligkeits-Tabelle (`GET /monitoring/ausfaelle`,
 * Betriebs-UI-Konzept Punkt 6 — Erweiterung der bisherigen reinen DE-02-
 * Vollständigkeits-Ansicht um die sanktionsbewehrte TB-04-Sicht). PII-frei,
 * Pseudonym-Surrogate NUR (`kurzId`). Sortierung server-seitig
 * `letzter_ts ASC` (am längsten ausgefallene Kanäle zuerst) — hier
 * unverändert übernommen (keine clientseitige Neusortierung).
 */
export function AusfaelleTabelle(): ReactNode {
  const view = useAusfaelleListeView();

  const columns: readonly DataListColumn<AusfallListeItem>[] = [
    { key: 'zaehlerId', header: t('stammdaten.monitoring.ausfaelle.tabelle.zaehlerId'), render: (item) => kurzId(item.zaehlerId) },
    { key: 'messkanalId', header: t('stammdaten.monitoring.ausfaelle.tabelle.messkanalId'), render: (item) => kurzId(item.messkanalId) },
    { key: 'letzteUebertragung', header: t('stammdaten.monitoring.ausfaelle.tabelle.letzteUebertragung'), render: (item) => item.letzteUebertragung },
    { key: 'status', header: t('stammdaten.monitoring.ausfaelle.tabelle.status'), render: (item) => <AusfallStatusZelle item={item} /> },
  ];

  return (
    <DataList<AusfallListeItem>
      caption={t('stammdaten.monitoring.ausfaelle.tabelle.caption')}
      columns={columns}
      items={view.items}
      getRowKey={(item) => item.messkanalId}
      isPending={view.isPending}
      isError={view.isError}
      loadingMessage={t('stammdaten.common.laedt')}
      errorMessage={t('stammdaten.common.fehler')}
      emptyMessage={t('stammdaten.monitoring.ausfaelle.tabelle.leer')}
      pagination={{
        hasNextPage: view.hasNextPage,
        isFetchingNextPage: view.isFetchingNextPage,
        onLoadMore: view.loadMore,
        loadMoreLabel: t('stammdaten.common.weitereLaden'),
      }}
    />
  );
}
