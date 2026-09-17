import { useInfiniteQuery, type InfiniteData, type UseInfiniteQueryResult } from '@tanstack/react-query';
import type { ApiProblemError } from '@edms/shared';
import type { ListenFilter, ResourceQueryKeys } from './resourceQueryKeys';
import type { CursorParams, CursorSeiteResponse } from './cursorTypes';

export interface ListeQueryOptions {
  /** Seitengröße (Server-Default 50, Server-Maximum 100 — `api-contracts.md`). */
  readonly limit?: number;
}

export type ListeQueryResult<TItem> = UseInfiniteQueryResult<
  InfiniteData<CursorSeiteResponse<TItem>, string | undefined>,
  ApiProblemError
>;

export interface ListeQueryConfig<TItem, TFilter extends ListenFilter> {
  readonly queryKeys: ResourceQueryKeys;
  /** Ruft GENAU EINEN `apiClient.GET(...)`-Aufruf auf und mappt Fehler bereits auf `ApiProblemError`. */
  readonly fetchSeite: (params: CursorParams & TFilter) => Promise<CursorSeiteResponse<TItem>>;
}

/**
 * Fabrik: erzeugt EINEN Cursor-paginierten `useInfiniteQuery`-Hook für genau
 * eine Stammdaten-Ressource (Server-State ausschließlich über TanStack Query,
 * `.claude/rules/frontend-react.md`). Jede neue Entität (System, Zähler, …)
 * ruft diese Fabrik in ihrer eigenen `use<Entität>Liste.ts` auf — diese Datei
 * bleibt dabei UNVERÄNDERT (geteiltes Fundament, ADR-0008 §23 / D11).
 *
 * `getNextPageParam` liest `seite.naechsterCursor` — `null` (letzte Seite)
 * wird auf `undefined` (TanStack-Konvention „keine weitere Seite") gemappt.
 */
export function createListeQuery<TItem, TFilter extends ListenFilter = ListenFilter>(
  config: ListeQueryConfig<TItem, TFilter>,
): (filter: TFilter, options?: ListeQueryOptions) => ListeQueryResult<TItem> {
  return function useListeQuery(filter: TFilter, options?: ListeQueryOptions): ListeQueryResult<TItem> {
    const limit = options?.limit;
    const keyFilter: ListenFilter = { ...filter, ...(limit !== undefined ? { limit } : {}) };

    return useInfiniteQuery<
      CursorSeiteResponse<TItem>,
      ApiProblemError,
      InfiniteData<CursorSeiteResponse<TItem>, string | undefined>,
      readonly [string, 'liste', ListenFilter],
      string | undefined
    >({
      queryKey: config.queryKeys.liste(keyFilter),
      initialPageParam: undefined,
      queryFn: ({ pageParam }) => {
        // `TFilter extends ListenFilter` erlaubt strukturell beliebige
        // zusätzliche Filter-Schlüssel — der Cast bindet das Ergebnis der
        // Spreads auf die vom Aufrufer erwartete konkrete Parameterform.
        const params = {
          ...filter,
          ...(limit !== undefined ? { limit } : {}),
          ...(pageParam !== undefined ? { cursor: pageParam } : {}),
        } as CursorParams & TFilter;
        return config.fetchSeite(params);
      },
      getNextPageParam: (lastPage) => lastPage.seite.naechsterCursor ?? undefined,
    });
  };
}
