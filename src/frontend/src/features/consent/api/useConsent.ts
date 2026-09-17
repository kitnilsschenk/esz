import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import type {
  ApiProblemError,
  ConsentTextVersion,
  ConsentTextVersionVeroeffentlichen,
  ConsentZweck,
  Einwilligung,
  EinwilligungErteilen,
  EinwilligungWiderrufen,
  SubjektConsentStand,
  SubjektTyp,
  Widerspruch,
  WiderspruchErklaeren,
  WiderspruchZuruecknehmen,
} from '@edms/shared';
import { createResourceQueryKeys } from '../../stammdaten/api/shared';
import { endkundeKeys } from '../../stammdaten/api/endkunde/endkundeKeys';
import { anschlussnutzerKeys } from '../../stammdaten/api/anschlussnutzer/anschlussnutzerKeys';
import {
  erklaereWiderspruch,
  erteileEinwilligung,
  fetchConsentStand,
  fetchTextVersionen,
  fetchWidersprueche,
  fetchZwecke,
  nimmWiderspruchZurueck,
  veroeffentlicheTextVersion,
  widerrufeEinwilligung,
} from './consentApi';

export const consentZweckKeys = createResourceQueryKeys('consent-zweck');
export const consentTextKeys = createResourceQueryKeys('consent-text');
export const consentStandKeys = createResourceQueryKeys('consent-stand');
export const widerspruchKeys = createResourceQueryKeys('consent-widerspruch');

/**
 * Der Zweck-Katalog ist eine geschlossene Liste, die sich nur mit einer
 * Migration aendert — `staleTime: Infinity` spart bei jedem Oeffnen einer
 * Detailseite eine Abfrage, ohne je zu veralten.
 */
