import type { EndkundeListItem } from '@edms/shared';
import { useEndkundenListe } from '../../api/endkunde';

export interface EndkundenListeView {
  readonly items: readonly EndkundeListItem[];
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly loadMore: () => void;
}

/**
 * Leitet aus der Cursor-paginierten Endkunden-Listen-Query ein reines
 * Anzeige-Modell ab (geflachte Seiten, Ladezustände) — kapselt die
 * Ableitungslogik, damit `EndkundenTabelle` keine Business-Logik im JSX
 * enthält (Frontend-Rule, analog `useHealthStatusView`).
 */
export function useEndkundenListeView(): EndkundenListeView {
  const query = useEndkundenListe({});

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
