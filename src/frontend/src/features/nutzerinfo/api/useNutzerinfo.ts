import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import type {
  ApiProblemError,
  NutzerinfoBericht,
  Nutzerinformation,
  NutzerinfoLauf,
  NutzerinfoLaufErgebnis,
  NutzerinfoMonatsstand,
  NutzerinfoSammelZustellung,
  NutzerinfoSammelZustellungErgebnis,
  NutzerinfoZustellung,
} from '@edms/shared';
import { createResourceQueryKeys } from '../../stammdaten/api/shared';
import {
  fetchBericht,
  fetchInformationen,
  fetchMonatsstand,
  starteLauf,
  vermerkeSammelZustellung,
  vermerkeZustellung,
} from './nutzerinfoApi';

export const nutzerinfoKeys = createResourceQueryKeys('nutzerinfo-information');
export const nutzerinfoStatusKeys = createResourceQueryKeys('nutzerinfo-status');
export const nutzerinfoBerichtKeys = createResourceQueryKeys('nutzerinfo-bericht');

/** Der Bericht zu EINER Information — das, was der Endkunde zu sehen bekommt. */
export function useNutzerinfoBericht(
  informationId: string,
): UseQueryResult<NutzerinfoBericht, ApiProblemError> {
  return useQuery<NutzerinfoBericht, ApiProblemError>({
    queryKey: nutzerinfoBerichtKeys.detail(informationId),
    queryFn: () => fetchBericht(informationId),
  });
}

/** Der Monatsstand — Grundlage der Arbeitsplatz-Kachel. */
export function useNutzerinfoStatus(monat?: string): UseQueryResult<NutzerinfoMonatsstand, ApiProblemError> {
  return useQuery<NutzerinfoMonatsstand, ApiProblemError>({
    queryKey: nutzerinfoStatusKeys.liste(monat === undefined ? {} : { monat }),
    queryFn: () => fetchMonatsstand(monat),
  });
}

/**
 * Der Verlauf eines Endkunden.
 *
 * Bewusst `useQuery` statt der Cursor-Listen-Fabrik: Die Route ist nicht
 * paginiert, sondern auf die letzten `limit` Monate begrenzt — zwei Jahre
 * sind die uebliche Kundensicht, und wer weiter zurueck will, erhoeht die
 * Grenze. Ein Cursor waere hier Aufwand ohne Nutzen.
 */
export function useNutzerinformationen(
  endkundeId: string,
  limit?: number,
): UseQueryResult<readonly Nutzerinformation[], ApiProblemError> {
  return useQuery<readonly Nutzerinformation[], ApiProblemError>({
    queryKey: nutzerinfoKeys.liste(limit === undefined ? { endkundeId } : { endkundeId, limit }),
    queryFn: () => fetchInformationen(endkundeId, limit),
  });
}

/**
 * Der Erzeugungslauf.
 *
 * Invalidiert ALLE Verlaufslisten: Ein Monatslauf beruehrt viele Endkunden
 * auf einmal, und welche genau, sagt das Ergebnis nicht. Gezielt zu
 * invalidieren hiesse hier, es zu erraten.
 */
export function useNutzerinfoLauf(): UseMutationResult<NutzerinfoLaufErgebnis, ApiProblemError, NutzerinfoLauf> {
  const queryClient = useQueryClient();
  return useMutation<NutzerinfoLaufErgebnis, ApiProblemError, NutzerinfoLauf>({
    mutationFn: (input) => starteLauf(input, crypto.randomUUID()),
    onSuccess: (ergebnis) => {
      // Ein Probelauf hat nichts geschrieben -- die Listen sind unveraendert.
      if (ergebnis.modus === 'ausfuehrung') {
        void queryClient.invalidateQueries({ queryKey: nutzerinfoKeys.listen() });
        void queryClient.invalidateQueries({ queryKey: nutzerinfoStatusKeys.listen() });
      }
    },
  });
}

export interface ZustellungEingabe {
  readonly informationId: string;
  readonly eingabe: NutzerinfoZustellung;
}

export function useZustellungVermerken(): UseMutationResult<Nutzerinformation, ApiProblemError, ZustellungEingabe> {
  const queryClient = useQueryClient();
  return useMutation<Nutzerinformation, ApiProblemError, ZustellungEingabe>({
    mutationFn: ({ informationId, eingabe }) => vermerkeZustellung(informationId, eingabe, crypto.randomUUID()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: nutzerinfoKeys.listen() });
      // Auch der Monatsstand: Eine Zustellung verringert die offene Zahl, und
      // die Kachel auf dem Arbeitsplatz soll das sofort zeigen.
      void queryClient.invalidateQueries({ queryKey: nutzerinfoStatusKeys.listen() });
    },
  });
}

/**
 * Sammelzustellung für einen ganzen Monat.
 *
 * Nach Erfolg werden Verlauf UND Monatsstand verworfen: Der Vorgang ändert
 * potenziell hunderte Zeilen auf einmal, und die Kachel „offen" auf dem
 * Arbeitsplatz wäre sonst die einzige Stelle, die weiter die alte Zahl zeigt.
 */
export function useSammelZustellungVermerken(): UseMutationResult<
  NutzerinfoSammelZustellungErgebnis,
  ApiProblemError,
  NutzerinfoSammelZustellung
> {
  const queryClient = useQueryClient();
  return useMutation<NutzerinfoSammelZustellungErgebnis, ApiProblemError, NutzerinfoSammelZustellung>({
    mutationFn: (eingabe) => vermerkeSammelZustellung(eingabe, crypto.randomUUID()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: nutzerinfoKeys.listen() });
      void queryClient.invalidateQueries({ queryKey: nutzerinfoStatusKeys.listen() });
    },
  });
}
