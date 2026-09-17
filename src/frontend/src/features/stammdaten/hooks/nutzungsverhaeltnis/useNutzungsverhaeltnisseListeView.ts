import type { NutzungsverhaeltnisListItem } from '@edms/shared';
import { useNutzungsverhaeltnisseListe, type NutzungsverhaeltnisListenFilter } from '../../api/nutzungsverhaeltnis';

export interface NutzungsverhaeltnisseListeView {
  readonly items: readonly NutzungsverhaeltnisListItem[];
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly loadMore: () => void;
}

/**
 * Leitet aus der Cursor-paginierten Nutzungsverhältnisse-Listen-Query ein
 * reines Anzeige-Modell ab (analog `useZaehlerListeView`). Keine Filter in
 * diesem Pass — die Listen-Seite zeigt ALLE Nutzungsverhältnisse (offener
 * Punkt: Abschlussbericht).
 *
 * `filter` schränkt die Liste serverseitig ein (`?endkundeId=`/`?systemId=`,
 * bereits in der OpenAPI-Spec vorhanden) — so lässt sich dieselbe Tabelle
 * sowohl global als auch EINGEBETTET in eine übergeordnete Detailseite
 * verwenden, ohne eine zweite Komponente zu bauen.
 */
export function useNutzungsverhaeltnisseListeView(filter: NutzungsverhaeltnisListenFilter = {}): NutzungsverhaeltnisseListeView {
  const query = useNutzungsverhaeltnisseListe(filter);

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
