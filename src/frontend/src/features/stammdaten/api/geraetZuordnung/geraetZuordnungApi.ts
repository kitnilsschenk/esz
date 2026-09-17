// Einzige Stelle, die für die Geräte-Zuordnung `apiClient.POST/PATCH(...)`
// aufruft (`.claude/rules/frontend-react.md`).
//
// **Es gibt hier bewusst KEIN Lesen.** Der Zustand der Anbindung kommt als
// Feld `geraetAnbindung` am `ZaehlerDetail` mit (ADR-0011 D7) — dieselbe
// Abfrage, die die Detailseite ohnehin macht. Die break-glass-gehärtete
// Reverse-Auflösung (`POST .../reverse-aufloesung`, Rolle `geraete-support`,
// Zweck-Whitelist, Ticket, Quota) ist NICHT Teil dieses Bausteins: Sie löst
// eine Kennung in eine Klartext-DevEUI auf und gehört in einen eigenen,
// eigens gestalteten Vorgang — nicht neben einen Formular-Knopf.

import {
  apiClient,
  toApiProblemError,
  type GeraetZuordnungDetail,
} from '@edms/shared';

export interface GeraetZuordnungAnlegenInput {
  readonly zaehlerId: string;
  readonly devEui: string;
}

/**
 * `POST /stammdaten/zaehler/{zaehlerId}/geraet-zuordnungen`
 * (`create:geraet_zuordnung`, Rolle `betrieb`).
 *
 * Der Server nimmt die DevEUI entgegen, verschlüsselt sie und gibt sie NIE
 * wieder heraus — auch nicht in dieser Antwort. Höchstens eine aktive
 * Zuordnung je Zähler, und dieselbe DevEUI nicht gleichzeitig an zwei
 * Zählern; beides beantwortet der Server mit einem Konflikt.
 */
export async function postGeraetZuordnungAnlegen(
  input: GeraetZuordnungAnlegenInput,
  idempotencyKey: string,
): Promise<GeraetZuordnungDetail> {
  const { data, error } = await apiClient.POST('/stammdaten/zaehler/{zaehlerId}/geraet-zuordnungen', {
    params: { path: { zaehlerId: input.zaehlerId }, header: { 'Idempotency-Key': idempotencyKey } },
    body: { devEui: input.devEui },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/**
 * `PATCH /stammdaten/geraet-zuordnungen/{id}` (`update:geraet_zuordnung`,
 * Rolle `betrieb`) — IDEMPOTENT. Ein Gerätetausch ist bewusst zwei Schritte:
 * erst hier beenden, dann neu anlegen.
 */
export async function patchGeraetZuordnungDeaktivieren(
  geraetZuordnungId: string,
  idempotencyKey: string,
): Promise<GeraetZuordnungDetail> {
  const { data, error } = await apiClient.PATCH('/stammdaten/geraet-zuordnungen/{geraetZuordnungId}', {
    params: { path: { geraetZuordnungId }, header: { 'Idempotency-Key': idempotencyKey } },
    body: { aktion: 'deaktivieren' },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}
