import type { SystemListItem } from '@edms/shared';
import { useSystemeListe, type SystemeListenFilter } from '../../api/system';

export interface SystemeListeView {
  readonly items: readonly SystemListItem[];
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly loadMore: () => void;
}

/**
 * Leitet aus der Cursor-paginierten Systeme-Listen-Query ein reines
 * Anzeige-Modell ab (analog `useEndkundenListeView`). Kein `endkundeId`-Filter
 * in diesem Pass — die Listen-Seite zeigt ALLE Systeme (offener Punkt:
 * Abschlussbericht).
 *
 * `filter` schränkt die Liste serverseitig ein (`?endkundeId=`/`?systemId=`,
 * bereits in der OpenAPI-Spec vorhanden) — so lässt sich dieselbe Tabelle
 * sowohl global als auch EINGEBETTET in eine übergeordnete Detailseite
 * verwenden, ohne eine zweite Komponente zu bauen.
 */
export function useSystemeListeView(filter: SystemeListenFilter = {}): SystemeListeView {
  const query = useSystemeListe(filter);

  return {
    items: query.data ? query.data.pages.flatMap((page) => page.daten) : [],
    isPending: query.isPending,
    isError: query.isError,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    loadMore: () => {
      void query.fetchNextPage();
    },
  };
}
