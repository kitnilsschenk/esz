import type { EinschraenkungGrund } from '@edms/shared';
import { useAnschlussnutzerSperren } from '../../api/anschlussnutzer';
import { t } from '../../../../shared/i18n/t';
import { mutationViewBasis, type MutationViewBasis } from '../shared/mutationView';

export interface AnschlussnutzerSperrenView extends MutationViewBasis {
  /**
   * `neuerhebungFortsetzen` (Auflage C-8) wird NUR bei lit. b / lit. d
   * mitgegeben — bei lit. a / lit. c weist der Server eine Angabe mit 400
   * zurueck, weil sich die Frage dort nicht stellt.
   */
  readonly sperren: (grund: EinschraenkungGrund, neuerhebungFortsetzen?: boolean) => void;
}

/**
 * Aktions-Modell fuer die Art.-18-Sperre des Anschlussnutzers (ADR-0007
 * A11.6) — wortgleich zu `useEndkundeSperrenView`, inklusive der Entscheidung
 * gegen einen Vorgabewert fuer den Grund.
 */
export function useAnschlussnutzerSperrenView(anschlussnutzerId: string): AnschlussnutzerSperrenView {
  const mutation = useAnschlussnutzerSperren();

  return {
    ...mutationViewBasis(mutation, t('stammdaten.common.erfolg.gesperrt')),
    sperren: (grund, neuerhebungFortsetzen) => {
      mutation.mutate({
        id: anschlussnutzerId,
        input: neuerhebungFortsetzen === undefined ? { grund } : { grund, neuerhebungFortsetzen },
      });
    },
  };
}
