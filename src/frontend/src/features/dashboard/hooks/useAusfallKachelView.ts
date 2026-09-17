import { useMemo } from 'react';
import { useAusfaelleListeView } from '../../stammdaten/hooks/monitoring';

export interface AusfallKachelView {
  readonly isPending: boolean;
  readonly isError: boolean;
  /** Anzahl EINDEUTIGER Zähler (dedupliziert über `zaehlerId` — die Liste zählt Kanäle, die Kachel zeigt Zähler). */
  readonly anzahlZaehler: number;
  /** `true`, wenn die erste Seite bereits voll ist — die tatsächliche Zahl ist mind. `anzahlZaehler`, evtl. mehr (bewusst KEIN Total-Count, `/monitoring/ausfaelle` liefert keinen). */
  readonly hatWeitere: boolean;
  readonly hatAusfall: boolean;
}

/**
 * Dashboard-Kachel 1 „Zähler mit Datenausfall" (Betriebs-UI-Konzept Punkt 1,
 * TB-04, sanktionsbewehrt — höchste Priorität, NICHT die strukturelle
 * DE-02-Vollständigkeit). Nutzt DIESELBE View-Model-Hook wie die
 * `AusfaelleTabelle` der Datenqualitäts-Seite (`useAusfaelleListeView`,
 * Server-Default-Seitengröße) — dedupliziert hier zusätzlich auf
 * Zähler-Ebene, da die Rohliste je MESSKANAL zählt.
 */
export function useAusfallKachelView(): AusfallKachelView {
  const view = useAusfaelleListeView();

  const anzahlZaehler = useMemo(() => new Set(view.items.map((item) => item.zaehlerId)).size, [view.items]);

  return {
    isPending: view.isPending,
    isError: view.isError,
    anzahlZaehler,
    hatWeitere: view.hasNextPage,
    hatAusfall: anzahlZaehler > 0 || view.hasNextPage,
  };
}
