import { useMemo } from 'react';
import type { StandortTyp } from '@edms/shared';
import { useZaehlerDetail } from '../../api/zaehler';
import { useSystemDetail } from '../../api/system';
import {
  toZaehlerStandortZuordnenPayload,
  useStandortLabels,
  useZaehlerAktuelleVerortung,
  useZaehlerVerortungAnlegen,
  zaehlerStandortZuordnenFormDefaultValues,
  zaehlerStandortZuordnenFormSchema,
  type ZaehlerStandortZuordnenFormValues,
} from '../../api/standort';
import { useKannStandortPiiLesen } from '../standort/useKannStandortPiiLesen';
import { kurzId } from '../../components/shared';
import { t } from '../../../../shared/i18n/t';
import { toSubmitErrorMessage } from '../shared/mutationView';

export interface ZaehlerStandortBreadcrumbEintragView {
  readonly id: string;
  readonly typLabel: string;
  /** Bezeichnung (bei Berechtigung + geladen) ODER Platzhalter-Anzeigetext — NIE beides gemischt (analog `StandortBaumKnotenView`). */
  readonly anzeigeName: string;
  readonly istPlatzhalter: boolean;
}

export interface ZaehlerStandortView {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly verortet: boolean;
  readonly verortetSeit: string | undefined;
  /** `undefined`, solange `endkundeId` (über `systemId`) noch nicht bekannt ist — steuert den Deep-Link zum Standort-Baum. */
  readonly endkundeId: string | undefined;
  /** Vorfahrenkette INKLUSIVE des eigenen Standort-Knotens, Wurzel zuerst (leer, wenn `verortet=false`). */
  readonly breadcrumb: readonly ZaehlerStandortBreadcrumbEintragView[];
  readonly zuordnenSchema: typeof zaehlerStandortZuordnenFormSchema;
  readonly zuordnenDefaultValues: ZaehlerStandortZuordnenFormValues;
  readonly zuordnenIsSubmitting: boolean;
  readonly zuordnenSubmitErrorMessage: string | undefined;
  readonly zuordnenSubmit: (values: ZaehlerStandortZuordnenFormValues) => void;
}

function typLabel(typ: StandortTyp): string {
  return t(`stammdaten.common.enums.standortTyp.${typ}`);
}

/**
 * View-Model des Standort-Breadcrumb-Blocks der Zähler-Detailseite
 * (Betriebs-UI-Konzept Punkt 3). Kombiniert VIER Queries + eine Mutation:
 *
 * 1. `useZaehlerAktuelleVerortung` (D6, PII-frei) — Struktur-Pfad
 *    (`id`/`typ`/`ebene`, Wurzel zuerst), NIEMALS Bezeichnung.
 * 2. `useZaehlerDetail` → `systemId` (bereits an anderer Stelle gecacht,
 *    kein Zusatz-Request) UND
 * 3. `useSystemDetail(systemId)` → `endkundeId` — die Verortungs-Antwort
 *    selbst trägt KEINE `endkundeId` (D5-Trennung); der Umweg über
 *    Zähler→System ist der einzige bereits vorhandene Pfad dorthin.
 * 4. `useStandortLabels(endkundeId, pfadIds)` — EIN Batch-Aufruf für ALLE
 *    Pfad-Knoten (D5 Linie 2, `read:standort_pii`), NIEMALS einer je Knoten.
 *    Ohne die Berechtigung (`useKannStandortPiiLesen`) wird der Aufruf gar
 *    nicht erst abgesetzt — jeder Knoten zeigt stattdessen einen
 *    Platzhalter-Anzeigetext (KEIN Fehlerzustand, analog `useStandortBaumView`).
 *
 * Die Zuordnen-Mutation (CTA „Standort zuordnen", Empty-State) ist DIESELBE
 * `useZaehlerVerortungAnlegen`-Mutation wie im Standort-Baum — nur der
 * Formular-Kontext ist gespiegelt (`zaehlerId` bekannt, `standortId`
 * Eingabefeld statt umgekehrt).
 */
export function useZaehlerStandortView(zaehlerId: string): ZaehlerStandortView {
  const zaehlerQuery = useZaehlerDetail(zaehlerId);
  const systemId = zaehlerQuery.data?.systemId;
  const systemQuery = useSystemDetail(systemId ?? '', { enabled: systemId !== undefined });
  const endkundeId = systemQuery.data?.endkundeId;

  const verortungQuery = useZaehlerAktuelleVerortung(zaehlerId);
  const kannPiiLesen = useKannStandortPiiLesen();
  const pfad = verortungQuery.data?.pfad ?? [];
  const pfadIds = useMemo(() => pfad.map((eintrag) => eintrag.id), [pfad]);

  const labelsQuery = useStandortLabels(endkundeId ?? '', pfadIds, {
    enabled: kannPiiLesen && endkundeId !== undefined && pfadIds.length > 0,
  });
  const labelDarstellungErlaubt = kannPiiLesen && !labelsQuery.isError;

  const labelItemById = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of labelsQuery.data ?? []) {
      map.set(item.id, item.bezeichnung);
    }
    return map;
  }, [labelsQuery.data]);

  const breadcrumb: readonly ZaehlerStandortBreadcrumbEintragView[] = pfad.map((eintrag) => {
    const typText = typLabel(eintrag.typ);
    if (!labelDarstellungErlaubt) {
      return { id: eintrag.id, typLabel: typText, anzeigeName: `${typText} ${t('stammdaten.standort.baum.keinePiiBerechtigungSuffix')}`, istPlatzhalter: true };
    }
    if (labelsQuery.isPending) {
      return { id: eintrag.id, typLabel: typText, anzeigeName: `${typText} (${t('stammdaten.common.laedt')})`, istPlatzhalter: true };
    }
    const bezeichnung = labelItemById.get(eintrag.id);
    return {
      id: eintrag.id,
      typLabel: typText,
      anzeigeName: bezeichnung ?? `${typText} (${kurzId(eintrag.id)})`,
      istPlatzhalter: bezeichnung === undefined,
    };
  });

  const zuordnenMutation = useZaehlerVerortungAnlegen();

  return {
    isPending: zaehlerQuery.isPending || verortungQuery.isPending,
    isError: zaehlerQuery.isError || verortungQuery.isError,
    verortet: verortungQuery.data?.verortet ?? false,
    verortetSeit: verortungQuery.data?.verortetSeit ?? undefined,
    endkundeId,
    breadcrumb,
    zuordnenSchema: zaehlerStandortZuordnenFormSchema,
    zuordnenDefaultValues: zaehlerStandortZuordnenFormDefaultValues,
    zuordnenIsSubmitting: zuordnenMutation.isPending,
    zuordnenSubmitErrorMessage: toSubmitErrorMessage(zuordnenMutation.error),
    zuordnenSubmit: (values) => {
      zuordnenMutation.mutate(toZaehlerStandortZuordnenPayload(values, { zaehlerId }));
    },
  };
}
