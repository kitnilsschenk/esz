import { useMemo } from 'react';
import { useStandortBaum, useStandortLabels } from '../../api/standort';
import { useKannStandortPiiLesen } from '../standort/useKannStandortPiiLesen';
import { kurzId } from '../../components/shared';
import { t } from '../../../../shared/i18n/t';

export interface EndkundeVerbrauchWurzelView {
  readonly standortId: string;
  readonly typLabel: string;
  readonly anzeigeName: string;
  readonly istPlatzhalter: boolean;
}

export interface EndkundeVerbrauchView {
  readonly isPending: boolean;
  readonly isError: boolean;
  /** Kein Standort-Baum vorhanden — kein Fehler, echter Leerzustand. */
  readonly istLeer: boolean;
  readonly wurzeln: readonly EndkundeVerbrauchWurzelView[];
  /** `true` bei mehr als EINEM Wurzelknoten (mehrere Liegenschaften) — steuert Kacheln statt Direkteinbettung (Betriebs-UI-Konzept Punkt 4). */
  readonly hatMehrereWurzeln: boolean;
}

/**
 * View-Model des „Verbrauch"-Tabs der Endkunde-Detailseite (Betriebs-UI-
 * Konzept Punkt 4, Priorität 5). **Kein Backend-Bedarf**: die Wurzelknoten-
 * Liste kommt aus dem BESTEHENDEN Standort-Baum-Endpunkt
 * (`useStandortBaum`, PII-frei), gefiltert auf `parentId === null` —
 * `messwerte.openapi.yaml` verbietet ausdrücklich das Summieren
 * unterschiedlicher Messgrößen/Einheiten, daher gibt es HIER bewusst KEINE
 * Aggregation über mehrere Wurzeln hinweg (weder client- noch serverseitig).
 *
 * - GENAU EIN Wurzelknoten (Regelfall): `EndkundeVerbrauchTab` bettet
 *   `VerbrauchAnsicht` direkt mit `standortId = Wurzel` ein
 *   (`inklusiveUnterknoten` ist dort bereits Default `true` — liefert den
 *   Gesamtverbrauch des kompletten Gebäudebaums).
 * - MEHRERE Wurzelknoten (mehrere Liegenschaften): EIN Batch-Label-Aufruf
 *   (D5 Linie 2, `read:standort_pii`) für ALLE Wurzeln zusammen — dieselbe
 *   „ein Aufruf, nicht einer je Knoten"-Regel wie im Standort-Baum. Ohne die
 *   Berechtigung zeigt jede Kachel einen Platzhalter-Titel statt Bezeichnung
 *   (kein Fehlerzustand, analog `useStandortBaumView`).
 */
export function useEndkundeVerbrauchView(endkundeId: string): EndkundeVerbrauchView {
  const baumQuery = useStandortBaum(endkundeId);
  const kannPiiLesen = useKannStandortPiiLesen();

  const alleKnoten = baumQuery.data ?? [];
  const wurzelKnoten = useMemo(() => alleKnoten.filter((knoten) => knoten.parentId === null), [alleKnoten]);
  const wurzelIds = useMemo(() => wurzelKnoten.map((knoten) => knoten.id), [wurzelKnoten]);

  const labelsQuery = useStandortLabels(endkundeId, wurzelIds, { enabled: kannPiiLesen && wurzelIds.length > 0 });
  const labelDarstellungErlaubt = kannPiiLesen && !labelsQuery.isError;

  const labelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of labelsQuery.data ?? []) {
      map.set(item.id, item.bezeichnung);
    }
    return map;
  }, [labelsQuery.data]);

  const wurzeln: readonly EndkundeVerbrauchWurzelView[] = wurzelKnoten.map((knoten) => {
    const typLabel = t(`stammdaten.common.enums.standortTyp.${knoten.typ}`);
    if (!labelDarstellungErlaubt) {
      return {
        standortId: knoten.id,
        typLabel,
        anzeigeName: `${typLabel} ${t('stammdaten.standort.baum.keinePiiBerechtigungSuffix')}`,
        istPlatzhalter: true,
      };
    }
    const bezeichnung = labelById.get(knoten.id);
    return {
      standortId: knoten.id,
      typLabel,
      anzeigeName: bezeichnung ?? `${typLabel} (${kurzId(knoten.id)})`,
      istPlatzhalter: bezeichnung === undefined,
    };
  });

  return {
    isPending: baumQuery.isPending,
    isError: baumQuery.isError,
    istLeer: !baumQuery.isPending && !baumQuery.isError && wurzeln.length === 0,
    wurzeln,
    hatMehrereWurzeln: wurzeln.length > 1,
  };
}
