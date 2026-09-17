import { useNavigate } from 'react-router-dom';
import { useEndkundenListe } from '../../api/endkunde';
import { useSystemeListe } from '../../api/system';
// `useAnschlussnutzerListe` (VOLLE Feature-Slice, Phase 4c Pass 2) ersetzt
// hier das frühere, schmale `nutzungsverhaeltnis/anschlussnutzerReferenzApi.ts`
// (Duplikat-Vermeidung — derselbe `createResourceQueryKeys('anschlussnutzer')`-
// Namensraum, siehe dortige Dokumentation). Diese Funktion bleibt strukturell
// unverändert, nur die Import-Quelle wechselt.
import { useAnschlussnutzerListe } from '../../api/anschlussnutzer';
import {
  DATENKLASSE_WERTE,
  NUTZUNGS_ROLLE_WERTE,
  toNutzungsverhaeltnisAnlegenPayload,
  useNutzungsverhaeltnisAnlegen,
  type NutzungsverhaeltnisAnlegenFormValues,
} from '../../api/nutzungsverhaeltnis';
import { enumSelectOptions, kurzId, type EntityFormSelectOption } from '../../components/shared';
import { t } from '../../../../shared/i18n/t';
import { mutationViewBasis, type MutationViewBasis } from '../shared/mutationView';
import { REFERENZ_OPTIONEN_LIMIT, referenzOptionen } from '../shared/referenzOptionen';

export interface NutzungsverhaeltnisAnlegenView extends MutationViewBasis {
  readonly endkundeOptionen: readonly EntityFormSelectOption[];
  /** Sichtbarer Hinweis, wenn die Auswahl serverseitig gekürzt ist (`referenzOptionen`), sonst `undefined`. */
  readonly endkundeOptionenHinweis: string | undefined;
  readonly anschlussnutzerOptionen: readonly EntityFormSelectOption[];
  /** Sichtbarer Hinweis, wenn die Auswahl serverseitig gekürzt ist (`referenzOptionen`), sonst `undefined`. */
  readonly anschlussnutzerOptionenHinweis: string | undefined;
  readonly systemOptionen: readonly EntityFormSelectOption[];
  /** Sichtbarer Hinweis, wenn die Auswahl serverseitig gekürzt ist (`referenzOptionen`), sonst `undefined`. */
  readonly systemOptionenHinweis: string | undefined;
  readonly datenklasseOptionen: readonly EntityFormSelectOption[];
  readonly rolleOptionen: readonly EntityFormSelectOption[];
  readonly submit: (values: NutzungsverhaeltnisAnlegenFormValues) => void;
}

/**
 * Leitet aus der Nutzungsverhältnis-Anlegen-Mutation ein reines Anzeige-/
 * Aktions-Modell ab — inkl. der drei Fremdschlüssel-Optionslisten
 * (Endkunde/Anschlussnutzer/System, je bis zu 100 Einträge, KEINE
 * gegenseitige Filterung nach ausgewähltem Endkunden in diesem Pass —
 * offener Punkt, Abschlussbericht) sowie der festen Enum-Optionen
 * (Datenklasse/Rolle). Referenzkonsistenz (anschlussnutzerId/systemId müssen
 * zum gewählten endkundeId gehören) prüft AUSSCHLIESSLICH der Server (400,
 * problem+json über `submitErrorMessage`).
 */
export function useNutzungsverhaeltnisAnlegenView(): NutzungsverhaeltnisAnlegenView {
  const navigate = useNavigate();
  const mutation = useNutzungsverhaeltnisAnlegen();
  const endkundenQuery = useEndkundenListe({}, { limit: REFERENZ_OPTIONEN_LIMIT });
  const anschlussnutzerQuery = useAnschlussnutzerListe({}, { limit: REFERENZ_OPTIONEN_LIMIT });
  const systemeQuery = useSystemeListe({}, { limit: REFERENZ_OPTIONEN_LIMIT });

  const endkundeReferenz = referenzOptionen(endkundenQuery, (item) => ({
    value: item.id,
    label: kurzId(item.id),
  }));

  const anschlussnutzerReferenz = referenzOptionen(anschlussnutzerQuery, (item) => ({ value: item.id, label: kurzId(item.id) }));

  const systemReferenz = referenzOptionen(systemeQuery, (item) => ({
    value: item.id,
    label: `${item.bezeichnung} (${kurzId(item.id)})`,
  }));

  const datenklasseOptionen = enumSelectOptions(DATENKLASSE_WERTE, (wert) => t(`stammdaten.common.enums.datenklasse.${wert}`));
  const rolleOptionen = enumSelectOptions(NUTZUNGS_ROLLE_WERTE, (wert) => t(`stammdaten.common.enums.nutzungsRolle.${wert}`));

  return {
    ...mutationViewBasis(mutation),
    endkundeOptionen: endkundeReferenz.optionen,
    endkundeOptionenHinweis: endkundeReferenz.hinweis,
    anschlussnutzerOptionen: anschlussnutzerReferenz.optionen,
    anschlussnutzerOptionenHinweis: anschlussnutzerReferenz.hinweis,
    systemOptionen: systemReferenz.optionen,
    systemOptionenHinweis: systemReferenz.hinweis,
    datenklasseOptionen,
    rolleOptionen,
    submit: (values) => {
      mutation.mutate(toNutzungsverhaeltnisAnlegenPayload(values), {
        onSuccess: (detail) => {
          void navigate(`/stammdaten/nutzungsverhaeltnisse/${detail.id}`);
        },
      });
    },
  };
}
