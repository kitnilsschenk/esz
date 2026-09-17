import { useEffect, useState } from 'react';
import { t } from '../../../shared/i18n/t';
import { mutationViewBasis, type MutationViewBasis } from '../../stammdaten/hooks/shared/mutationView';
import { useEntbehrlichkeit, useEntbehrlichVermerken } from '../api';

export interface SystemEntbehrlichView extends MutationViewBasis {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly ladeFehlerMeldung: string;
  readonly entbehrlich: boolean;
  readonly setzeEntbehrlich: (wert: boolean) => void;
  readonly grund: string;
  readonly setzeGrund: (grund: string) => void;
  /** `false`, solange die Begründung fehlt — die Feststellung braucht sie. */
  readonly absendbar: boolean;
  readonly speichere: () => void;
}

/**
 * „Geräteerkennung ist für dieses System nicht sinnvoll" (TB-05, [Q3] Kap. 5).
 *
 * **Die Ansicht liest den Stand, bevor sie ihn schreiben lässt.** Ohne das
 * wäre die Checkbox schreib-only: Sie stünde bei jedem Aufruf auf „aus", auch
 * wenn längst ein Vermerk mit Begründung existiert — und wer sie dann setzt
 * und speichert, überschriebe die Begründung eines anderen, ohne sie je
 * gesehen zu haben.
 *
 * **Die Begründung ist im UI erzwungen, nicht nur im Server.** Der Vermerk
 * erklärt eine Förderauflage für ein System als erfüllt, ohne dass eine Zahl
 * das belegt. Ein Häkchen ohne Begründung wäre gegenüber der
 * Bewilligungsbehörde keine Feststellung, sondern eine Behauptung.
 *
 * **Die Rücknahme braucht keine Begründung.** Wer den Vermerk entfernt, stellt
 * den Normalfall wieder her: Das System zählt wieder in die Quote. Dafür eine
 * Erklärung zu verlangen, hielte Leute davon ab, einen Fehler zu korrigieren.
 */
export function useSystemEntbehrlichView(systemId: string): SystemEntbehrlichView {
  const standQuery = useEntbehrlichkeit(systemId);
  const mutation = useEntbehrlichVermerken();

  const [entwurf, setzeEntwurf] = useState<{ readonly entbehrlich: boolean; readonly grund: string } | null>(
    null,
  );

  // Solange niemand etwas geaendert hat, ist der Serverstand die Anzeige.
  // `entwurf === null` heisst „unberuehrt" — deshalb ein eigener Zustand statt
  // eines Initialwerts im `useState`: Der waere beim ersten Rendern (noch ohne
  // Daten) falsch und bliebe es.
  const gelesen = standQuery.data;
  useEffect(() => {
    if (gelesen === undefined) {
      return;
    }
    setzeEntwurf((vorher) => vorher ?? { entbehrlich: gelesen.entbehrlich, grund: gelesen.grund ?? '' });
  }, [gelesen]);

  const entbehrlich = entwurf?.entbehrlich ?? false;
  const grund = entwurf?.grund ?? '';
  const absendbar = !entbehrlich || grund.trim().length >= 3;

  return {
    isPending: standQuery.isPending,
    isError: standQuery.isError,
    ladeFehlerMeldung: t('geraeteerkennung.entbehrlich.ladeFehler'),
    entbehrlich,
    setzeEntbehrlich: (wert: boolean) => {
      setzeEntwurf({ entbehrlich: wert, grund });
    },
    grund,
    setzeGrund: (wert: string) => {
      setzeEntwurf({ entbehrlich, grund: wert });
    },
    absendbar,
    speichere: () => {
      mutation.mutate({
        systemId,
        eingabe: entbehrlich ? { entbehrlich: true, grund: grund.trim() } : { entbehrlich: false },
      });
    },
    ...mutationViewBasis(mutation, t('geraeteerkennung.entbehrlich.erfolg')),
  };
}
