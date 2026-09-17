import type { KryptoShreddingAnweisung } from '@edms/shared';
import { useEndkundeShredBeantragen } from '../../api/endkunde';
import { t } from '../../../../shared/i18n/t';
import { mutationViewBasis, type MutationViewBasis } from '../shared/mutationView';

/** Whitelisted Löschgrund (kein Freitext, Linie 2) — abgeleitet aus dem generierten DTO-Feld, keine eigene Schema-Kopie. */
export type KryptoShreddingGrund = KryptoShreddingAnweisung['grund'];

export interface EndkundeShredBeantragenView extends MutationViewBasis {
  readonly beantragen: (grund: KryptoShreddingGrund) => void;
}

/**
 * Leitet aus der Shred-Antrag-Beantragen-Mutation (ADR-0009 §2.2, Vier-Augen
 * Schritt 1 — dieser Schritt selbst ist harmlos, KEINE sofortige Löschung)
 * ein reines Anzeige-/Aktions-Modell ab. `bestaetigung:
 * 'ENDGUELTIG_LOESCHEN'` bleibt bewusst HIER fest verdrahtet (Backend-
 * Pflichtfeld, kein Formularfeld — der eigentliche Fehlbedienungsschutz läuft
 * über den Type-to-confirm-Dialog in `EndkundeShreddenAktion`); `grund` kommt
 * aus der Nutzerauswahl im Dialog. `EndkundeDetailAnsicht` blendet diese
 * Aktion aus, sobald bereits ein offener Antrag existiert
 * (`useEndkundeShredAntragOffenView`) oder der Endkunde bereits geschreddert
 * ist (`useEndkundeDetailView().istGeschreddert`).
 */
export function useEndkundeShredBeantragenView(endkundeId: string): EndkundeShredBeantragenView {
  const mutation = useEndkundeShredBeantragen();

  return {
    ...mutationViewBasis(mutation, t('stammdaten.common.erfolg.beantragt')),
    beantragen: (grund) => {
      mutation.mutate({ endkundeId, bestaetigung: 'ENDGUELTIG_LOESCHEN', grund });
    },
  };
}
