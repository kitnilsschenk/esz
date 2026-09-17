import { useState } from 'react';
import type { EndkundeListItem } from '@edms/shared';
import { useEndkundenListeView } from '../endkunde';

export interface StandortUebersichtView {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly endkunden: readonly EndkundeListItem[];
  /** `true`, solange KEIN weiterer Endkunde nachgeladen werden könnte — Voraussetzung für die Auto-Auswahl unten. */
  readonly istVollstaendigGeladen: boolean;
  /** `true`, wenn GENAU EIN Endkunde existiert — steuert, ob „Anderen Endkunden wählen" überhaupt sinnvoll ist. */
  readonly nurEinEndkunde: boolean;
  /** Lokal ausgewählter Endkunde — bei genau einem Endkunden automatisch vorbelegt (kein sinnloser Ein-Elemente-Auswahldialog). */
  readonly ausgewaehlteEndkundeId: string | undefined;
  readonly waehleEndkunde: (endkundeId: string) => void;
  /** Setzt die Auswahl zurück auf die Auswahlliste (nur relevant, wenn NICHT `nurEinEndkunde`). */
  readonly wechsleEndkunde: () => void;
}

/**
 * View-Model der globalen Standort-Übersichtsseite (`/stammdaten/standorte`).
 * Ersetzt den bisherigen alleinigen Zugang über
 * `EndkundeDetailAnsicht` → „Standorte anzeigen" (vier Klick-Ebenen tief,
 * so die Begründung der inzwischen entfernten `nav/`-Ablage): lässt HIER
 * einen Endkunden wählen (reine
 * Wiederverwendung von `useEndkundenListeView` — KEINE eigene Such-/
 * Paginierungslogik) und zeigt darunter dessen Standort-Baum
 * (`StandortBaumAnsicht`, ebenfalls wiederverwendet).
 *
 * Ist GENAU EIN Endkunde vorhanden, wird er automatisch vorausgewählt statt
 * eine Auswahl mit einem einzigen Element zu zeigen. Die Auswahl selbst ist
 * reiner Client-Zustand (kein Server-State, `.claude/rules/frontend-react.md`)
 * — ein manuell gewählter Endkunde (`waehleEndkunde`) hat IMMER Vorrang vor
 * der Auto-Auswahl.
 */
export function useStandortUebersichtView(): StandortUebersichtView {
  const liste = useEndkundenListeView();
  const [ausgewaehlteEndkundeIdState, setAusgewaehlteEndkundeIdState] = useState<string | undefined>(undefined);

  const istVollstaendigGeladen = !liste.isPending && !liste.isError && !liste.hasNextPage;
  const nurEinEndkunde = istVollstaendigGeladen && liste.items.length === 1;

  const automatischeEndkundeId = nurEinEndkunde ? liste.items[0]?.id : undefined;
  const ausgewaehlteEndkundeId = ausgewaehlteEndkundeIdState ?? automatischeEndkundeId;

  return {
    isPending: liste.isPending,
    isError: liste.isError,
    endkunden: liste.items,
    istVollstaendigGeladen,
    nurEinEndkunde,
    ausgewaehlteEndkundeId,
    waehleEndkunde: setAusgewaehlteEndkundeIdState,
    wechsleEndkunde: () => setAusgewaehlteEndkundeIdState(undefined),
  };
}
