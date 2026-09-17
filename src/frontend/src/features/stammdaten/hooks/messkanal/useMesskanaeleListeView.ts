import { useMemo } from 'react';
import type { MesskanalFreshnessItem, MesskanalListItem } from '@edms/shared';
import { useMesskanaeleListe } from '../../api/messkanal';
import { useZaehlerFreshness } from '../../api/zaehler';
import { formatiereRelativeZeit } from '../shared/relativeZeit';
import { t } from '../../../../shared/i18n/t';

export interface MesskanalFreshnessView {
  readonly label: string;
  readonly ueberfaellig: boolean;
}

export interface MesskanaeleListeView {
  readonly items: readonly MesskanalListItem[];
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly loadMore: () => void;
  /** `true`, solange die Freshness-Nebenabfrage noch lädt — Spalte zeigt währenddessen den Lade-Text. */
  readonly freshnessIsPending: boolean;
  /** Freshness-Anzeige-Modell EINES Messkanals — `undefined`, solange (noch) keine Daten vorliegen (Fehler in der Nebenabfrage degradiert NUR zu „keine Angabe", kein eigener Fehlerzustand für die gesamte Tabelle). */
  readonly freshnessFuer: (messkanalId: string) => MesskanalFreshnessView | undefined;
}

function toFreshnessView(item: MesskanalFreshnessItem): MesskanalFreshnessView {
  if (item.letzteUebertragung === null) {
    return { label: t('stammdaten.messkanal.tabelle.freshnessNieEmpfangen'), ueberfaellig: item.ueberfaellig };
  }
  return { label: formatiereRelativeZeit(item.letzteUebertragung), ueberfaellig: item.ueberfaellig };
}

/**
 * Leitet aus der Cursor-paginierten Messkanäle-Listen-Query EINES Zählers
 * (Sub-Ressource) UND der Freshness-Nebenabfrage (`GET
 * .../zaehler/{id}/freshness`, `read:monitoring`) ein reines Anzeige-Modell
 * ab (Betriebs-UI-Konzept Punkt 4 „Messkanäle-Tabelle … erweitert um
 * Letzte-Übertragung-Spalte"). Die Freshness-Liste kommt in EINEM Aufruf für
 * ALLE Messkanäle dieses Zählers (nicht je Zeile) — `freshnessFuer` joint
 * client-seitig über `messkanalId`.
 */
export function useMesskanaeleListeView(zaehlerId: string): MesskanaeleListeView {
  const query = useMesskanaeleListe({ zaehlerId });
  const freshnessQuery = useZaehlerFreshness(zaehlerId);

  const freshnessById = useMemo(() => {
    const map = new Map<string, MesskanalFreshnessItem>();
    for (const item of freshnessQuery.data ?? []) {
      map.set(item.messkanalId, item);
    }
    return map;
  }, [freshnessQuery.data]);

  return {
    items: query.data ? query.data.pages.flatMap((page) => page.daten) : [],
    isPending: query.isPending,
    isError: query.isError,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    loadMore: () => {
      void query.fetchNextPage();
    },
    freshnessIsPending: freshnessQuery.isPending,
    freshnessFuer: (messkanalId: string) => {
      const item = freshnessById.get(messkanalId);
      return item ? toFreshnessView(item) : undefined;
    },
  };
}
