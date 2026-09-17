import {
  MESSRICHTUNG_WERTE,
  toMesskanalAendernPayload,
  useMesskanalAendern,
  useMesskanalDetail,
  type MesskanalAendernFormValues,
} from '../../api/messkanal';
import { enumSelectOptions, type EntityFormSelectOption } from '../../components/shared';
import { t } from '../../../../shared/i18n/t';
import { mutationViewBasis, type MutationViewBasis } from '../shared/mutationView';

export interface MesskanalAendernView extends MutationViewBasis {
  /** `false`, solange das aktuelle Detail (Vorbefüllung) noch nicht geladen ist. */
  readonly isReady: boolean;
  readonly defaultValues: MesskanalAendernFormValues;
  readonly richtungOptionen: readonly EntityFormSelectOption[];
  readonly submit: (values: MesskanalAendernFormValues) => void;
}

/**
 * Leitet aus der Messkanal-Ändern-Mutation ein reines Anzeige-/Aktions-
 * Modell ab — inkl. Vorbefüllung aus dem bereits geladenen Detail (analog
 * `useZaehlerAendernView`).
 */
export function useMesskanalAendernView(messkanalId: string): MesskanalAendernView {
  const detailQuery = useMesskanalDetail(messkanalId);
  const mutation = useMesskanalAendern();
  const detail = detailQuery.data;

  const defaultValues: MesskanalAendernFormValues = detail
    ? {
        einheit: detail.einheit,
        obisKennzahl: detail.obisKennzahl ?? '',
        istUntermessung: detail.istUntermessung,
        richtung: detail.richtung,
      }
    : { einheit: '', obisKennzahl: '', istUntermessung: false, richtung: 'bezug' };

  return {
    isReady: detail !== undefined,
    defaultValues,
    richtungOptionen: enumSelectOptions(MESSRICHTUNG_WERTE, (wert) => t(`stammdaten.messkanal.richtung.${wert}`)),
    ...mutationViewBasis(mutation, t('stammdaten.common.erfolg.gespeichert')),
    submit: (values) => {
      mutation.mutate({ id: messkanalId, input: toMesskanalAendernPayload(values) });
    },
  };
}
