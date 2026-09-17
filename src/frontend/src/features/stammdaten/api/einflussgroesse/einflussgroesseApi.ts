// Einzige Stelle, die für die Einflussgrößen-Ressource `apiClient.GET/POST/
// PATCH(...)` aufruft (`.claude/rules/frontend-react.md`). Sub-Ressource
// EINES Systems (`create:`/`read:einflussgroesse`, RL-B1) bzw. direkt
// adressiert über ihre eigene ID (`update:einflussgroesse`, PATCH schließt
// IMMER + legt optional eine Korrektur-Zeile an).

import {
  apiClient,
  toApiProblemError,
  type EinflussgroesseDetail,
  type EinflussgroesseErfassen,
  type EinflussgroesseKorrekturErgebnis,
  type EinflussgroesseKorrigieren,
} from '@edms/shared';

/**
 * `read:einflussgroesse` (`GET /stammdaten/systeme/{systemId}/einflussgroessen`)
 * — VOLLSTÄNDIGE Klartext-Intervalle des Systems (Server: "bewusst
 * UNPAGINIERT, fachlich bounded: fünf Katalog-Codes je System"). JEDER
 * Aufruf wird serverseitig auditiert (`einflussgroesse.stammdaten.einsicht`)
 * — s. `useEinflussgroesseListeFuerSystem.ts` für das CTA-Gate, das diesen
 * Aufruf NICHT beiläufig auslöst.
 */
export async function fetchEinflussgroessenFuerSystem(systemId: string): Promise<readonly EinflussgroesseDetail[]> {
  const { data, error } = await apiClient.GET('/stammdaten/systeme/{systemId}/einflussgroessen', {
    params: { path: { systemId } },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/**
 * `systemId` ist Teil des Eingabe-Objekts (nicht ein zweiter Funktions-
 * parameter) — so passt `postEinflussgroesseErfassen` unverändert in die
 * geteilte `createAnlegenMutation`-Fabrik (analog `MesskonzeptVersionAnlegenInput`).
 */
export interface EinflussgroesseErfassenInput extends EinflussgroesseErfassen {
  readonly systemId: string;
}

export async function postEinflussgroesseErfassen(
  input: EinflussgroesseErfassenInput,
  idempotencyKey: string,
): Promise<EinflussgroesseDetail> {
  const { systemId, ...body } = input;
  const { data, error } = await apiClient.POST('/stammdaten/systeme/{systemId}/einflussgroessen', {
    params: { path: { systemId }, header: { 'Idempotency-Key': idempotencyKey } },
    body,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/**
 * Schließt IMMER das adressierte Intervall (`gueltigBisMonat`) UND legt
 * optional (`body.korrektur`) eine neue Zeile an — EIN PATCH-Aufruf für
 * beide Fälle (Server-Vertrag, s. `EinflussgroesseKorrigierenDto`-Kommentar).
 */
export async function patchEinflussgroesseKorrigieren(
  einflussgroesseId: string,
  input: EinflussgroesseKorrigieren,
  idempotencyKey: string,
): Promise<EinflussgroesseKorrekturErgebnis> {
  const { data, error } = await apiClient.PATCH('/stammdaten/einflussgroessen/{einflussgroesseId}', {
    params: { path: { einflussgroesseId }, header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}
