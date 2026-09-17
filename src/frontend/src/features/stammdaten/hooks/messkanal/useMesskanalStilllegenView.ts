import { useMesskanalStilllegen } from '../../api/messkanal';
import { t } from '../../../../shared/i18n/t';
import { mutationViewBasis, type MutationViewBasis } from '../shared/mutationView';

export interface MesskanalStilllegenView extends MutationViewBasis {
  readonly stilllegen: () => void;
}

/**
 * Leitet aus der Messkanal-Stilllegen-Mutation ein reines Anzeige-/Aktions-
 * Modell ab (IDEMPOTENT, kein Hard-Delete, analog `useZaehlerStilllegenView`).
 */
export function useMesskanalStilllegenView(messkanalId: string): MesskanalStilllegenView {
  const mutation = useMesskanalStilllegen();

  return {
    ...mutationViewBasis(mutation, t('stammdaten.common.erfolg.stillgelegt')),
    stilllegen: () => {
      mutation.mutate(messkanalId);
    },
  };
}
