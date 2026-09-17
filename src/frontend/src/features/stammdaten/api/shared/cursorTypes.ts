import type { SeitenInfo } from '@edms/shared';

// Strukturelle Form JEDER Stammdaten-`…Liste`-Antwort (Cursor-Pagination,
// `.claude/rules/api-contracts.md`: „Pagination: Cursor-basiert, niemals
// offset"). Die generierten `EndkundeListe`/`SystemListe`/… Typen aus
// `@edms/shared` erfüllen diese Form strukturell bereits — kein Cast nötig,
// wenn eine Ressourcen-API-Funktion `Promise<XyzListe>` zurückgibt.
export interface CursorSeiteResponse<TItem> {
  readonly daten: readonly TItem[];
  readonly seite: SeitenInfo;
}

export interface CursorParams {
  readonly cursor?: string;
  readonly limit?: number;
}
