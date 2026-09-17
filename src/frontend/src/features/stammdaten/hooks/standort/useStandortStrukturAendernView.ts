import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { StandortStruktur, StandortTyp } from '@edms/shared';
import {
  STANDORT_TYP_WERTE,
  STANDORT_WURZEL_TYPEN,
  standortAendernFormSchema,
  standortBaumKey,
  toStandortAendernPayload,
  useStandortAendern,
  type StandortAendernFormValues,
} from '../../api/standort';
import { enumSelectOptions, type EntityFormSelectOption } from '../../components/shared';
import { t } from '../../../../shared/i18n/t';
import { mutationViewBasis, type MutationViewBasis } from '../shared/mutationView';

export interface StandortStrukturAendernView extends MutationViewBasis {
  readonly schema: ReturnType<typeof standortAendernFormSchema>;
  readonly defaultValues: StandortAendernFormValues;
  readonly typOptionen: readonly EntityFormSelectOption[];
  readonly submit: (values: StandortAendernFormValues) => void;
}

function typLabel(typ: StandortTyp): string {
  return t(`stammdaten.common.enums.standortTyp.${typ}`);
}

/**
 * Leitet aus der Standort-Ändern-Mutation (Struktur NUR — `typ`/
 * `sortierung`, D2.6/D5) ein Formular-Anzeige-Modell ab. BEIDE Felder werden
 * immer vorbefüllt+mitgeschickt (s. `standortAendernFormSchema.ts`-Kommentar
 * — erfüllt die Backend-Regel "mindestens ein Feld gesetzt" trivial).
 */
export function useStandortStrukturAendernView(endkundeId: string, knoten: StandortStruktur): StandortStrukturAendernView {
  const istWurzel = knoten.parentId === null;
  const mutation = useStandortAendern();
  const queryClient = useQueryClient();

  const schema = useMemo(() => standortAendernFormSchema(istWurzel), [istWurzel]);
  const typOptionen = useMemo(
    () => enumSelectOptions(istWurzel ? STANDORT_WURZEL_TYPEN : STANDORT_TYP_WERTE, typLabel),
    [istWurzel],
  );

  return {
    schema,
    defaultValues: { typ: knoten.typ, sortierung: String(knoten.sortierung), klimareferenz: knoten.klimareferenz ?? '' },
    typOptionen,
    ...mutationViewBasis(mutation, t('stammdaten.common.erfolg.gespeichert')),
    submit: (values) => {
      mutation.mutate(
        { id: knoten.id, input: toStandortAendernPayload(values) },
        {
          onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: standortBaumKey(endkundeId) });
          },
        },
      );
    },
  };
}
