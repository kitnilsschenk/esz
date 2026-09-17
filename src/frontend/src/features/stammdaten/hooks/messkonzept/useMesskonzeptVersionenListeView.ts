import type { MesskonzeptVersionListItem } from '@edms/shared';
import { useMesskonzeptVersionenListe } from '../../api/messkonzept';

export interface MesskonzeptVersionenListeView {
  readonly items: readonly MesskonzeptVersionListItem[];
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly loadMore: () => void;
}

/**
 * Leitet aus der Cursor-paginierten Messkonzept-Versionen-Listen-Query EINES
 * Endkunden (Sub-Ressource, „neueste zuerst") ein reines Anzeige-Modell ab
 * (analog `useMesskanaeleListeView`).
 */
export function useMesskonzeptVersionenListeView(endkundeId: string): MesskonzeptVersionenListeView {
  const query = useMesskonzeptVersionenListe({ endkundeId });

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
