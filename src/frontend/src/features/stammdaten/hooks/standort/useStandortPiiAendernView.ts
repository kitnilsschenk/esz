import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { StandortStruktur } from '@edms/shared';
import {
  standortLabelsKeyPraefix,
  standortPiiAendernFormSchema,
  toStandortPiiAendernPayload,
  useStandortPiiAendern,
  type StandortPiiAendernFormValues,
} from '../../api/standort';
import { t } from '../../../../shared/i18n/t';
import { mutationViewBasis, type MutationViewBasis } from '../shared/mutationView';

export interface StandortPiiAendernView extends MutationViewBasis {
  readonly schema: ReturnType<typeof standortPiiAendernFormSchema>;
  readonly defaultValues: StandortPiiAendernFormValues;
  readonly submit: (values: StandortPiiAendernFormValues) => void;
}

/**
 * Leitet aus der Standort-PII-Ändern-Mutation (Vollersatz, D4/D5) ein
 * Formular-Anzeige-Modell ab. `aktuelleBezeichnung`/`aktuelleAnschrift`
 * kommen vom AUFRUFER (bereits über den Label-Batch entschlüsselt, s.
 * `useStandortBaumView`) — dieser Hook entschlüsselt/liest selbst nichts.
 * `geo` wird NIE vorbefüllt: es gibt keine Lesestufe, die einen bereits
 * hinterlegten Geo-Wert zurückgibt (`StandortLabelItem` kennt nur
 * `bezeichnung`/`anschrift`, D5) — die aufrufende Komponente zeigt deshalb
 * IMMER einen Hinweis, dass ein leer gelassenes Geo-Feld eine ggf.
 * vorhandene Angabe löscht (Vollersatz-Semantik).
 */
export function useStandortPiiAendernView(
  endkundeId: string,
  knoten: StandortStruktur,
  aktuelleBezeichnung: string,
  aktuelleAnschrift: string | null,
  onErfolg: () => void,
): StandortPiiAendernView {
  const istWurzel = knoten.parentId === null;
  const mutation = useStandortPiiAendern();
  const queryClient = useQueryClient();

  const schema = useMemo(() => standortPiiAendernFormSchema(knoten.typ, istWurzel), [knoten.typ, istWurzel]);

  return {
    schema,
    defaultValues: { bezeichnung: aktuelleBezeichnung, adresse: aktuelleAnschrift ?? '', geo: '' },
    ...mutationViewBasis(mutation, t('stammdaten.common.erfolg.gespeichert')),
    submit: (values) => {
      mutation.mutate(
        { id: knoten.id, input: toStandortPiiAendernPayload(values) },
        {
          onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: standortLabelsKeyPraefix(endkundeId) });
            onErfolg();
          },
        },
      );
    },
  };
}
