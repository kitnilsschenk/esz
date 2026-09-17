import { useNavigate } from 'react-router-dom';
import type { z } from 'zod';
import {
  BETROFFENER_TYP_WERTE,
  QUELLE_TYP_WERTE,
  RECHTSGRUNDLAGE_WERTE,
  einflussgroesseKorrigierenFormDefaultValues,
  einflussgroesseKorrigierenFormSchema,
  toEinflussgroesseKorrigierenPayload,
  useEinflussgroesseKorrigieren,
  type EinflussgroesseKorrigierenFormValues,
  type EinflussWertArt,
} from '../../api/einflussgroesse';
import { enumSelectOptions, type EntityFormSelectOption } from '../../components/shared';
import { t } from '../../../../shared/i18n/t';
import { mutationViewBasis, type MutationViewBasis } from '../shared/mutationView';

export interface EinflussgroesseKorrigierenView extends MutationViewBasis {
  readonly schema: z.ZodType<EinflussgroesseKorrigierenFormValues>;
  readonly defaultValues: EinflussgroesseKorrigierenFormValues;
  readonly submit: (values: EinflussgroesseKorrigierenFormValues) => void;
  readonly betroffenerTypOptionen: readonly EntityFormSelectOption[];
  readonly quelleTypOptionen: readonly EntityFormSelectOption[];
  readonly rechtsgrundlageOptionen: readonly EntityFormSelectOption[];
}

/**
 * View-Model des Korrigieren-Formulars (`EinflussgroesseKorrigierenFormular`).
 * `wertArt` kommt — falls bekannt — aus dem `?groesseCode=`-Query-Parameter,
 * den `EinflussgroesseTabelle`s Korrigieren-Link setzt (s.
 * `einflussgroesseKorrigierenFormSchema.ts`s Kopf-Kommentar); ohne bekannten
 * `wertArt` validiert das Schema nur generisch. Navigiert nach Erfolg zurück
 * zur System-Liste (analog `useEinflussgroesseErfassenView`).
 */
export function useEinflussgroesseKorrigierenView(
  einflussgroesseId: string,
  systemId: string,
  wertArt: EinflussWertArt | undefined,
): EinflussgroesseKorrigierenView {
  const navigate = useNavigate();
  const mutation = useEinflussgroesseKorrigieren();

  return {
    schema: einflussgroesseKorrigierenFormSchema(wertArt),
    defaultValues: einflussgroesseKorrigierenFormDefaultValues,
    ...mutationViewBasis(mutation),
    submit: (values) => {
      mutation.mutate(
        { id: einflussgroesseId, input: toEinflussgroesseKorrigierenPayload(values) },
        {
          onSuccess: () => {
            void navigate(`/stammdaten/systeme/${systemId}/einflussgroessen`);
          },
        },
      );
    },
    betroffenerTypOptionen: enumSelectOptions(BETROFFENER_TYP_WERTE, (wert) => t(`stammdaten.common.enums.einflussBetroffenerTyp.${wert}`)),
    quelleTypOptionen: enumSelectOptions(QUELLE_TYP_WERTE, (wert) => t(`stammdaten.common.enums.einflussQuelleTyp.${wert}`)),
    rechtsgrundlageOptionen: enumSelectOptions(RECHTSGRUNDLAGE_WERTE, (wert) => t(`stammdaten.common.enums.einflussRechtsgrundlage.${wert}`)),
  };
}
