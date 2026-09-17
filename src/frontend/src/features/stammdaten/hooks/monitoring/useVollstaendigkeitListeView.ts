import type { VollstaendigkeitItem } from '@edms/shared';
import { useVollstaendigkeitListe } from '../../api/monitoring';

export interface VollstaendigkeitListeView {
  readonly items: readonly VollstaendigkeitItem[];
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly loadMore: () => void;
}

/**
 * Leitet aus der Cursor-paginierten Vollständigkeits-Listen-Query ein reines
 * Anzeige-Modell ab (analog `useEndkundenListeView`). Kein
 * `endkundeId`-Filter und kein `nurMitLuecken`-Umschalter in diesem Pass —
 * die Seite zeigt den Server-Default (NUR Einträge mit mindestens einer
 * Lücke, `DEFAULT_NUR_MIT_LUECKEN` im Controller) — offener Punkt,
 * Abschlussbericht.
 */
export function useVollstaendigkeitListeView(): VollstaendigkeitListeView {
  const query = useVollstaendigkeitListe({});

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
