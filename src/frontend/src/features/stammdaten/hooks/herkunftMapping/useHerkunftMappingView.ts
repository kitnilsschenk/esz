import type { HerkunftMapping, HerkunftMappingAnlegen } from '@edms/shared';
import {
  useHerkunftMappingAnlegen,
  useHerkunftMappingEntfernen,
  useHerkunftMappingListe,
  type HerkunftMappingFormValues,
} from '../../api/herkunftMapping';
import { formatiereZeitpunkt } from '../../../../shared/format/datum';
import { t } from '../../../../shared/i18n/t';
import { mutationViewBasis, type MutationViewBasis } from '../shared/mutationView';

/** Eine Zuordnungszeile, fertig für die Anzeige. */
export interface HerkunftMappingZeileView {
  readonly id: string;
  readonly quelleLabel: string;
  readonly tenantId: string;
  readonly tenantIdKurz: string;
  readonly applicationId: string;
  readonly applicationIdKurz: string;
  readonly endkundeId: string;
  readonly endkundeIdKurz: string;
  readonly standortId: string;
  readonly standortIdKurz: string;
  readonly standortTypLabel: string;
  readonly angelegtLabel: string;
}

export interface HerkunftMappingListeView {
  readonly items: readonly HerkunftMappingZeileView[];
  readonly isPending: boolean;
  readonly isError: boolean;
}

function kuerze(kennung: string): string {
  // Volle UUIDs nebeneinander sind nicht unterscheidbar; die ersten acht
  // Zeichen sind es. Der volle Wert bleibt im `title` erreichbar, damit
  // niemand zum Abgleich mit dem Netzserver raten muss.
  return kennung.slice(0, 8);
}

function zuZeile(eintrag: HerkunftMapping): HerkunftMappingZeileView {
  return {
    id: eintrag.id,
    quelleLabel: eintrag.quelleCode,
    tenantId: eintrag.chirpstackTenantId,
    tenantIdKurz: kuerze(eintrag.chirpstackTenantId),
    applicationId: eintrag.chirpstackApplicationId,
    applicationIdKurz: kuerze(eintrag.chirpstackApplicationId),
    endkundeId: eintrag.endkundeId,
    endkundeIdKurz: kuerze(eintrag.endkundeId),
    standortId: eintrag.standortId,
    standortIdKurz: kuerze(eintrag.standortId),
    standortTypLabel: t(`stammdaten.herkunftMapping.standortTyp.${eintrag.standortTyp}`),
    angelegtLabel: formatiereZeitpunkt(eintrag.createdAt),
  };
}

export function useHerkunftMappingListeView(): HerkunftMappingListeView {
  const query = useHerkunftMappingListe();

  return {
    items: (query.data ?? []).map(zuZeile),
    isPending: query.isPending,
    isError: query.isError,
  };
}

export interface HerkunftMappingAnlegenView extends MutationViewBasis {
  readonly anlegen: (values: HerkunftMappingFormValues) => void;
}

export function useHerkunftMappingAnlegenView(): HerkunftMappingAnlegenView {
  const mutation = useHerkunftMappingAnlegen();

  return {
    // Das Formular bleibt nach Erfolg stehen (man ordnet meist mehrere
    // Gebäude nacheinander zu) — deshalb ist die Erfolgsmeldung Pflicht.
    ...mutationViewBasis(mutation, t('stammdaten.herkunftMapping.formular.erfolg')),
    anlegen: (values) => {
      const eingabe: HerkunftMappingAnlegen = {
        chirpstackTenantId: values.chirpstackTenantId,
        chirpstackApplicationId: values.chirpstackApplicationId,
        endkundeId: values.endkundeId,
        standortId: values.standortId,
        // Leer heißt „nimm die Kennung dieses Deployments" — das entscheidet
        // der Server, nicht die Oberfläche.
        ...(values.quelleCode !== '' ? { quelleCode: values.quelleCode } : {}),
      };
      mutation.mutate(eingabe);
    },
  };
}

export interface HerkunftMappingEntfernenView extends MutationViewBasis {
  readonly entfernen: (id: string) => void;
  readonly laufendeId: string | undefined;
}

export function useHerkunftMappingEntfernenView(): HerkunftMappingEntfernenView {
  const mutation = useHerkunftMappingEntfernen();

  return {
    ...mutationViewBasis(mutation, t('stammdaten.herkunftMapping.tabelle.entferntErfolg')),
    entfernen: (id) => {
      mutation.mutate(id);
    },
    // Damit nur die betroffene Zeile ihren Knopf sperrt und nicht die ganze
    // Tabelle einfriert.
    laufendeId: mutation.isPending ? mutation.variables : undefined,
  };
}
