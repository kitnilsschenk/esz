import { useSystemStilllegen } from '../../api/system';
import { t } from '../../../../shared/i18n/t';
import { mutationViewBasis, type MutationViewBasis } from '../shared/mutationView';

export interface SystemStilllegenView extends MutationViewBasis {
  readonly stilllegen: () => void;
}

/**
 * Leitet aus der System-Stilllegen-Mutation ein reines Anzeige-/Aktions-Modell
 * ab (IDEMPOTENT, `status=stillgelegt`, kein Hard-Delete — analog
 * `useZaehlerStilllegenView`). Der Aufrufer (`SystemDetailAnsicht`) blendet
 * die Aktion aus, sobald das System bereits stillgelegt ist
 * (`useSystemDetailView().istStillgelegt`).
 */
export function useSystemStilllegenView(systemId: string): SystemStilllegenView {
  const mutation = useSystemStilllegen();

  return {
    ...mutationViewBasis(mutation, t('stammdaten.common.erfolg.stillgelegt')),
    stilllegen: () => {
      mutation.mutate(systemId);
    },
  };
}
