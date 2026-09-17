import { useState } from 'react';
import type { ZaehlerUnterKnotenItem } from '@edms/shared';
import {
  toZaehlerVerortungAnlegenPayload,
  toZaehlerVerortungBeendenPayload,
  useZaehlerUnterKnoten,
  useZaehlerVerortungAnlegen,
  useZaehlerVerortungBeenden,
  zaehlerVerortungAnlegenFormDefaultValues,
  zaehlerVerortungAnlegenFormSchema,
  zaehlerVerortungBeendenFormDefaultValues,
  zaehlerVerortungBeendenFormSchema,
  type ZaehlerVerortungAnlegenFormValues,
  type ZaehlerVerortungBeendenFormValues,
} from '../../api/standort';
import { t } from '../../../../shared/i18n/t';
import { toSubmitErrorMessage } from '../shared/mutationView';

/**
 * EIN Eintrag der session-lokalen Verortungs-Historie (s. Klassen-Dok
 * unten) — bewusst UI-seitiges Gedächtnis, kein gespiegelter Server-State.
 */
export interface StandortZaehlerVerlaufEintrag {
  readonly typ: 'zugeordnet' | 'beendet';
  readonly zaehlerId: string;
  readonly zeitpunkt: string;
}

export interface StandortZaehlerView {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly errorMessage: string | undefined;
  readonly zaehler: readonly ZaehlerUnterKnotenItem[];
  /**
   * Verlauf DIESER Sitzung (nicht die vollständige, persistente Historie —
   * die ADR-0010-API kennt keinen Endpunkt "alle Zeitscheiben eines
   * Zählers"; §5 bietet nur "aktuell/zum Stichtag verortet". Jede
   * Verorten-/Beenden-Aktion HIER im Baum wird trotzdem als Verlaufseintrag
   * angehängt, NICHT als Überschreiben des vorherigen Zustands dargestellt
   * — s. Abschlussbericht „offene Punkte" für einen künftigen
   * Persistenz-Endpunkt).
   */
  readonly verlauf: readonly StandortZaehlerVerlaufEintrag[];
  readonly anlegenSchema: typeof zaehlerVerortungAnlegenFormSchema;
  readonly anlegenDefaultValues: ZaehlerVerortungAnlegenFormValues;
  readonly anlegenIsSubmitting: boolean;
  readonly anlegenSubmitErrorMessage: string | undefined;
  readonly anlegenSubmit: (values: ZaehlerVerortungAnlegenFormValues) => void;
  readonly beendenSchema: typeof zaehlerVerortungBeendenFormSchema;
  readonly beendenDefaultValues: ZaehlerVerortungBeendenFormValues;
  readonly beendenIsSubmitting: boolean;
  readonly beendenSubmitErrorMessage: string | undefined;
  readonly beendenSubmit: (values: ZaehlerVerortungBeendenFormValues) => void;
}

/**
 * Leitet aus der "Zähler unter Knoten"-Query (D6, Kern-Query) UND den
 * beiden Verortungs-Mutationen (`create:zaehler_standort`/
 * `update:zaehler_standort`, D3) ein Anzeige-/Aktions-Modell ab. "Umsetzen"
 * (ein Zähler wird einem NEUEN Standort zugeordnet, während er anderswo
 * noch offen verortet ist) schließt serverseitig ATOMAR die alte
 * Zeitscheibe — die UI stellt dies über `verlauf` als ZWEI aufeinander
 * folgende Ereignisse dar (nicht als stillen Ortswechsel).
 */
export function useStandortZaehlerView(standortId: string): StandortZaehlerView {
  const query = useZaehlerUnterKnoten(standortId);
  const anlegenMutation = useZaehlerVerortungAnlegen();
  const beendenMutation = useZaehlerVerortungBeenden();
  const [verlauf, setVerlauf] = useState<readonly StandortZaehlerVerlaufEintrag[]>([]);

  return {
    isPending: query.isPending,
    isError: query.isError,
    errorMessage: query.isError ? t('stammdaten.common.fehler') : undefined,
    zaehler: query.data ?? [],
    verlauf,
    anlegenSchema: zaehlerVerortungAnlegenFormSchema,
    anlegenDefaultValues: zaehlerVerortungAnlegenFormDefaultValues,
    anlegenIsSubmitting: anlegenMutation.isPending,
    anlegenSubmitErrorMessage: toSubmitErrorMessage(anlegenMutation.error),
    anlegenSubmit: (values) => {
      anlegenMutation.mutate(toZaehlerVerortungAnlegenPayload(values, { standortId }), {
        onSuccess: (detail) => {
          setVerlauf((bisherige) => [{ typ: 'zugeordnet', zaehlerId: detail.zaehlerId, zeitpunkt: detail.gueltigVon }, ...bisherige]);
        },
      });
    },
    beendenSchema: zaehlerVerortungBeendenFormSchema,
    beendenDefaultValues: zaehlerVerortungBeendenFormDefaultValues,
    beendenIsSubmitting: beendenMutation.isPending,
    beendenSubmitErrorMessage: toSubmitErrorMessage(beendenMutation.error),
    beendenSubmit: (values) => {
      beendenMutation.mutate(toZaehlerVerortungBeendenPayload(values), {
        onSuccess: (detail) => {
          setVerlauf((bisherige) => [
            { typ: 'beendet', zaehlerId: detail.zaehlerId, zeitpunkt: detail.gueltigBis ?? '' },
            ...bisherige,
          ]);
        },
      });
    },
  };
}
