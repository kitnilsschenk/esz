import type { MesswertRohPunkt } from '@edms/shared';
import {
  messkanalLastgangFormDefaultValues,
  messkanalLastgangFormSchema,
  toMesskanalZeitreiheAnfrage,
  useMesskanalZeitreiheLesen,
  type MesskanalLastgangFormValues,
} from '../../api/verbrauch';
import { mutationViewBasis, type MutationViewBasis } from '../shared/mutationView';

export interface MesskanalLastgangView extends MutationViewBasis {
  readonly schema: typeof messkanalLastgangFormSchema;
  readonly defaultValues: MesskanalLastgangFormValues;
  readonly submit: (values: MesskanalLastgangFormValues) => void;
  readonly hatErgebnis: boolean;
  readonly zeilen: readonly MesswertRohPunkt[];
  readonly istLeer: boolean;
}

/**
 * View-Model des break-glass-CTAs „Lastgang ansehen" (`MesskanalLastgangDialog`,
 * Betriebs-UI-Konzept Punkt 3.4). Kapselt die auf Anfrage (NICHT automatisch)
 * ausgelöste Route-B-Abfrage — vor dem ersten `submit` gibt es bewusst KEIN
 * Ergebnis (`hatErgebnis: false`), das Dauer-Diagramm-Verbot (DS-07) gilt
 * damit auch für den View-Model-Zustand selbst.
 */
export function useMesskanalLastgangView(messkanalId: string, zaehlerId: string): MesskanalLastgangView {
  const mutation = useMesskanalZeitreiheLesen();

  return {
    schema: messkanalLastgangFormSchema,
    defaultValues: messkanalLastgangFormDefaultValues,
    ...mutationViewBasis(mutation),
    submit: (values) => {
      mutation.mutate({ messkanalId, anfrage: toMesskanalZeitreiheAnfrage(values, { zaehlerId }) });
    },
    hatErgebnis: mutation.isSuccess,
    zeilen: mutation.data?.werte ?? [],
    istLeer: mutation.isSuccess && (mutation.data?.werte.length ?? 0) === 0,
  };
}
