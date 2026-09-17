import type { EinschraenkungGrund } from '@edms/shared';
import { useEndkundeSperren } from '../../api/endkunde';
import { t } from '../../../../shared/i18n/t';
import { mutationViewBasis, type MutationViewBasis } from '../shared/mutationView';

export interface EndkundeSperrenView extends MutationViewBasis {
  /**
   * `neuerhebungFortsetzen` (Auflage C-8) wird NUR bei lit. b / lit. d
   * mitgegeben — bei lit. a / lit. c weist der Server eine Angabe mit 400
   * zurueck, weil sich die Frage dort nicht stellt.
   */
  readonly sperren: (grund: EinschraenkungGrund, neuerhebungFortsetzen?: boolean) => void;
}

/**
 * Leitet aus der Endkunde-Sperren-Mutation ein reines Anzeige-/Aktions-Modell
 * ab (Art. 18, KEIN Hard-Delete).
 *
 * Der Einschraenkungsgrund ist Pflicht (ADR-0007 A11.1) und wird von der
 * Aktions-Komponente durchgereicht — es gibt bewusst KEINEN Vorgabewert:
 * welcher der vier Tatbestaende vorliegt, ist eine fachliche Feststellung des
 * Sachbearbeiters, kein Formular-Default.
 *
 * `EndkundeDetailAnsicht` blendet die Aktion aus, sobald der Endkunde bereits
 * gesperrt ODER geschreddert ist (`useEndkundeDetailView().istGesperrt` /
 * `.istGeschreddert`) — ein erneutes Sperren mit abweichendem Grund wuerde
 * serverseitig ohnehin mit 409 abgelehnt.
 */
export function useEndkundeSperrenView(endkundeId: string): EndkundeSperrenView {
  const mutation = useEndkundeSperren();

  return {
    ...mutationViewBasis(mutation, t('stammdaten.common.erfolg.gesperrt')),
    sperren: (grund, neuerhebungFortsetzen) => {
      mutation.mutate({
        id: endkundeId,
        input: neuerhebungFortsetzen === undefined ? { grund } : { grund, neuerhebungFortsetzen },
      });
    },
  };
}
