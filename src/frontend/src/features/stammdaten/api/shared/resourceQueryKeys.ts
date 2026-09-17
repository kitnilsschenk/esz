// Generische TanStack-Query-Key-Fabrik für Stammdaten-Ressourcen (analog zur
// bestehenden Health-/Auth-Konvention `healthKeys`/`authKeys`, aber
// parametrisiert je Ressourcenname statt hart codiert — jede Stammdaten-
// Entität (Endkunde, System, Zähler, …) ruft `createResourceQueryKeys('…')`
// EINMAL in ihrer eigenen `*Keys.ts` auf; diese Datei selbst ändert sich
// dafür nie (.claude/rules/frontend-react.md: Server-State nur über
// TanStack Query).

export interface ListenFilter {
  readonly [key: string]: string | number | boolean | undefined;
}

export interface ResourceQueryKeys {
  readonly all: readonly [string];
  readonly listen: () => readonly [string, 'liste'];
  readonly liste: (filter: ListenFilter) => readonly [string, 'liste', ListenFilter];
  readonly details: () => readonly [string, 'detail'];
  readonly detail: (id: string) => readonly [string, 'detail', string];
}

/** Baut eine Query-Key-Factory für genau eine Stammdaten-Ressource (z. B. `'endkunde'`). */
export function createResourceQueryKeys(resource: string): ResourceQueryKeys {
  return {
    all: [resource] as const,
    listen: () => [resource, 'liste'] as const,
    liste: (filter) => [resource, 'liste', filter] as const,
    details: () => [resource, 'detail'] as const,
    detail: (id) => [resource, 'detail', id] as const,
  };
}
