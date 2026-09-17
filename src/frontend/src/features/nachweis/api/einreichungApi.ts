// Einzige Stelle, die für die Einreichungs-Ressource `apiClient.GET/POST(...)`
// aufruft (`.claude/rules/frontend-react.md`).
//
// **Ehrlichkeitsklausel (ADR-0007 D7/B7):** Dieser Endpunkt VERMERKT eine
// bereits ausgeführte Handlung des Bedieners (z. B. einen manuellen
// BSCW-Upload) — er stellt nichts zu und bezeugt keinen Empfang durch die
// Behörde. Die Oberfläche formuliert entsprechend („vermerken", nicht
// „einreichen"/„senden").
//
// **Rollenschnitt (B10, bewusste Asymmetrie zum Export):** `read:einreichung`
// ist AUCH für `compliance-auditor` zugänglich — die Metadaten (wann, von
// wem, an wen, welcher Hash) sind sein Prüfgegenstand.

import {
  apiClient,
  toApiProblemError,
  type Einreichung,
  type EinreichungAnlegen,
  type EinreichungDifferenzListe,
} from '@edms/shared';
import type { CursorParams } from '../../stammdaten/api/shared';

export interface EinreichungVermerkenInput extends EinreichungAnlegen {
  readonly exportId: string;
}

/** `POST /nachweis/exporte/{exportId}/einreichungen` (`create:einreichung`, Rolle `betrieb`). */
export async function postEinreichungVermerken(
  input: EinreichungVermerkenInput,
  idempotencyKey: string,
): Promise<Einreichung> {
  const { exportId, ...body } = input;
  const { data, error } = await apiClient.POST('/nachweis/exporte/{exportId}/einreichungen', {
    params: { path: { exportId }, header: { 'Idempotency-Key': idempotencyKey } },
    body,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** `GET /nachweis/einreichungen/{einreichungId}`. */
export async function fetchEinreichungDetail(einreichungId: string): Promise<Einreichung> {
  const { data, error } = await apiClient.GET('/nachweis/einreichungen/{einreichungId}', {
    params: { path: { einreichungId } },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

// `einreichungId` ist ein PFAD-Parameter (Sub-Ressource, KEIN Query-Filter) —
// s. `PreflightBefundeListenFilter`.
export interface EinreichungDifferenzenListenFilter {
  readonly [key: string]: string | number | boolean | undefined;
  readonly einreichungId: string;
}

/**
 * `GET /nachweis/einreichungen/{id}/differenzen` — TB-01/TB-08-Darlegung.
 * NUR bei Korrektur-Einreichungen nicht-leer.
 */
export async function fetchEinreichungDifferenzenSeite(
  params: CursorParams & EinreichungDifferenzenListenFilter,
): Promise<EinreichungDifferenzListe> {
  const { data, error } = await apiClient.GET('/nachweis/einreichungen/{einreichungId}/differenzen', {
    params: {
      path: { einreichungId: params.einreichungId },
      query: {
        ...(params.cursor !== undefined ? { cursor: params.cursor } : {}),
        ...(params.limit !== undefined ? { limit: params.limit } : {}),
      },
    },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}
