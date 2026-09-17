// Einzige Stelle, die fuer den Consent-Kontext `apiClient.*` aufruft
// (`.claude/rules/frontend-react.md`).

import {
  apiClient,
  toApiProblemError,
  type ConsentTextVersion,
  type ConsentTextVersionVeroeffentlichen,
  type ConsentZweck,
  type Einwilligung,
  type EinwilligungErteilen,
  type EinwilligungWiderrufen,
  type SubjektConsentStand,
  type SubjektTyp,
  type Widerspruch,
  type WiderspruchErklaeren,
  type WiderspruchZuruecknehmen,
} from '@edms/shared';

/** `GET /consent/zwecke` */
export async function fetchZwecke(): Promise<readonly ConsentZweck[]> {
  const { data, error } = await apiClient.GET('/consent/zwecke', {});
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** `GET /consent/texte` — optional auf einen Zweck eingegrenzt. */
export async function fetchTextVersionen(zweck?: string): Promise<readonly ConsentTextVersion[]> {
  const { data, error } = await apiClient.GET('/consent/texte', {
    params: { query: zweck !== undefined ? { zweck } : {} },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** `POST /consent/texte` */
export async function veroeffentlicheTextVersion(
  input: ConsentTextVersionVeroeffentlichen,
  idempotencyKey: string,
): Promise<ConsentTextVersion> {
  const { data, error } = await apiClient.POST('/consent/texte', {
    params: { header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** `GET /consent/einwilligungen` — Stand EINES Subjekts ueber alle Zwecke. */
export async function fetchConsentStand(subjektTyp: SubjektTyp, subjektId: string): Promise<SubjektConsentStand> {
  const { data, error } = await apiClient.GET('/consent/einwilligungen', {
    params: { query: { subjektTyp, subjektId } },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** `POST /consent/einwilligungen` */
export async function erteileEinwilligung(
  input: EinwilligungErteilen,
  idempotencyKey: string,
): Promise<Einwilligung> {
  const { data, error } = await apiClient.POST('/consent/einwilligungen', {
    params: { header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/**
 * `POST /consent/einwilligungen/{id}/widerruf` — bewusst POST, nicht DELETE:
 * Es verschwindet nichts. Die Einwilligung bleibt stehen und traegt danach
 * einen Widerrufszeitpunkt.
 */
export async function widerrufeEinwilligung(
  id: string,
  input: EinwilligungWiderrufen,
  idempotencyKey: string,
): Promise<Einwilligung> {
  const { data, error } = await apiClient.POST('/consent/einwilligungen/{einwilligungId}/widerruf', {
    params: { path: { einwilligungId: id }, header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/**
 * `GET /consent/widersprueche` — der Verlauf EINER Person.
 *
 * Bewusst eine eigene Abfrage und nicht Teil des Consent-Stands: Ein
 * Widerspruch ist kein Zustand einer Einwilligung, sondern eine eigene
 * Erklärung zu einer Verarbeitung, die es auch OHNE Zustimmung gibt. Der
 * Server hält beides getrennt, und die Oberfläche führt es erst dort
 * zusammen, wo es angezeigt wird.
 *
 * Vollständig, auch zurückgenommene: Der Zeitraum, in dem widersprochen war,
 * entscheidet, ob eine Verarbeitung in dieser Zeit zulässig war.
 */
export async function fetchWidersprueche(
  subjektTyp: SubjektTyp,
  subjektId: string,
): Promise<readonly Widerspruch[]> {
  const { data, error } = await apiClient.GET('/consent/widersprueche', {
    params: { query: { subjektTyp, subjektId } },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** `POST /consent/widersprueche` */
export async function erklaereWiderspruch(
  input: WiderspruchErklaeren,
  idempotencyKey: string,
): Promise<Widerspruch> {
  const { data, error } = await apiClient.POST('/consent/widersprueche', {
    params: { header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/**
 * `POST /consent/widersprueche/{id}/ruecknahme` — wie beim Widerruf bewusst
 * POST und nicht DELETE: Es verschwindet nichts. Würde die Erklärung
 * gelöscht, verschwände auch der Nachweis über den Zeitraum, in dem
 * widersprochen war.
 */
export async function nimmWiderspruchZurueck(
  id: string,
  input: WiderspruchZuruecknehmen,
  idempotencyKey: string,
): Promise<Widerspruch> {
  const { data, error } = await apiClient.POST('/consent/widersprueche/{widerspruchId}/ruecknahme', {
    params: { path: { widerspruchId: id }, header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}
