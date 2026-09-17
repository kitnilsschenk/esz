import { useQueryClient } from '@tanstack/react-query';
import type { ApiProblemError } from '@edms/shared';
import { standortBaumKey, useStandortLoeschen } from '../../api/standort';
import { t } from '../../../../shared/i18n/t';
import { mutationViewBasis, toSubmitErrorMessage, type MutationViewBasis } from '../shared/mutationView';

export interface StandortLoeschenView extends MutationViewBasis {
  readonly loeschen: () => void;
}

/**
 * Der 409-Sonderfall bleibt hier lokal: Der Server begründet die Ablehnung
 * mit ADR-Abschnittsverweisen ("D2.6(a)/(b)"), die im `detail` stehen und für
 * Betriebs-Personal unbrauchbar sind. Jeder ANDERE Fehler läuft über die
 * geteilte `toSubmitErrorMessage` (`hooks/shared/mutationView.ts`).
 */
function toStandortFehlermeldung(error: ApiProblemError | null): string | undefined {
  if (error !== null && error.status === 409) {
    return t('stammdaten.standort.form.errors.loeschenKonflikt');
  }
  return toSubmitErrorMessage(error);
}

/**
 * Leitet aus der Standort-Hart-Löschen-Mutation (D2.6, "Korrektur von
 * Fehlanlagen" — NUR Blattknoten ohne Verortungshistorie) ein Anzeige-/
 * Aktions-Modell ab. Verstöße meldet der Server mit 409 — hier auf eine
 * verständliche deutsche Meldung gemappt (nicht den rohen `error.detail`-Text).
 */
export function useStandortLoeschenView(endkundeId: string, standortId: string, onErfolg: () => void): StandortLoeschenView {
  const mutation = useStandortLoeschen();
  const queryClient = useQueryClient();

  return {
    ...mutationViewBasis(mutation, t('stammdaten.common.erfolg.geloescht')),
    submitErrorMessage: toStandortFehlermeldung(mutation.error),
    loeschen: () => {
      mutation.mutate(standortId, {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: standortBaumKey(endkundeId) });
          onErfolg();
        },
      });
    },
  };
}
