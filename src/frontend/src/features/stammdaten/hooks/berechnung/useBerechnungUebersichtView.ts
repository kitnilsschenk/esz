import { useState } from 'react';
import type { EndkundeListItem } from '@edms/shared';
import { useEndkundenListeView } from '../endkunde';

export interface BerechnungUebersichtView {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly endkunden: readonly EndkundeListItem[];
  /** `true`, solange KEIN weiterer Endkunde nachgeladen werden könnte — Voraussetzung für die Auto-Auswahl unten. */
  readonly istVollstaendigGeladen: boolean;
  /** `true`, wenn GENAU EIN Endkunde existiert — steuert, ob „Anderen Endkunden wählen" überhaupt sinnvoll ist. */
  readonly nurEinEndkunde: boolean;
  readonly ausgewaehlteEndkundeId: string | undefined;
  readonly waehleEndkunde: (endkundeId: string) => void;
  readonly wechsleEndkunde: () => void;
}

/**
 * View-Model der globalen Baseline-/Einsparungs-Übersicht
 * (`/berechnung/laeufe`).
 *
 * Berechnungsläufe sind serverseitig eine Unterressource GENAU EINES
 * Endkunden — einen portfolioweiten Index gibt es nicht. Ein Nav-Eintrag
 * „Baseline & Einsparung" hätte damit kein Ziel, und der einzige Zugang
 * führte über Stammdaten → Endkunden → einen bestimmten Endkunden öffnen →
 * Abschnitt „Berechnungsläufe": vier Ebenen tief.
 *
 * Dieselbe Lage gab es bereits beim Standort-Baum, und sie wird hier auf
 * demselben Weg gelöst (`useStandortUebersichtView`): Der Endkunde wird HIER
 * gewählt — durch reine Wiederverwendung von `useEndkundenListeView`, ohne
 * eigene Such-/Paginierungslogik —, darunter erscheint die bestehende
 * Lauf-Liste unverändert. Bei genau einem Endkunden entfällt die Auswahl.
 *
 * Die Auswahl ist reiner Client-Zustand; eine manuelle Auswahl hat immer
 * Vorrang vor der automatischen.
 */
export function useBerechnungUebersichtView(): BerechnungUebersichtView {
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
