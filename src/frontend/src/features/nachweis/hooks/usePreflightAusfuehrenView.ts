import { useNavigate } from 'react-router-dom';
import { usePreflightAusfuehren } from '../api';
import { mutationViewBasis, type MutationViewBasis } from '../../stammdaten/hooks/shared/mutationView';

export interface PreflightAusfuehrenView extends MutationViewBasis {
  readonly ausfuehren: () => void;
}

/**
 * Anzeige-/Aktions-Modell der Aktion „Vollständigkeit prüfen" auf der
 * Förderjahr-Detailseite.
 *
 * Die Prüfung ist wiederholbar und legt bei jedem Aufruf einen NEUEN,
 * eigenständigen Datensatz an — es gibt also kein „schon geprüft, Knopf
 * ausblenden". Nach Erfolg wird auf die Detailseite genau dieses Laufs
 * navigiert; deshalb ohne `erfolgsMeldung` (die neue Seite ist die
 * Rückmeldung, und nur dort stehen die Befunde).
 */
export function usePreflightAusfuehrenView(foerderjahrId: string): PreflightAusfuehrenView {
  const navigate = useNavigate();
  const mutation = usePreflightAusfuehren();

  return {
    ...mutationViewBasis(mutation),
    ausfuehren: () => {
      mutation.mutate(
        { foerderjahrId },
        {
          onSuccess: (ergebnis) => {
            void navigate(`/nachweis/preflights/${ergebnis.preflight.id}`);
          },
        },
      );
    },
  };
}