export function useZwecke(): UseQueryResult<readonly ConsentZweck[], ApiProblemError> {
  return useQuery<readonly ConsentZweck[], ApiProblemError>({
    queryKey: consentZweckKeys.all,
    queryFn: fetchZwecke,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useTextVersionen(zweck?: string): UseQueryResult<readonly ConsentTextVersion[], ApiProblemError> {
  return useQuery<readonly ConsentTextVersion[], ApiProblemError>({
    queryKey: consentTextKeys.liste(zweck !== undefined ? { zweck } : {}),
    queryFn: () => fetchTextVersionen(zweck),
  });
}

/**
 * Der Consent-Stand EINES Subjekts. Bewusst `useQuery` statt der
 * Listen-Fabrik: Die Route ist nicht cursor-paginiert (sie liefert je Zweck
 * genau einen Eintrag), und sie betrifft immer genau ein Subjekt.
 */
export function useConsentStand(
  subjektTyp: SubjektTyp,
  subjektId: string,
): UseQueryResult<SubjektConsentStand, ApiProblemError> {
  return useQuery<SubjektConsentStand, ApiProblemError>({
    queryKey: consentStandKeys.detail(`${subjektTyp}:${subjektId}`),
    queryFn: () => fetchConsentStand(subjektTyp, subjektId),
  });
}

function neuerIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function useEinwilligungErteilen(): UseMutationResult<Einwilligung, ApiProblemError, EinwilligungErteilen> {
  const queryClient = useQueryClient();

  return useMutation<Einwilligung, ApiProblemError, EinwilligungErteilen>({
    mutationFn: (input) => erteileEinwilligung(input, neuerIdempotencyKey()),
    onSuccess: (_ergebnis, input) => {
      void queryClient.invalidateQueries({
        queryKey: consentStandKeys.detail(`${input.subjektTyp}:${input.subjektId}`),
      });
    },
  });
}

export interface WiderrufInput {
  readonly einwilligungId: string;
  readonly eingabe: EinwilligungWiderrufen;
  /** Nur fuer die Cache-Invalidierung — der Server braucht sie nicht. */
  readonly subjektTyp: SubjektTyp;
  readonly subjektId: string;
}

export function useEinwilligungWiderrufen(): UseMutationResult<Einwilligung, ApiProblemError, WiderrufInput> {
  const queryClient = useQueryClient();

  return useMutation<Einwilligung, ApiProblemError, WiderrufInput>({
    mutationFn: (input) => widerrufeEinwilligung(input.einwilligungId, input.eingabe, neuerIdempotencyKey()),
    onSuccess: (_ergebnis, input) => {
      void queryClient.invalidateQueries({
        queryKey: consentStandKeys.detail(`${input.subjektTyp}:${input.subjektId}`),
      });
    },
  });
}

export function useTextVersionVeroeffentlichen(): UseMutationResult<
  ConsentTextVersion,
  ApiProblemError,
  ConsentTextVersionVeroeffentlichen
> {
  const queryClient = useQueryClient();

  return useMutation<ConsentTextVersion, ApiProblemError, ConsentTextVersionVeroeffentlichen>({
    mutationFn: (input) => veroeffentlicheTextVersion(input, neuerIdempotencyKey()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: consentTextKeys.all });
    },
  });
}

/**
 * Die Widersprüche EINER Person, vollständig — auch die zurückgenommenen.
 *
 * Eigene Abfrage neben `useConsentStand`, weil der Server beides getrennt
 * führt: Ein Widerspruch ist kein Zustand einer Einwilligung. Zusammengeführt
 * wird erst in `useConsentStandView`, und zwar je Zweck.
 */
export function useWidersprueche(
  subjektTyp: SubjektTyp,
  subjektId: string,
): UseQueryResult<readonly Widerspruch[], ApiProblemError> {
  return useQuery<readonly Widerspruch[], ApiProblemError>({
    queryKey: widerspruchKeys.detail(`${subjektTyp}:${subjektId}`),
    queryFn: () => fetchWidersprueche(subjektTyp, subjektId),
  });
}

export function useWiderspruchErklaeren(): UseMutationResult<
  Widerspruch,
  ApiProblemError,
  WiderspruchErklaeren
> {
  const queryClient = useQueryClient();

  return useMutation<Widerspruch, ApiProblemError, WiderspruchErklaeren>({
    mutationFn: (input) => erklaereWiderspruch(input, neuerIdempotencyKey()),
    onSuccess: (_ergebnis, input) => {
      void queryClient.invalidateQueries({
        queryKey: widerspruchKeys.detail(`${input.subjektTyp}:${input.subjektId}`),
      });
      // Fuer `wiss_auswertung` setzt der Vorgang zugleich das
      // DE-04-Ausnahme-Attribut am Subjekt (AW-27). Die Stammdaten-Ansicht
      // zeigt es an — sie muss also mit nachziehen, sonst steht dort ein
      // Merkmal, das nicht mehr stimmt.
      void queryClient.invalidateQueries({ queryKey: endkundeKeys.all });
      void queryClient.invalidateQueries({ queryKey: anschlussnutzerKeys.all });
    },
  });
}

export interface WiderspruchRuecknahmeInput {
  readonly widerspruchId: string;
  readonly eingabe: WiderspruchZuruecknehmen;
  /** Nur fuer die Cache-Invalidierung — der Server braucht sie nicht. */
  readonly subjektTyp: SubjektTyp;
  readonly subjektId: string;
}

export function useWiderspruchZuruecknehmen(): UseMutationResult<
  Widerspruch,
  ApiProblemError,
  WiderspruchRuecknahmeInput
> {
  const queryClient = useQueryClient();

  return useMutation<Widerspruch, ApiProblemError, WiderspruchRuecknahmeInput>({
    mutationFn: (input) => nimmWiderspruchZurueck(input.widerspruchId, input.eingabe, neuerIdempotencyKey()),
    onSuccess: (_ergebnis, input) => {
      void queryClient.invalidateQueries({
        queryKey: widerspruchKeys.detail(`${input.subjektTyp}:${input.subjektId}`),
      });
      void queryClient.invalidateQueries({ queryKey: endkundeKeys.all });
      void queryClient.invalidateQueries({ queryKey: anschlussnutzerKeys.all });
    },
  });
}
