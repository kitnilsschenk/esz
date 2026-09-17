// Einzige Stelle, die für die Nutzungsverhältnis-Ressource `apiClient.GET/
// POST/PATCH(...)` aufruft (`.claude/rules/frontend-react.md`). Jede
// Funktion hier mappt Fehler sofort über `toApiProblemError` (analog
// `zaehlerApi.ts`). KEIN DELETE/Stilllegen — Nutzungsverhältnis wird über
// `beenden` (PATCH, `gueltigBis`-Body) abgeschlossen, kein Hard-Delete.

import {
  apiClient,
  toApiProblemError,
  type NutzungsverhaeltnisAnlegen,
  type NutzungsverhaeltnisBeenden,
  type NutzungsverhaeltnisDetail,
  type NutzungsverhaeltnisListe,
} from '@edms/shared';
import type { CursorParams } from '../shared';

// Index-Signatur zwingend (strukturelle Kompatibilität mit `ListenFilter`,
// analog `SystemeListenFilter`/`ZaehlerListenFilter`). Kein `nurAktuelle`-
// Filter in diesem Pass (offener Punkt, Abschlussbericht) — die
// Backend-Query unterstützt ihn bereits (`NutzungsverhaeltnisListQueryDto`).
export interface NutzungsverhaeltnisListenFilter {
  readonly [key: string]: string | number | boolean | undefined;
  readonly endkundeId?: string;
  readonly anschlussnutzerId?: string;
  readonly systemId?: string;
}

export async function fetchNutzungsverhaeltnisseSeite(
  params: CursorParams & NutzungsverhaeltnisListenFilter,
): Promise<NutzungsverhaeltnisListe> {
  const { data, error } = await apiClient.GET('/stammdaten/nutzungsverhaeltnisse', {
    params: {
      query: {
        ...(params.cursor !== undefined ? { cursor: params.cursor } : {}),
        ...(params.limit !== undefined ? { limit: params.limit } : {}),
        ...(params.endkundeId !== undefined ? { endkundeId: params.endkundeId } : {}),
        ...(params.anschlussnutzerId !== undefined ? { anschlussnutzerId: params.anschlussnutzerId } : {}),
        ...(params.systemId !== undefined ? { systemId: params.systemId } : {}),
      },
    },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

export async function fetchNutzungsverhaeltnisDetail(nutzungsverhaeltnisId: string): Promise<NutzungsverhaeltnisDetail> {
  const { data, error } = await apiClient.GET('/stammdaten/nutzungsverhaeltnisse/{nutzungsverhaeltnisId}', {
    params: { path: { nutzungsverhaeltnisId } },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

export async function postNutzungsverhaeltnisAnlegen(
  input: NutzungsverhaeltnisAnlegen,
  idempotencyKey: string,
): Promise<NutzungsverhaeltnisDetail> {
  const { data, error } = await apiClient.POST('/stammdaten/nutzungsverhaeltnisse', {
    params: { header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/**
 * IDEMPOTENT bzgl. DESSELBEN Endzeitpunkts (Backend-Service): erneutes
 * Beenden mit identischem `gueltigBis` liefert denselben 200er; ein
 * ABWEICHENDER Endzeitpunkt auf einem bereits beendeten Verhältnis ist ein
 * Konflikt (409, problem+json — die UI zeigt dies über `submitErrorMessage`,
 * blendet die Aktion aber ohnehin aus, sobald `gueltigBis` bereits gesetzt
 * ist).
 */
export async function patchNutzungsverhaeltnisBeenden(
  nutzungsverhaeltnisId: string,
  input: NutzungsverhaeltnisBeenden,
  idempotencyKey: string,
): Promise<NutzungsverhaeltnisDetail> {
  const { data, error } = await apiClient.PATCH('/stammdaten/nutzungsverhaeltnisse/{nutzungsverhaeltnisId}', {
    params: { path: { nutzungsverhaeltnisId }, header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}
