import { useState } from 'react';
import type { EinsparlaufArt } from '@edms/shared';
import { useEinsparlaeufeListe, type EinsparlaeufeListenFilter } from '../api';
import { kurzId } from '../../stammdaten/components/shared';
import { qualitaetsStufeBadgeVariante, qualitaetsStufeLabel } from '../../stammdaten/hooks/berechnung';
import { einsparlaufArtLabel, type BadgeVariante } from './nachweisFormat';
import { formatiereZeitpunkt } from '../../../shared/format/datum';

export interface EinsparlaufZeileView {
  readonly id: string;
  readonly idLabel: string;
  readonly foerderjahrId: string;
  readonly foerderjahrIdLabel: string;
  readonly artLabel: string;
  readonly qualitaetsStufeLabel: string;
  readonly qualitaetsStufeBadgeVariante: BadgeVariante;
  /**
   * `true`, wenn dieser Lauf einen Vorgänger ABLÖST, also ein Korrekturlauf
   * ist. Umgekehrt lässt sich aus den Listendaten NICHT ablesen, ob ein Lauf
   * selbst schon abgelöst wurde — dazu müsste man wissen, ob ein anderer Lauf
   * auf ihn zeigt, und das steht in keiner Zeile.
   */
  readonly istKorrekturlauf: boolean;
  readonly erstelltAtLabel: string;
}

export interface EinsparlaeufeListeView {
  readonly items: readonly EinsparlaufZeileView[];
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly loadMore: () => void;
}

/**
 * Anzeige-Modell der Einspar-Lauf-Liste. `filter` ist reiner Client-Zustand
 * (Auswahl in der Oberfläche), der Server filtert damit — gespiegelt wird
 * nichts (`.claude/rules/frontend-react.md`: Server-State nur über TanStack
 * Query).
 */
export function useEinsparlaeufeListeView(filter: EinsparlaeufeListenFilter = {}): EinsparlaeufeListeView {
  const query = useEinsparlaeufeListe(filter);

  const items: readonly EinsparlaufZeileView[] = query.data
    ? query.data.pages.flatMap((seite) =>
        seite.daten.map((lauf) => ({
          id: lauf.id,
          idLabel: kurzId(lauf.id),
          foerderjahrId: lauf.foerderjahrId,
          foerderjahrIdLabel: kurzId(lauf.foerderjahrId),
          artLabel: einsparlaufArtLabel(lauf.art),
          qualitaetsStufeLabel: qualitaetsStufeLabel(lauf.qualitaetsStufeMin),
          qualitaetsStufeBadgeVariante: qualitaetsStufeBadgeVariante(lauf.qualitaetsStufeMin),
          istKorrekturlauf: lauf.ersetztEinsparlaufId !== null,
          erstelltAtLabel: formatiereZeitpunkt(lauf.erstelltAt),
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

export interface EinsparlaufFilterView {
  readonly filter: EinsparlaeufeListenFilter;
  readonly foerderjahrId: string;
  readonly art: string;
  readonly nurErstlaeufe: boolean;
  readonly setzeFoerderjahrId: (wert: string) => void;
  readonly setzeArt: (wert: string) => void;
  readonly setzeNurErstlaeufe: (wert: boolean) => void;
}

/**
 * Hält die drei Filter der Listenseite.
 *
 * **Zum dritten Filter.** Der Server filtert dabei auf Läufe, die selbst
 * KEINEN Vorgänger ablösen — also auf Erstläufe. Er filtert NICHT auf „der
 * jeweils jüngste, noch gültige Lauf": Ob ein Lauf inzwischen abgelöst wurde,
 * steht an ihm nirgends. Das Kästchen ist deshalb „Nur Erstläufe" benannt und
 * nicht „Nur aktuelle Läufe" — ein Filter, den man in einer Nachweis-Ansicht
 * für „das ist der gültige Stand" hält, obwohl er es nicht liefert, wäre
 * gefährlicher als gar keiner.
 *
 * Aus demselben Grund ist er NICHT vorbelegt: Die vollständige Liste ist die
 * ehrlichere Voreinstellung.
 */
export function useEinsparlaufFilterView(vorbelegtesFoerderjahr?: string): EinsparlaufFilterView {
  const [foerderjahrId, setzeFoerderjahrId] = useState<string>(vorbelegtesFoerderjahr ?? '');
  const [art, setzeArt] = useState<string>('');
  const [nurErstlaeufe, setzeNurErstlaeufe] = useState<boolean>(false);

  return {
    filter: {
      ...(foerderjahrId.length > 0 ? { foerderjahr: foerderjahrId } : {}),
      ...(art.length > 0 ? { art: art as EinsparlaufArt } : {}),
      ...(nurErstlaeufe ? { nurAktuelle: true } : {}),
    },
    foerderjahrId,
    art,
    nurErstlaeufe,
    setzeFoerderjahrId,
    setzeArt,
    setzeNurErstlaeufe,
  };
}
