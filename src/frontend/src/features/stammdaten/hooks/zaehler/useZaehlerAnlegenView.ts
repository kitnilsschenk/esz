import { useNavigate } from 'react-router-dom';
import { useSystemeListe } from '../../api/system';
import { ENERGIETRAEGER_WERTE, toZaehlerAnlegenPayload, useZaehlerAnlegen, type ZaehlerAnlegenFormValues } from '../../api/zaehler';
import { enumSelectOptions, kurzId, type EntityFormSelectOption } from '../../components/shared';
import { t } from '../../../../shared/i18n/t';
import { mutationViewBasis, type MutationViewBasis } from '../shared/mutationView';
import { REFERENZ_OPTIONEN_LIMIT, referenzOptionen } from '../shared/referenzOptionen';

export interface ZaehlerAnlegenView extends MutationViewBasis {
  /** Fremdschlüssel-Auswahl `systemId` (Referenz-Auswahl, ADR-0008 §23 / D11 Pass 1). */
  readonly systemOptionen: readonly EntityFormSelectOption[];
  /** Sichtbarer Hinweis, wenn die Auswahl serverseitig gekürzt ist (`referenzOptionen`), sonst `undefined`. */
  readonly systemOptionenHinweis: string | undefined;
  readonly energietraegerOptionen: readonly EntityFormSelectOption[];
  readonly submit: (values: ZaehlerAnlegenFormValues) => void;
}

/**
 * Leitet aus der Zähler-Anlegen-Mutation ein reines Anzeige-/Aktions-Modell
 * ab (analog `useSystemAnlegenView`) — inkl. der System-Optionsliste für das
 * Fremdschlüssel-Auswahlfeld `systemId` (bis zu 100 Systeme, KEINE
 * serverseitige Suche/Autocomplete in diesem Pass — offener Punkt) sowie der
 * festen Energieträger-Enum-Optionen.
 */
export function useZaehlerAnlegenView(): ZaehlerAnlegenView {
  const navigate = useNavigate();
  const mutation = useZaehlerAnlegen();
  const systemeQuery = useSystemeListe({}, { limit: REFERENZ_OPTIONEN_LIMIT });

  const systemReferenz = referenzOptionen(systemeQuery, (item) => ({
    value: item.id,
    label: `${item.bezeichnung} (${kurzId(item.id)})`,
  }));

  const energietraegerOptionen = enumSelectOptions(ENERGIETRAEGER_WERTE, (wert) =>
    t(`stammdaten.common.enums.energietraeger.${wert}`),
  );

  return {
    ...mutationViewBasis(mutation),
    systemOptionen: systemReferenz.optionen,
    systemOptionenHinweis: systemReferenz.hinweis,
    energietraegerOptionen,
    submit: (values) => {
      mutation.mutate(toZaehlerAnlegenPayload(values), {
        onSuccess: (detail) => {
          void navigate(`/stammdaten/zaehler/${detail.id}`);
        },
      });
    },
  };
}
