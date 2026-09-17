import { useMemo } from 'react';
import { useVollstaendigkeitListeView } from '../../stammdaten/hooks/monitoring';

export interface LueckenKachelView {
  readonly isPending: boolean;
  readonly isError: boolean;
  /** Anzahl EINDEUTIGER Endkunden mit mindestens einer Lücke (v1: Endkunde-Rollup, `ebene` ist ohnehin immer `'endkunde'` — Dedupe ist hier ein reiner Vorsichts-Schutz). */
  readonly anzahlEndkunden: number;
  readonly hatWeitere: boolean;
  readonly hatLuecken: boolean;
}

/**
 * Dashboard-Kachel 2 „Endkunden mit Stammdaten-Lücken" (Betriebs-UI-Konzept
 * Punkt 1, DE-02) — nutzt DIESELBE View-Model-Hook wie `VollstaendigkeitTabelle`.
 */
export function useLueckenKachelView(): LueckenKachelView {
  const view = useVollstaendigkeitListeView();

  const anzahlEndkunden = useMemo(() => new Set(view.items.map((item) => item.endkundeId)).size, [view.items]);

  return {
    isPending: view.isPending,
    isError: view.isError,
    anzahlEndkunden,
    hatWeitere: view.hasNextPage,
    hatLuecken: anzahlEndkunden > 0 || view.hasNextPage,
  };
}
