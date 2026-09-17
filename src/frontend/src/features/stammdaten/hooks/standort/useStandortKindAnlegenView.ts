import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { StandortTyp } from '@edms/shared';
import {
  STANDORT_TYP_WERTE,
  STANDORT_WURZEL_TYPEN,
  standortAnlegenFormSchema,
  standortAnlegenFormDefaultValues,
  standortBaumKey,
  toStandortAnlegenPayload,
  useStandortAnlegen,
  type StandortAnlegenFormValues,
} from '../../api/standort';
import { enumSelectOptions, type EntityFormSelectOption } from '../../components/shared';
import { t } from '../../../../shared/i18n/t';
import { mutationViewBasis, type MutationViewBasis } from '../shared/mutationView';

export interface StandortKindAnlegenView extends MutationViewBasis {
  /** `true`, wenn `parentId === null` (Wurzel-Anlage — D2.4 beschränkt den Typ auf `liegenschaft`/`gebaeude`). */
  readonly istWurzel: boolean;
  readonly schema: ReturnType<typeof standortAnlegenFormSchema>;
  readonly defaultValues: StandortAnlegenFormValues;
  readonly typOptionen: readonly EntityFormSelectOption[];
  readonly adresseHinweis: string;
  readonly submit: (values: StandortAnlegenFormValues) => void;
}

function typLabel(typ: StandortTyp): string {
  return t(`stammdaten.common.enums.standortTyp.${typ}`);
}

/**
 * Leitet aus der Standort-Anlegen-Mutation ein reines Formular-Anzeige-
 * Modell ab — deckt BEIDE Einstiegspunkte ab: „Wurzel anlegen" (`parentId
 * === null`, D2.4: nur `liegenschaft`/`gebaeude`) UND „Kind anlegen" unter
 * einem beliebigen bestehenden Knoten (alle 6 Typen, D2.5: Abfolge ist
 * NUR Vorschlag — s. `adresseHinweis`/Typ-Optionen-Reihenfolge, keine
 * erzwungene Ebenen-Matrix). Invalidiert nach Erfolg gezielt den Baum-Query-
 * Schlüssel DIESES Endkunden (die geteilte `createAnlegenMutation`-Fabrik
 * kennt nur die generische `standort`-Listen-Invalidierung, die für den
 * nicht-cursor-paginierten Baum-Schlüssel nicht greift, s.
 * `useStandortAnlegen.ts`-Klassen-Dok).
 */
export function useStandortKindAnlegenView(endkundeId: string, parentId: string | null, onErfolg: (standortId: string) => void): StandortKindAnlegenView {
  const istWurzel = parentId === null;
  const mutation = useStandortAnlegen();
  const queryClient = useQueryClient();

  const schema = useMemo(() => standortAnlegenFormSchema(istWurzel), [istWurzel]);
  const typOptionen = useMemo(
    () => enumSelectOptions(istWurzel ? STANDORT_WURZEL_TYPEN : STANDORT_TYP_WERTE, typLabel),
    [istWurzel],
  );

  return {
    istWurzel,
    schema,
    defaultValues: standortAnlegenFormDefaultValues(),
    typOptionen,
    adresseHinweis: istWurzel
      ? t('stammdaten.standort.form.adresseHinweisWurzel')
      : t('stammdaten.standort.form.adresseHinweisKind'),
    ...mutationViewBasis(mutation, t('stammdaten.common.erfolg.angelegt')),
    submit: (values) => {
      mutation.mutate(toStandortAnlegenPayload(values, { endkundeId, parentId }), {
        onSuccess: (ergebnis) => {
          void queryClient.invalidateQueries({ queryKey: standortBaumKey(endkundeId) });
          onErfolg(ergebnis.id);
        },
      });
    },
  };
}
