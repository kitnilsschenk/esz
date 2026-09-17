import { useFoerderjahreListe } from '../api';
import { definitionQuelleLabel, formatiereAnzahl, formatiereFoerderjahrSpanne } from './nachweisFormat';
import { formatiereZeitpunkt } from '../../../shared/format/datum';

export interface FoerderjahrZeileView {
  readonly id: string;
  readonly code: string;
  readonly nummerLabel: string;
  readonly zeitraumLabel: string;
  readonly definitionQuelleLabel: string;
  readonly vorhabenRef: string;
  readonly createdAtLabel: string;
}

export interface FoerderjahreListeView {
  readonly items: readonly FoerderjahrZeileView[];
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly loadMore: () => void;
}

/**
 * Anzeige-Modell der Förderjahr-Liste. Zeitraum, Zuschnitt und Zeitstempel
 * werden HIER aufbereitet, damit `FoerderjahrTabelle.tsx` keine
 * Formatierungs-Logik im JSX trägt (`.claude/rules/frontend-react.md`).
 */
export function useFoerderjahreListeView(): FoerderjahreListeView {
  const query = useFoerderjahreListe({});

  const items: readonly FoerderjahrZeileView[] = query.data
    ? query.data.pages.flatMap((seite) =>
        seite.daten.map((eintrag) => ({
          id: eintrag.id,
          code: eintrag.code,
          nummerLabel: formatiereAnzahl(eintrag.nummer),
          zeitraumLabel: formatiereFoerderjahrSpanne(
            eintrag.vonMonat,
            eintrag.bisMonat,
            eintrag.vonTag,
            eintrag.bisTag,
          ),
          definitionQuelleLabel: definitionQuelleLabel(eintrag.definitionQuelle),
          vorhabenRef: eintrag.vorhabenRef,
          createdAtLabel: formatiereZeitpunkt(eintrag.createdAt),
        })),
      )
    : [];

  return {
    items,
    isPending: query.isPending,
    isError: query.isError,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    loadMore: () => {
      void query.fetchNextPage();
    },
  };
}
