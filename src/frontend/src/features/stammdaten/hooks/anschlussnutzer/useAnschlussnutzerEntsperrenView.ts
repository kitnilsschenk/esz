import { useAnschlussnutzerUnterrichtung, useAnschlussnutzerEntsperren } from '../../api/anschlussnutzer';
import { t } from '../../../../shared/i18n/t';
import { mutationViewBasis, type MutationViewBasis } from '../shared/mutationView';
import type { UnterrichtungKanal } from '../shared/unterrichtungKanal';

export interface AnschlussnutzerEntsperrenView {
  readonly unterrichtung: MutationViewBasis & { readonly unterrichten: (kanal: UnterrichtungKanal) => void };
  readonly aufhebung: MutationViewBasis & { readonly entsperren: () => void };
}

/**
 * Der zweistufige Entsperr-Vorgang (Art. 18 Abs. 3 DSGVO, ADR-0007 A11.10).
 *
 * BEWUSST zwei getrennte Mutations-Zustaende statt eines gemeinsamen: die
 * Schritte koennen einzeln fehlschlagen, und der zweite scheitert
 * fail-closed, solange der erste fehlt. Ein zusammengefasster Zustand wuerde
 * genau diese Unterscheidung verwischen — der Sachbearbeiter saehe „Fehler",
 * ohne zu erkennen, WELCHER Schritt offen ist.
 *
 * Ob unterrichtet wurde, entscheidet ausschliesslich der Server; die
 * Oberflaeche zeigt den Stand nur an.
 */
export function useAnschlussnutzerEntsperrenView(anschlussnutzerId: string): AnschlussnutzerEntsperrenView {
  const unterrichtungMutation = useAnschlussnutzerUnterrichtung();
  const aufhebungMutation = useAnschlussnutzerEntsperren();

  return {
    unterrichtung: {
      ...mutationViewBasis(unterrichtungMutation, t('stammdaten.common.einschraenkungAufhebung.unterrichtungErfolg')),
      unterrichten: (kanal) => {
        unterrichtungMutation.mutate({ id: anschlussnutzerId, input: { kanal } });
      },
    },
    aufhebung: {
      ...mutationViewBasis(aufhebungMutation, t('stammdaten.common.einschraenkungAufhebung.aufhebungErfolg')),
      entsperren: () => {
        aufhebungMutation.mutate(anschlussnutzerId);
      },
    },
  };
}
