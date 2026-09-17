import { useQueryClient } from '@tanstack/react-query';
import type { ApiProblemError } from '@edms/shared';
import { standortBaumKey, toStandortStilllegenPayload, useStandortStilllegen, type StandortStilllegenFormValues } from '../../api/standort';
import { t } from '../../../../shared/i18n/t';
import { mutationViewBasis, toSubmitErrorMessage, type MutationViewBasis } from '../shared/mutationView';

export interface StandortStilllegenView extends MutationViewBasis {
  readonly stilllegen: (values: StandortStilllegenFormValues) => void;
}

/**
 * Der 409-Sonderfall bleibt hier lokal: Der Server begründet die Ablehnung
 * mit ADR-Abschnittsverweisen ("D2.6(a)/(b)"), die im `detail` stehen und für
 * Betriebs-Personal unbrauchbar sind. Jeder ANDERE Fehler läuft über die
 * geteilte `toSubmitErrorMessage` (`hooks/shared/mutationView.ts`).
 */
function toStandortFehlermeldung(error: ApiProblemError | null): string | undefined {
  if (error !== null && error.status === 409) {
    return t('stammdaten.standort.form.errors.stilllegenKonflikt');
  }
  return toSubmitErrorMessage(error);
}

/**
 * Leitet aus der Standort-Stilllegen-Mutation (D2.6, IDEMPOTENT, KEIN
 * Hard-Delete) ein Anzeige-/Aktions-Modell ab. Vorbedingungen (keine aktiven
 * Kinder, keine offene Zähler-Verortung) prüft der Server — bei Verstoß 409,
 * hier auf eine verständliche deutsche Meldung gemappt statt des rohen
 * `error.detail`-Texts (der ADR-Abschnittsverweise wie "D2.6(a)/(b)" enthält).
 */
export function useStandortStilllegenView(endkundeId: string, standortId: string, onErfolg: () => void): StandortStilllegenView {
  const mutation = useStandortStilllegen();
  const queryClient = useQueryClient();

  return {
    ...mutationViewBasis(mutation, t('stammdaten.common.erfolg.stillgelegt')),
    submitErrorMessage: toStandortFehlermeldung(mutation.error),
    stilllegen: (values) => {
      mutation.mutate(
        { id: standortId, input: toStandortStilllegenPayload(values) },
        {
          onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: standortBaumKey(endkundeId) });
            onErfolg();
          },
        },
      );
    },
  };
}
