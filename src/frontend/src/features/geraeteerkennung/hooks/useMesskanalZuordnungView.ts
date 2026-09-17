import { t } from '../../../shared/i18n/t';
import type { EntityFormSelectOption } from '../../stammdaten/components/shared';
import { mutationViewBasis, type MutationViewBasis } from '../../stammdaten/hooks/shared/mutationView';
import { useMesskanalDetail } from '../../stammdaten/api/messkanal';
import { useSystemDetail } from '../../stammdaten/api/system';
import { useZaehlerDetail } from '../../stammdaten/api/zaehler';
import {
  ERKENNUNGSMETHODE_WERTE,
  toZuordnungAnlegenPayload,
  useGruppen,
  useZuordnungAnlegen,
  type ZuordnungFormValues,
} from '../api';

export interface MesskanalZuordnungView extends MutationViewBasis {
  /** `undefined`, solange die Kette Messkanal → Zähler → System → Endkunde nicht aufgelöst ist. */
  readonly endkundeId: string | undefined;
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly ladeFehlerMeldung: string;
  /** `true`, wenn der Endkunde noch keine Gruppe hat — dann ist Zuordnen gar nicht möglich. */
  readonly ohneGruppen: boolean;
  readonly ohneGruppenMeldung: string;
  readonly gruppenOptionen: readonly EntityFormSelectOption[];
  readonly methodenOptionen: readonly EntityFormSelectOption[];
  readonly zuordnen: (values: ZuordnungFormValues) => void;
}

/**
 * „Diesen Messkanal einer Gerätegruppe zuordnen" (TB-05, [Q3] Kap. 5).
 *
 * **Warum die Kette Messkanal → Zähler → System → Endkunde:** Gerätegruppen
 * hängen am Endkunden, ein Messkanal weiß aber nur von seinem Zähler. Die drei
 * Abfragen sind der Preis dafür, dass die Zuordnung dort stattfindet, wo der
 * Kanal ohnehin offen ist — die Alternative wäre, den Nutzer eine Kanal-UUID
 * in ein Feld auf der Endkundenseite tippen zu lassen. Die Detailabfragen
 * liegen ohnehin im Cache, sobald jemand über System und Zähler hierher
 * navigiert ist.
 *
 * **Ohne Gruppe kein Formular.** Hat der Endkunde noch keine Gerätegruppe,
 * zeigt die Ansicht keinen leeren Auswahlkasten, sondern sagt, wo die Gruppe
 * angelegt wird. Ein Formular, dessen Pflichtfeld nichts zur Auswahl hat, ist
 * eine Sackgasse mit Absende-Knopf.
 */
export function useMesskanalZuordnungView(messkanalId: string): MesskanalZuordnungView {
  const messkanalQuery = useMesskanalDetail(messkanalId);
  const zaehlerId = messkanalQuery.data?.zaehlerId;
  const zaehlerQuery = useZaehlerDetail(zaehlerId ?? '', { enabled: zaehlerId !== undefined });
  const systemId = zaehlerQuery.data?.systemId;
  const systemQuery = useSystemDetail(systemId ?? '', { enabled: systemId !== undefined });
  const endkundeId = systemQuery.data?.endkundeId;
  const gruppenQuery = useGruppen(endkundeId ?? '', { enabled: endkundeId !== undefined });

  const mutation = useZuordnungAnlegen();

  const gruppen = gruppenQuery.data ?? [];

  return {
    endkundeId,
    isPending:
      messkanalQuery.isPending || zaehlerQuery.isPending || systemQuery.isPending || gruppenQuery.isPending,
    isError: messkanalQuery.isError || zaehlerQuery.isError || systemQuery.isError || gruppenQuery.isError,
    ladeFehlerMeldung: t('geraeteerkennung.zuordnenForm.ladeFehler'),
    ohneGruppen: gruppenQuery.isSuccess && gruppen.length === 0,
    ohneGruppenMeldung: t('geraeteerkennung.zuordnenForm.ohneGruppen'),
    gruppenOptionen: gruppen.map((gruppe) => ({ value: gruppe.id, label: gruppe.bezeichnung })),
    methodenOptionen: ERKENNUNGSMETHODE_WERTE.map((methode) => ({
      value: methode,
      label: t(`geraeteerkennung.methode.${methode}`),
    })),
    zuordnen: (values: ZuordnungFormValues) => {
      mutation.mutate(toZuordnungAnlegenPayload(values, messkanalId));
    },
    ...mutationViewBasis(mutation, t('geraeteerkennung.zuordnenForm.erfolg')),
  };
}
