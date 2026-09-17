import { toZaehlerAendernPayload, useZaehlerAendern, useZaehlerDetail, type ZaehlerAendernFormValues } from '../../api/zaehler';
import { t } from '../../../../shared/i18n/t';
import { mutationViewBasis, type MutationViewBasis } from '../shared/mutationView';

export interface ZaehlerAendernView extends MutationViewBasis {
  /** `false`, solange das aktuelle Detail (Vorbefüllung) noch nicht geladen ist. */
  readonly isReady: boolean;
  readonly defaultValues: ZaehlerAendernFormValues;
  readonly submit: (values: ZaehlerAendernFormValues) => void;
}

/**
 * Leitet aus der Zähler-Ändern-Mutation ein reines Anzeige-/Aktions-Modell
 * ab — inkl. Vorbefüllung aus dem bereits geladenen Detail (analog
 * `useSystemAendernView`, teilt sich den TanStack-Query-Cache-Eintrag mit
 * `useZaehlerDetailView`).
 */
export function useZaehlerAendernView(zaehlerId: string): ZaehlerAendernView {
  const detailQuery = useZaehlerDetail(zaehlerId);
  const mutation = useZaehlerAendern();
  const detail = detailQuery.data;

  const defaultValues: ZaehlerAendernFormValues = detail ? { geraetetyp: detail.geraetetyp } : { geraetetyp: '' };

  return {
    isReady: detail !== undefined,
    defaultValues,
    ...mutationViewBasis(mutation, t('stammdaten.common.erfolg.gespeichert')),
    submit: (values) => {
      mutation.mutate({ id: zaehlerId, input: toZaehlerAendernPayload(values) });
    },
  };
}
