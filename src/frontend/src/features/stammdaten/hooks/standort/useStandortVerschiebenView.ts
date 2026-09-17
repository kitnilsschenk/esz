import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ApiProblemError, StandortStruktur } from '@edms/shared';
import {
  WURZEL_SENTINEL,
  istWurzelTyp,
  standortBaumKey,
  toStandortVerschiebenPayload,
  useStandortVerschieben,
  type StandortVerschiebenFormValues,
} from '../../api/standort';
import type { EntityFormSelectOption } from '../../components/shared';
import { t } from '../../../../shared/i18n/t';

export interface StandortVerschiebenView {
  readonly zielOptionen: readonly EntityFormSelectOption[];
  readonly isSubmitting: boolean;
  readonly submitErrorMessage: string | undefined;
  readonly submit: (values: StandortVerschiebenFormValues) => void;
}

/**
 * Übersetzt den HTTP-Status der Verschieben-Mutation in eine verständliche
 * deutsche Meldung — bewusst NICHT `error.detail` direkt (der rohe
 * Server-Text enthält interne ADR-Abschnittsverweise wie "D2.2/D6",
 * `standort.service.ts#verschieben`). Der Server lehnt unter 409 GENAU
 * DREI fachliche Fälle ab (Zyklus, Tiefenlimit, Mandanten-Fremdzugriff via
 * Trigger-Backstop) UND unter 400 zusätzlich ungültige Wurzel-Verschiebungen
 * (D2.4) — eine einzige, alle drei 409-Fälle abdeckende Meldung ist hier
 * angemessener als eine Fehlinterpretation aus dem Freitext.
 */
function toVerschiebenFehlerMeldung(error: ApiProblemError | null): string | undefined {
  if (error === null) {
    return undefined;
  }
  if (error.status === 409) {
    return t('stammdaten.standort.form.errors.verschiebenKonflikt');
  }
  if (error.status === 400) {
    return t('stammdaten.standort.form.errors.verschiebenUngueltig');
  }
  if (error.status === 404) {
    return t('stammdaten.standort.form.errors.verschiebenZielNichtGefunden');
  }
  return t('stammdaten.common.fehlerAllgemein');
}

/**
 * Leitet aus der Standort-Verschieben-Mutation (Reparent, D6) ein
 * Formular-Anzeige-Modell ab. Die Ziel-Optionsliste ist eine CLIENT-SEITIGE
 * Vorab-Filterung (schließt den Knoten selbst UND seine eigenen Nachfahren
 * über den materialisierten Pfad aus, `pfad.includes(knoten.id)`) — reine
 * UX-Hilfe, KEIN Ersatz für die serverseitige Prüfung (D2.1/D2.2/D2.3), die
 * bei einem dennoch abgelehnten Ziel über `toVerschiebenFehlerMeldung`
 * verständlich gemeldet wird. „An die Wurzel" erscheint NUR, wenn der Knoten
 * bereits `liegenschaft`/`gebaeude` ist (D2.4).
 */
export function useStandortVerschiebenView(
  endkundeId: string,
  knoten: StandortStruktur,
  alleKnoten: readonly StandortStruktur[],
  anzeigeNameFuer: (standortId: string) => string,
  onErfolg: () => void,
): StandortVerschiebenView {
  const mutation = useStandortVerschieben();
  const queryClient = useQueryClient();

  const zielOptionen = useMemo(() => {
    const optionen: EntityFormSelectOption[] = [];
    if (istWurzelTyp(knoten.typ)) {
      optionen.push({ value: WURZEL_SENTINEL, label: t('stammdaten.standort.form.verschiebenZielWurzel') });
    }
    for (const kandidat of alleKnoten) {
      if (kandidat.id === knoten.id || kandidat.pfad.includes(knoten.id)) {
        continue;
      }
      optionen.push({ value: kandidat.id, label: anzeigeNameFuer(kandidat.id) });
    }
    return optionen;
    // `anzeigeNameFuer` bewusst NICHT in den deps: eine bei jedem Render neu
    // erzeugte Closure aus `useStandortBaumView` (kein `useCallback` dort),
    // deren Ergebnisse ausschließlich von `alleKnoten` abhängen — eine
    // Aufnahme würde `zielOptionen` bei jedem Render neu berechnen, ohne
    // das Ergebnis zu ändern (`react-hooks/exhaustive-deps` ist in diesem
    // Repo ohnehin nicht konfiguriert, s. `useAuthBootstrap.ts`).
  }, [alleKnoten, knoten]);

  return {
    zielOptionen,
    isSubmitting: mutation.isPending,
    submitErrorMessage: toVerschiebenFehlerMeldung(mutation.error),
    submit: (values) => {
      mutation.mutate(
        { id: knoten.id, input: toStandortVerschiebenPayload(values) },
        {
          onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: standortBaumKey(endkundeId) });
            onErfolg();
          },
        },
      );
    },
  };
}
