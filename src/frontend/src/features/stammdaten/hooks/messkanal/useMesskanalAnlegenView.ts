import { useNavigate } from 'react-router-dom';
import {
  MESSGROESSE_ART_WERTE,
  MESSRICHTUNG_WERTE,
  toMesskanalAnlegenPayload,
  useMesskanalAnlegen,
  type MesskanalAnlegenFormValues,
} from '../../api/messkanal';
import { enumSelectOptions, type EntityFormSelectOption } from '../../components/shared';
import { t } from '../../../../shared/i18n/t';
import { mutationViewBasis, type MutationViewBasis } from '../shared/mutationView';

export interface MesskanalAnlegenView extends MutationViewBasis {
  readonly artOptionen: readonly EntityFormSelectOption[];
  readonly richtungOptionen: readonly EntityFormSelectOption[];
  readonly submit: (values: MesskanalAnlegenFormValues) => void;
}

/**
 * Leitet aus der Messkanal-Anlegen-Mutation (Sub-Ressource EINES Zählers)
 * ein reines Anzeige-/Aktions-Modell ab. Navigiert nach Erfolg zum
 * Messkanal-Detail (`/stammdaten/messkanaele/:id`, EIGENE Top-Level-Route —
 * nicht zurück zum Zähler).
 */
export function useMesskanalAnlegenView(zaehlerId: string): MesskanalAnlegenView {
  const navigate = useNavigate();
  const mutation = useMesskanalAnlegen();

  const artOptionen = enumSelectOptions(MESSGROESSE_ART_WERTE, (wert) => t(`stammdaten.common.enums.messgroesseArt.${wert}`));
  const richtungOptionen = enumSelectOptions(MESSRICHTUNG_WERTE, (wert) => t(`stammdaten.messkanal.richtung.${wert}`));

  return {
    ...mutationViewBasis(mutation),
    artOptionen,
    richtungOptionen,
    submit: (values) => {
      mutation.mutate(toMesskanalAnlegenPayload(values, zaehlerId), {
        onSuccess: (detail) => {
          void navigate(`/stammdaten/messkanaele/${detail.id}`);
        },
      });
    },
  };
}
