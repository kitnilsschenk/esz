import { useNavigate } from 'react-router-dom';
import {
  NACHWEIS_EXPORT_ZWECK_WERTE,
  toNachweisExportErzeugenPayload,
  useNachweisExportErzeugen,
  type NachweisExportErzeugenFormValues,
} from '../api';
import { enumSelectOptions, type EntityFormSelectOption } from '../../stammdaten/components/shared';
import { mutationViewBasis, type MutationViewBasis } from '../../stammdaten/hooks/shared/mutationView';
import { exportZweckLabel } from './nachweisFormat';

export interface NachweisExportErzeugenView extends MutationViewBasis {
  readonly zweckOptionen: readonly EntityFormSelectOption[];
  readonly submit: (values: NachweisExportErzeugenFormValues) => void;
}

/**
 * Anzeige-/Aktions-Modell der Aktion „Export erzeugen" auf der
 * Einspar-Lauf-Detailseite. Nach Erfolg wird auf die Export-Detailseite
 * navigiert — dort stehen Dateiliste, Prüfsummen und der nächste Schritt
 * (Einreichung vermerken); deshalb ohne `erfolgsMeldung`.
 *
 * Die Auswahl der Zwecke stammt aus `NACHWEIS_EXPORT_ZWECK_WERTE` und ist
 * bewusst kürzer als die Werteliste der Schnittstelle — die Begründung steht
 * im Kopf von `nachweisExportFormSchema.ts`.
 */
export function useNachweisExportErzeugenView(einsparlaufId: string): NachweisExportErzeugenView {
  const navigate = useNavigate();
  const mutation = useNachweisExportErzeugen();

  return {
    ...mutationViewBasis(mutation),
    zweckOptionen: enumSelectOptions(NACHWEIS_EXPORT_ZWECK_WERTE, exportZweckLabel),
    submit: (values) => {
      mutation.mutate({ einsparlaufId, ...toNachweisExportErzeugenPayload(values) }, {
        onSuccess: (exportKopf) => {
          void navigate(`/nachweis/exporte/${exportKopf.id}`);
        },
      });
    },
  };
}
