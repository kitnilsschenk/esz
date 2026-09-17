import { useNavigate } from 'react-router-dom';
import type { VerarbeitungsStatus } from '@edms/shared';
import { useEndkundenListe } from '../../api/endkunde';
import { toSystemAnlegenPayload, useSystemAnlegen, type SystemAnlegenFormValues } from '../../api/system';
import { kurzId, type EntityFormSelectOption } from '../../components/shared';
import { t } from '../../../../shared/i18n/t';
import { mutationViewBasis, type MutationViewBasis } from '../shared/mutationView';
import { REFERENZ_OPTIONEN_LIMIT, referenzOptionen } from '../shared/referenzOptionen';
import { useEndkundeLabelsView } from '../endkunde/useEndkundeLabelsView';

export interface SystemAnlegenView extends MutationViewBasis {
  /** Fremdschlüssel-Auswahl `endkundeId` (Referenz-Auswahl, ADR-0008 §23 / D11 Pass 1). */
  readonly endkundeOptionen: readonly EntityFormSelectOption[];
  /** Sichtbarer Hinweis, wenn die Auswahl serverseitig gekürzt ist (`referenzOptionen`), sonst `undefined`. */
  readonly endkundeOptionenHinweis: string | undefined;
  readonly submit: (values: SystemAnlegenFormValues) => void;
}

/**
 * ADR-0008 **D12**: Zeigt den Klartextnamen, sobald die Label-Aufloesung ihn
 * liefert — und faellt sonst auf die Kurz-Id zurueck. Vorher stand hier
 * ausschliesslich ein 8-Zeichen-Hex-Praefix; die Auswahl eines Endkunden war
 * damit faktisch ein Raten. Der `compliance-director` bewertet genau das als
 * Fehlzuordnungsrisiko nach Art. 5 Abs. 1 lit. d.
 *
 * Die Kennung bleibt IMMER mit in der Beschriftung: Sie ist der stabile
 * Bezug, den Audit-Log und BAFA-Export fuehren, und sie disambiguiert bei
 * Namensgleichheit.
 */
function endkundeOptionLabel(id: string, status: VerarbeitungsStatus, anzeigeName: string): string {
  const statusText = t(`stammdaten.endkunde.status.verarbeitung.${status}`);
  return anzeigeName === kurzId(id) ? `${kurzId(id)} (${statusText})` : `${anzeigeName} · ${kurzId(id)} (${statusText})`;
}

/**
 * Leitet aus der System-Anlegen-Mutation ein reines Anzeige-/Aktions-Modell
 * ab (analog `useEndkundeAnlegenView`) — inkl. der Endkunde-Optionsliste für
 * das Fremdschlüssel-Auswahlfeld `endkundeId` (bis zu 100 Endkunden, KEINE
 * serverseitige Suche/Autocomplete in diesem Pass — offener Punkt).
 */
export function useSystemAnlegenView(): SystemAnlegenView {
  const navigate = useNavigate();
  const mutation = useSystemAnlegen();
  const endkundenQuery = useEndkundenListe({}, { limit: REFERENZ_OPTIONEN_LIMIT });

  // Auflage A3: Angefragt wird GENAU die Menge, die als Optionen erscheint.
  const endkundeIds = (endkundenQuery.data?.pages ?? []).flatMap((seite) => seite.daten).map((item) => item.id);
  const endkundeLabels = useEndkundeLabelsView(endkundeIds);

  const endkundeReferenz = referenzOptionen(endkundenQuery, (item) => ({
    value: item.id,
    label: endkundeOptionLabel(item.id, item.verarbeitungsStatus, endkundeLabels.anzeigeName(item.id)),
  }));

  return {
    ...mutationViewBasis(mutation),
    endkundeOptionen: endkundeReferenz.optionen,
    endkundeOptionenHinweis: endkundeReferenz.hinweis,
    submit: (values) => {
      mutation.mutate(toSystemAnlegenPayload(values), {
        onSuccess: (detail) => {
          void navigate(`/stammdaten/systeme/${detail.id}`);
        },
      });
    },
  };
}
