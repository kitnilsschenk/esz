import { toSystemAendernPayload, useSystemAendern, useSystemDetail, type SystemAendernFormValues } from '../../api/system';
import { useStandortBaum, useStandortLabels } from '../../api/standort';
import { kurzId, type EntityFormSelectOption } from '../../components/shared';
import { useKannStandortPiiLesen } from '../standort/useKannStandortPiiLesen';
import { t } from '../../../../shared/i18n/t';
import { mutationViewBasis, type MutationViewBasis } from '../shared/mutationView';

export interface SystemAendernView extends MutationViewBasis {
  /** `false`, solange das aktuelle Detail (Vorbefüllung) noch nicht geladen ist. */
  readonly isReady: boolean;
  readonly defaultValues: SystemAendernFormValues;
  /**
   * Die Standorte DIESES Endkunden.
   *
   * Nur im Aendern-Formular, nicht beim Anlegen: Dort wird der Endkunde
   * gerade erst gewaehlt, und eine davon abhaengige Standortliste haette
   * entweder die falschen Standorte gezeigt oder gar keine. Der uebliche
   * Ablauf ist ohnehin Kunde → Standorte → Systeme.
   */
  readonly standortOptionen: readonly EntityFormSelectOption[];
  readonly submit: (values: SystemAendernFormValues) => void;
}

/**
 * Leitet aus der System-Ändern-Mutation ein reines Anzeige-/Aktions-Modell
 * ab — inkl. Vorbefüllung aus dem bereits geladenen Detail (`useSystemDetail`
 * teilt sich den TanStack-Query-Cache-Eintrag mit `useSystemDetailView`,
 * KEIN zusätzlicher Request). `SystemAendernFormular` rendert das Formular
 * erst, wenn `isReady` — vorher gäbe es keine sinnvollen Vorbefüllwerte.
 */
export function useSystemAendernView(systemId: string): SystemAendernView {
  const detailQuery = useSystemDetail(systemId);
  const mutation = useSystemAendern();
  const detail = detailQuery.data;
  const standorte = useStandortBaum(detail?.endkundeId ?? '');
  // Die Bezeichnung liegt feldverschluesselt in `identity.*` — die
  // Strukturliste ist PII-frei. Ohne Aufloesung stuende in der Auswahl nur
  // eine Kennung, und die Wahl des richtigen Standorts waere ein Raten
  // (dieselbe Begruendung wie D12 beim Endkunden).
  const kannPiiLesen = useKannStandortPiiLesen();
  const standortIds = (standorte.data ?? []).map((knoten) => knoten.id);
  const labels = useStandortLabels(detail?.endkundeId ?? '', standortIds, {
    enabled: kannPiiLesen && standortIds.length > 0,
  });
  const labelJeId = new Map((labels.data ?? []).map((eintrag) => [eintrag.id, eintrag.bezeichnung]));

  const defaultValues: SystemAendernFormValues = detail
    ? {
        bezeichnung: detail.bezeichnung,
        systemgrenze: detail.systemgrenze,
        systembeschreibung: detail.systembeschreibung ?? '',
        standortId: detail.standortId ?? '',
      }
    : { bezeichnung: '', systemgrenze: '', systembeschreibung: '', standortId: '' };

  return {
    isReady: detail !== undefined,
    defaultValues,
    standortOptionen: (standorte.data ?? []).map((standort) => {
      const typLabel = t(`stammdaten.common.enums.standortTyp.${standort.typ}`);
      const name = labelJeId.get(standort.id);
      // Typ IMMER mit: „Werk Nord" allein sagt nicht, ob eine Liegenschaft
      // oder ein einzelner Raum gemeint ist. Ohne PII-Berechtigung bleibt die
      // Kurz-Kennung — sichtbar als Platzhalter, nicht als Leerstelle.
      return {
        value: standort.id,
        label: name === undefined ? `${typLabel} ${kurzId(standort.id)}` : `${name} (${typLabel})`,
      };
    }),
    ...mutationViewBasis(mutation, t('stammdaten.common.erfolg.gespeichert')),
    submit: (values) => {
      mutation.mutate({ id: systemId, input: toSystemAendernPayload(values) });
    },
  };
}
