import { useNavigate } from 'react-router-dom';
import {
  ENERGIETRAEGER_WERTE,
  MESSKONZEPT_TYP_WERTE,
  toMesskonzeptVersionAnlegenPayload,
  useMesskonzeptVersionAnlegen,
  type MesskonzeptVersionAnlegenFormValues,
} from '../../api/messkonzept';
import { enumSelectOptions, type EntityFormSelectOption } from '../../components/shared';
import { t } from '../../../../shared/i18n/t';
import { mutationViewBasis, type MutationViewBasis } from '../shared/mutationView';

export interface MesskonzeptVersionAnlegenView extends MutationViewBasis {
  readonly typOptionen: readonly EntityFormSelectOption[];
  readonly energietraegerOptionen: readonly EntityFormSelectOption[];
  readonly submit: (values: MesskonzeptVersionAnlegenFormValues) => void;
}

/**
 * Leitet aus der Messkonzept-Version-Anlegen-Mutation (Sub-Ressource EINES
 * Endkunden) ein reines Anzeige-/Aktions-Modell ab — inkl. der beiden festen
 * Enum-Optionslisten (Typ/Energieträger, `enumSelectOptions`, analog
 * `useMesskanalAnlegenView`). Navigiert nach Erfolg zur neu angelegten
 * Version (append-only — die neue Version ist immer die aktuelle).
 */
export function useMesskonzeptVersionAnlegenView(endkundeId: string): MesskonzeptVersionAnlegenView {
  const navigate = useNavigate();
  const mutation = useMesskonzeptVersionAnlegen();

  const typOptionen = enumSelectOptions(MESSKONZEPT_TYP_WERTE, (wert) => t(`stammdaten.common.enums.messkonzeptTyp.${wert}`));
  const energietraegerOptionen = enumSelectOptions(ENERGIETRAEGER_WERTE, (wert) => t(`stammdaten.common.enums.energietraeger.${wert}`));

  return {
    ...mutationViewBasis(mutation),
    typOptionen,
    energietraegerOptionen,
    submit: (values) => {
      mutation.mutate(
        { ...toMesskonzeptVersionAnlegenPayload(values), endkundeId },
        {
          onSuccess: (detail) => {
            void navigate(`/stammdaten/endkunden/${endkundeId}/messkonzept/versionen/${String(detail.versionNr)}`);
          },
        },
      );
    },
  };
}
