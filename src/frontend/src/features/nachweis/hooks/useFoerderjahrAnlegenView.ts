import { useNavigate } from 'react-router-dom';
import {
  toFoerderjahrAnlegenPayload,
  useFoerderjahrAnlegen,
  type FoerderjahrAnlegenFormValues,
} from '../api';
import { mutationViewBasis, type MutationViewBasis } from '../../stammdaten/hooks/shared/mutationView';

export interface FoerderjahrAnlegenView extends MutationViewBasis {
  readonly submit: (values: FoerderjahrAnlegenFormValues) => void;
}

/**
 * Anzeige-/Aktions-Modell des Förderjahr-Anlegen-Formulars. Nach Erfolg wird
 * auf die Detailseite navigiert — dort steht der nächste Schritt der Kette
 * (Vollständigkeitsprüfung). Deshalb bewusst OHNE `erfolgsMeldung`: Die neue
 * Seite IST die Rückmeldung.
 */
export function useFoerderjahrAnlegenView(): FoerderjahrAnlegenView {
  const navigate = useNavigate();
  const mutation = useFoerderjahrAnlegen();

  return {
    ...mutationViewBasis(mutation),
    submit: (values) => {
      mutation.mutate(toFoerderjahrAnlegenPayload(values), {
        onSuccess: (foerderjahr) => {
          void navigate(`/nachweis/foerderjahre/${foerderjahr.id}`);
        },
      });
    },
  };
}
