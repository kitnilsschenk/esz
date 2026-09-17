import type { AusfallListeItem } from '@edms/shared';
import { useAusfaelleListe } from '../../api/monitoring';

export interface AusfaelleListeView {
  readonly items: readonly AusfallListeItem[];
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly loadMore: () => void;
}

/**
 * Leitet aus der Cursor-paginierten TB-04-Ausfall-Listen-Query ein reines
 * Anzeige-Modell ab (analog `useVollstaendigkeitListeView`). Wird sowohl von
 * der Dashboard-Kachel „Zähler mit Datenausfall" (nur `items.length`/
 * `hasNextPage`, KEIN Total-Count — Betriebs-UI-Konzept Punkt 1) als auch von
 * der vollständigen `AusfaelleTabelle` (Datenqualität & Störungen, Punkt 6)
 * konsumiert.
 */
export function useAusfaelleListeView(): AusfaelleListeView {
  const query = useAusfaelleListe({});

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
