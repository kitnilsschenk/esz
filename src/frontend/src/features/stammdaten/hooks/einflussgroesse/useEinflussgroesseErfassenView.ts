import { useNavigate } from 'react-router-dom';
import {
  ANLASS_CODE_WERTE,
  BETROFFENER_TYP_WERTE,
  EINFLUSS_KATALOG,
  QUELLE_TYP_WERTE,
  RECHTSGRUNDLAGE_WERTE,
  einflussgroesseErfassenFormDefaultValues,
  einflussgroesseErfassenFormSchema,
  toEinflussgroesseErfassenPayload,
  useEinflussgroesseErfassen,
  type EinflussgroesseErfassenFormValues,
} from '../../api/einflussgroesse';
import { enumSelectOptions, type EntityFormSelectOption } from '../../components/shared';
import { groesseCodeLabel } from './einflussgroesseFormat';
import { t } from '../../../../shared/i18n/t';
import { mutationViewBasis, type MutationViewBasis } from '../shared/mutationView';

export interface EinflussgroesseErfassenView extends MutationViewBasis {
  readonly schema: typeof einflussgroesseErfassenFormSchema;
  readonly defaultValues: EinflussgroesseErfassenFormValues;
  readonly submit: (values: EinflussgroesseErfassenFormValues) => void;
  readonly groesseCodeOptionen: readonly EntityFormSelectOption[];
  readonly betroffenerTypOptionen: readonly EntityFormSelectOption[];
  readonly quelleTypOptionen: readonly EntityFormSelectOption[];
  readonly rechtsgrundlageOptionen: readonly EntityFormSelectOption[];
  readonly anlassCodeOptionen: readonly EntityFormSelectOption[];
}

/**
 * View-Model des Erfassen-Formulars (`EinflussgroesseErfassenFormular`).
 * Navigiert nach Erfolg zurück zur (CTA-gegateten) System-Liste — löst dort
 * KEINEN automatischen Klartext-Aufruf aus (die Liste bleibt hinter ihrem
 * eigenen CTA, `useEinflussgroesseListeView`).
 */
export function useEinflussgroesseErfassenView(systemId: string): EinflussgroesseErfassenView {
  const navigate = useNavigate();
  const mutation = useEinflussgroesseErfassen();

  return {
    schema: einflussgroesseErfassenFormSchema,
    defaultValues: einflussgroesseErfassenFormDefaultValues,
    ...mutationViewBasis(mutation),
    submit: (values) => {
      mutation.mutate(
        { systemId, ...toEinflussgroesseErfassenPayload(values) },
        {
          onSuccess: () => {
            void navigate(`/stammdaten/systeme/${systemId}/einflussgroessen`);
          },
        },
      );
    },
    groesseCodeOptionen: EINFLUSS_KATALOG.map((eintrag) => ({ value: eintrag.code, label: groesseCodeLabel(eintrag.code) })),
    betroffenerTypOptionen: enumSelectOptions(BETROFFENER_TYP_WERTE, (wert) => t(`stammdaten.common.enums.einflussBetroffenerTyp.${wert}`)),
    quelleTypOptionen: enumSelectOptions(QUELLE_TYP_WERTE, (wert) => t(`stammdaten.common.enums.einflussQuelleTyp.${wert}`)),
    rechtsgrundlageOptionen: enumSelectOptions(RECHTSGRUNDLAGE_WERTE, (wert) => t(`stammdaten.common.enums.einflussRechtsgrundlage.${wert}`)),
    anlassCodeOptionen: enumSelectOptions(ANLASS_CODE_WERTE, (wert) => t(`stammdaten.common.enums.einflussAnlassCode.${wert}`)),
  };
}
