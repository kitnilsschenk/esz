import { useNavigate } from 'react-router-dom';
import { toEndkundeAnlegenPayload, useEndkundeAnlegen, type EndkundeFormValues } from '../../api/endkunde';
import { mutationViewBasis, type MutationViewBasis } from '../shared/mutationView';

export interface EndkundeAnlegenView extends MutationViewBasis {
  readonly submit: (values: EndkundeFormValues) => void;
}

/**
 * Leitet aus der Endkunde-Anlegen-Mutation ein reines Anzeige-/Aktions-
 * Modell ab: Submit-Fehler als Anzeigetext, Navigation zum neu angelegten
 * Endkunden-Detail nach Erfolg (analog `useAuthStatusView`).
 */
export function useEndkundeAnlegenView(): EndkundeAnlegenView {
  const navigate = useNavigate();
  const mutation = useEndkundeAnlegen();

  return {
    ...mutationViewBasis(mutation),
    submit: (values) => {
      mutation.mutate(toEndkundeAnlegenPayload(values), {
        onSuccess: (detail) => {
          // `navigate(...)` ist bei Data-Routern (View-Transitions) mit
          // `Promise<void>` typisiert — hier ohne Data-Router (`BrowserRouter`)
          // stets synchron; `void` markiert das bewusste Nicht-Abwarten.
          void navigate(`/stammdaten/endkunden/${detail.id}`);
        },
      });
    },
  };
}
