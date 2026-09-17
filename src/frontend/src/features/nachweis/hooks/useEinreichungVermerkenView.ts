import { useNavigate } from 'react-router-dom';
import {
  EINREICHUNG_ART_WERTE,
  KORREKTUR_GRUND_CODE_WERTE,
  UEBERMITTLUNGSWEG_WERTE,
  einreichungVermerkenFormDefaultValues,
  toEinreichungVermerkenPayload,
  useEinreichungVermerken,
  type EinreichungVermerkenFormValues,
} from '../api';
import { enumSelectOptions, type EntityFormSelectOption } from '../../stammdaten/components/shared';
import { mutationViewBasis, type MutationViewBasis } from '../../stammdaten/hooks/shared/mutationView';
import { einreichungArtLabel, korrekturGrundLabel, uebermittlungswegLabel } from './nachweisFormat';

export interface EinreichungVermerkenView extends MutationViewBasis {
  readonly artOptionen: readonly EntityFormSelectOption[];
  readonly uebermittlungswegOptionen: readonly EntityFormSelectOption[];
  readonly korrekturGrundOptionen: readonly EntityFormSelectOption[];
  readonly defaultValues: EinreichungVermerkenFormValues;
  readonly submit: (values: EinreichungVermerkenFormValues) => void;
}

/**
 * Anzeige-/Aktions-Modell des Formulars „Einreichung vermerken".
 *
 * `jetztIso` wird von außen hereingereicht statt hier gebildet: So bleibt die
 * Vorbelegung des Übermittlungs-Zeitpunkts im Test bestimmbar, und der Wert
 * ändert sich nicht bei jedem Render.
 */
export function useEinreichungVermerkenView(exportId: string, jetztIso: string): EinreichungVermerkenView {
  const navigate = useNavigate();
  const mutation = useEinreichungVermerken();

  return {
    ...mutationViewBasis(mutation),
    artOptionen: enumSelectOptions(EINREICHUNG_ART_WERTE, einreichungArtLabel),
    uebermittlungswegOptionen: enumSelectOptions(UEBERMITTLUNGSWEG_WERTE, uebermittlungswegLabel),
    korrekturGrundOptionen: enumSelectOptions(KORREKTUR_GRUND_CODE_WERTE, korrekturGrundLabel),
    defaultValues: einreichungVermerkenFormDefaultValues(jetztIso),
    submit: (values) => {
      mutation.mutate({ exportId, ...toEinreichungVermerkenPayload(values) }, {
        onSuccess: (einreichung) => {
          void navigate(`/nachweis/einreichungen/${einreichung.id}`);
        },
      });
    },
  };
}
