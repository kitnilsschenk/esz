import {
  nutzungsverhaeltnisBeendenFormDefaultValues,
  toNutzungsverhaeltnisBeendenPayload,
  useNutzungsverhaeltnisBeenden,
  type NutzungsverhaeltnisBeendenFormValues,
} from '../../api/nutzungsverhaeltnis';
import { t } from '../../../../shared/i18n/t';
import { mutationViewBasis, type MutationViewBasis } from '../shared/mutationView';

export interface NutzungsverhaeltnisBeendenView extends MutationViewBasis {
  readonly defaultValues: NutzungsverhaeltnisBeendenFormValues;
  readonly submit: (values: NutzungsverhaeltnisBeendenFormValues) => void;
}

/**
 * Leitet aus der Nutzungsverhältnis-Beenden-Mutation ein reines Anzeige-/
 * Aktions-Modell ab. KEINE Vorbefüllung nötig (`gueltigBis` ist bei einem
 * noch aktiven Verhältnis stets leer — anders als `SystemAendernView`, das
 * bestehende Werte vorbefüllt).
 */
export function useNutzungsverhaeltnisBeendenView(nutzungsverhaeltnisId: string): NutzungsverhaeltnisBeendenView {
  const mutation = useNutzungsverhaeltnisBeenden();

  return {
    defaultValues: nutzungsverhaeltnisBeendenFormDefaultValues,
    ...mutationViewBasis(mutation, t('stammdaten.common.erfolg.beendet')),
    submit: (values) => {
      mutation.mutate({ id: nutzungsverhaeltnisId, input: toNutzungsverhaeltnisBeendenPayload(values) });
    },
  };
}
