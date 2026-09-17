import type { AnschlussnutzerListItem } from '@edms/shared';
import { useAnschlussnutzerListe, type AnschlussnutzerListenFilter } from '../../api/anschlussnutzer';

export interface AnschlussnutzerListeView {
  readonly items: readonly AnschlussnutzerListItem[];
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly loadMore: () => void;
}

/**
 * Leitet aus der Cursor-paginierten Anschlussnutzer-Listen-Query ein reines
 * Anzeige-Modell ab (analog `useEndkundenListeView`). Keine Filter in diesem
 * Pass — die Listen-Seite zeigt ALLE Anschlussnutzer (offener Punkt,
 * Abschlussbericht).
 *
 * `filter` schränkt die Liste serverseitig ein (`?endkundeId=`/`?systemId=`,
 * bereits in der OpenAPI-Spec vorhanden) — so lässt sich dieselbe Tabelle
 * sowohl global als auch EINGEBETTET in eine übergeordnete Detailseite
 * verwenden, ohne eine zweite Komponente zu bauen.
 */
export function useAnschlussnutzerListeView(filter: AnschlussnutzerListenFilter = {}): AnschlussnutzerListeView {
  const query = useAnschlussnutzerListe(filter);

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
