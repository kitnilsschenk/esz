import { useZaehlerStilllegen } from '../../api/zaehler';
import { t } from '../../../../shared/i18n/t';
import { mutationViewBasis, type MutationViewBasis } from '../shared/mutationView';

export interface ZaehlerStilllegenView extends MutationViewBasis {
  readonly stilllegen: () => void;
}

/**
 * Leitet aus der Zähler-Stilllegen-Mutation ein reines Anzeige-/Aktions-Modell
 * ab (IDEMPOTENT, `status=stillgelegt`, kein Hard-Delete). Der Aufrufer
 * (`ZaehlerDetailAnsicht`) blendet die Aktion aus, sobald der Zähler bereits
 * stillgelegt ist (`useZaehlerDetailView().istStillgelegt`).
 */
export function useZaehlerStilllegenView(zaehlerId: string): ZaehlerStilllegenView {
  const mutation = useZaehlerStilllegen();

  return {
    ...mutationViewBasis(mutation, t('stammdaten.common.erfolg.stillgelegt')),
    stilllegen: () => {
      mutation.mutate(zaehlerId);
    },
  };
}
