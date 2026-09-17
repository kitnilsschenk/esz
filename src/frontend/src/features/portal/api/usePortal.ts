import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  ApiProblemError,
  NutzerinfoBericht,
  Nutzerinformation,
  PortalAnmeldungAntwort,
  PortalAnmeldungEingabe,
  PortalEinloesenEingabe,
  PortalIch,
  PortalWiderspruchStand,
  PortalZugangAusgabe,
  PortalZugangStand,
} from '@edms/shared';
import { createIdempotencyKey, createResourceQueryKeys } from '../../stammdaten/api/shared';
import {
  fetchEigeneInformationen,
  fetchEigenenBericht,
  fetchIch,
  fetchWiderspruchStand,
  fetchZugangStand,
  gibZugangscodeAus,
  loeseZugangEin,
  meldeAb,
  meldeAn,
  nimmWiderspruchZurueck,
  sperreZugang,
  widersprich,
} from './portalApi';

export const portalSitzungKeys = createResourceQueryKeys('portal-sitzung');
export const portalInformationKeys = createResourceQueryKeys('portal-information');
export const portalBerichtKeys = createResourceQueryKeys('portal-bericht');
export const portalWiderspruchKeys = createResourceQueryKeys('portal-widerspruch');

/**
 * Die Sitzungsprobe.
 *
 * `retry: false` ist hier wesentlich: Eine fehlende Sitzung ist der
 * NORMALFALL beim ersten Aufruf der Seite, kein Ausfall. Wiederholte Versuche
 * verzoegerten nur die Anmeldemaske.
 */
export function usePortalSitzung(): UseQueryResult<PortalIch, ApiProblemError> {
  return useQuery<PortalIch, ApiProblemError>({
    queryKey: portalSitzungKeys.detail('ich'),
    queryFn: fetchIch,
    retry: false,
    staleTime: 60_000,
  });
}

export function usePortalInformationen(): UseQueryResult<readonly Nutzerinformation[], ApiProblemError> {
  return useQuery<readonly Nutzerinformation[], ApiProblemError>({
    queryKey: portalInformationKeys.listen(),
    queryFn: fetchEigeneInformationen,
  });
}

export function usePortalBericht(informationId: string): UseQueryResult<NutzerinfoBericht, ApiProblemError> {
  return useQuery<NutzerinfoBericht, ApiProblemError>({
    queryKey: portalBerichtKeys.detail(informationId),
    queryFn: () => fetchEigenenBericht(informationId),
  });
}

export function usePortalWiderspruch(): UseQueryResult<PortalWiderspruchStand, ApiProblemError> {
  return useQuery<PortalWiderspruchStand, ApiProblemError>({
    queryKey: portalWiderspruchKeys.detail('nutzerinformation'),
    queryFn: fetchWiderspruchStand,
  });
}

/**
 * Anmelden bzw. Einlösen.
 *
 * Nach Erfolg wird ALLES verworfen, was im Cache liegt — nicht nur die
 * Sitzung. Sonst zeigte ein Gerät, auf dem sich nacheinander zwei Personen
 * anmelden, der zweiten die Zahlen der ersten, bis der erste Nachlauf
 * durch ist.
 */
export function usePortalAnmeldung(): UseMutationResult<
  PortalAnmeldungAntwort,
  ApiProblemError,
  PortalAnmeldungEingabe
> {
  const queryClient = useQueryClient();
  return useMutation<PortalAnmeldungAntwort, ApiProblemError, PortalAnmeldungEingabe>({
    mutationFn: meldeAn,
    onSuccess: () => {
      queryClient.clear();
    },
  });
}

export function usePortalEinloesen(): UseMutationResult<
  PortalAnmeldungAntwort,
  ApiProblemError,
  PortalEinloesenEingabe
> {
  const queryClient = useQueryClient();
  return useMutation<PortalAnmeldungAntwort, ApiProblemError, PortalEinloesenEingabe>({
    mutationFn: loeseZugangEin,
    onSuccess: () => {
      queryClient.clear();
    },
  });
}

/**
 * Abmelden.
 *
 * Der Cache wird auch dann geleert, wenn der Server-Aufruf scheitert: Ein
 * Abmelden, das die Zahlen auf dem Bildschirm stehen lässt, ist kein
 * Abmelden. Das Cookie ist dann zwar noch gesetzt, aber der Browser zeigt
 * nichts mehr, und der nächste Abruf läuft in die Anmeldemaske.
 */
export function usePortalAbmeldung(): UseMutationResult<void, ApiProblemError, void> {
  const queryClient = useQueryClient();
  return useMutation<void, ApiProblemError, void>({
    mutationFn: meldeAb,
    onSettled: () => {
      queryClient.clear();
    },
  });
}

export function usePortalWidersprechen(): UseMutationResult<PortalWiderspruchStand, ApiProblemError, void> {
  const queryClient = useQueryClient();
  return useMutation<PortalWiderspruchStand, ApiProblemError, void>({
    mutationFn: widersprich,
    onSuccess: (stand) => {
      queryClient.setQueryData(portalWiderspruchKeys.detail('nutzerinformation'), stand);
    },
  });
}

export function usePortalWiderspruchRuecknahme(): UseMutationResult<PortalWiderspruchStand, ApiProblemError, void> {
  const queryClient = useQueryClient();
  return useMutation<PortalWiderspruchStand, ApiProblemError, void>({
    mutationFn: nimmWiderspruchZurueck,
    onSuccess: (stand) => {
      queryClient.setQueryData(portalWiderspruchKeys.detail('nutzerinformation'), stand);
    },
  });
}

export const portalZugangKeys = createResourceQueryKeys('portal-zugang');

/** Der Stand des Portal-Zugangs eines Endkunden — Betriebssicht. */
export function usePortalZugangStand(endkundeId: string): UseQueryResult<PortalZugangStand, ApiProblemError> {
  return useQuery<PortalZugangStand, ApiProblemError>({
    queryKey: portalZugangKeys.detail(endkundeId),
    queryFn: () => fetchZugangStand(endkundeId),
  });
}

/**
 * Gibt einen Zugangscode aus.
 *
 * **Das Ergebnis landet bewusst NICHT im Query-Cache.** Es enthält den Code
 * im Klartext; ein Cache-Eintrag wäre eine zweite Stelle, an der er liegt,
 * und er überlebte den Bildschirm, auf dem er gebraucht wird. Die Ansicht
 * hält ihn in ihrem eigenen Zustand und verliert ihn beim Verlassen — genau
 * wie der Server.
 */
export function usePortalZugangAusgabe(
  endkundeId: string,
): UseMutationResult<PortalZugangAusgabe, ApiProblemError, void> {
  const queryClient = useQueryClient();
  return useMutation<PortalZugangAusgabe, ApiProblemError, void>({
    mutationFn: () => gibZugangscodeAus(endkundeId, createIdempotencyKey()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: portalZugangKeys.detail(endkundeId) });
    },
  });
}

export function usePortalZugangSperre(
  endkundeId: string,
): UseMutationResult<PortalZugangStand, ApiProblemError, void> {
  const queryClient = useQueryClient();
  return useMutation<PortalZugangStand, ApiProblemError, void>({
    mutationFn: () => sperreZugang(endkundeId, createIdempotencyKey()),
    onSuccess: (stand) => {
      queryClient.setQueryData(portalZugangKeys.detail(endkundeId), stand);
    },
  });
}
