import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import type {
  ApiProblemError,
  Entbehrlichkeit,
  EntbehrlichVermerken,
  Geraetegruppe,
  GeraetegruppeAnlegen,
  GeraeteZuordnung,
  GeraeteZuordnungAnlegen,
  GeraeteZuordnungBeenden,
  ZuordnungsQuote,
} from '@edms/shared';
import { createResourceQueryKeys } from '../../stammdaten/api/shared';
import {
  beendeZuordnung,
  fetchEntbehrlichkeit,
  fetchGruppen,
  fetchQuote,
  fetchZuordnungen,
  legeGruppeAn,
  legeZuordnungAn,
  vermerkeEntbehrlich,
} from './geraeteerkennungApi';

export const gruppenKeys = createResourceQueryKeys('geraetegruppe');
export const zuordnungKeys = createResourceQueryKeys('geraete-zuordnung');
export const quoteKeys = createResourceQueryKeys('geraete-quote');
export const entbehrlichkeitKeys = createResourceQueryKeys('geraete-entbehrlichkeit');

export function useEntbehrlichkeit(systemId: string): UseQueryResult<Entbehrlichkeit, ApiProblemError> {
  return useQuery<Entbehrlichkeit, ApiProblemError>({
    queryKey: entbehrlichkeitKeys.detail(systemId),
    queryFn: () => fetchEntbehrlichkeit(systemId),
  });
}

/**
 * `enabled` ist noetig, weil die Gruppen auch dort gebraucht werden, wo die
 * `endkundeId` erst ueber eine Kette aufgeloest wird (Messkanal -> Zaehler ->
 * System -> Endkunde). Ohne den Schalter liefe eine Abfrage mit leerer ID.
 */
export function useGruppen(
  endkundeId: string,
  options?: { readonly enabled?: boolean },
): UseQueryResult<readonly Geraetegruppe[], ApiProblemError> {
  return useQuery<readonly Geraetegruppe[], ApiProblemError>({
    queryKey: gruppenKeys.liste({ endkundeId }),
    queryFn: () => fetchGruppen(endkundeId),
    enabled: options?.enabled ?? true,
  });
}

export function useZuordnungen(
  endkundeId: string,
): UseQueryResult<readonly GeraeteZuordnung[], ApiProblemError> {
  return useQuery<readonly GeraeteZuordnung[], ApiProblemError>({
    queryKey: zuordnungKeys.liste({ endkundeId }),
    queryFn: () => fetchZuordnungen(endkundeId),
  });
}

/**
 * Die Quote wird nur abgefragt, wenn ein Foerderjahr gewaehlt ist: Sie ist je
 * Projektjahr definiert, und ohne Jahr gibt es keine Sollquote, gegen die man
 * sie halten koennte.
 */
export function useQuote(
  endkundeId: string,
  energietraeger: string,
  foerderjahrId: string | undefined,
): UseQueryResult<ZuordnungsQuote, ApiProblemError> {
  return useQuery<ZuordnungsQuote, ApiProblemError>({
    queryKey: quoteKeys.liste({ endkundeId, energietraeger, foerderjahrId: foerderjahrId ?? '' }),
    queryFn: () => fetchQuote(endkundeId, energietraeger, foerderjahrId ?? ''),
    enabled: foerderjahrId !== undefined && foerderjahrId !== '',
  });
}

export function useGruppeAnlegen(): UseMutationResult<Geraetegruppe, ApiProblemError, GeraetegruppeAnlegen> {
  const queryClient = useQueryClient();
  return useMutation<Geraetegruppe, ApiProblemError, GeraetegruppeAnlegen>({
    mutationFn: (input) => legeGruppeAn(input, crypto.randomUUID()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: gruppenKeys.listen() });
    },
  });
}

/**
 * Jede Änderung an einer Zuordnung ändert die QUOTE — deshalb wird sie
 * mitinvalidiert. Eine Oberfläche, die eine neue Zuordnung zeigt und daneben
 * die alte Quote stehen lässt, ist schlimmer als eine, die gar nichts zeigt.
 */
export function useZuordnungAnlegen(): UseMutationResult<
  GeraeteZuordnung,
  ApiProblemError,
  GeraeteZuordnungAnlegen
> {
  const queryClient = useQueryClient();
  return useMutation<GeraeteZuordnung, ApiProblemError, GeraeteZuordnungAnlegen>({
    mutationFn: (input) => legeZuordnungAn(input, crypto.randomUUID()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: zuordnungKeys.listen() });
      void queryClient.invalidateQueries({ queryKey: quoteKeys.listen() });
    },
  });
}

export function useZuordnungBeenden(): UseMutationResult<
  GeraeteZuordnung,
  ApiProblemError,
  GeraeteZuordnungBeenden
> {
  const queryClient = useQueryClient();
  return useMutation<GeraeteZuordnung, ApiProblemError, GeraeteZuordnungBeenden>({
    mutationFn: (input) => beendeZuordnung(input, crypto.randomUUID()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: zuordnungKeys.listen() });
      void queryClient.invalidateQueries({ queryKey: quoteKeys.listen() });
    },
  });
}

export interface EntbehrlichEingabe {
  readonly systemId: string;
  readonly eingabe: EntbehrlichVermerken;
}

export function useEntbehrlichVermerken(): UseMutationResult<void, ApiProblemError, EntbehrlichEingabe> {
  const queryClient = useQueryClient();
  return useMutation<void, ApiProblemError, EntbehrlichEingabe>({
    mutationFn: ({ systemId, eingabe }) => vermerkeEntbehrlich(systemId, eingabe, crypto.randomUUID()),
    onSuccess: () => {
      // Die Entbehrlichkeit steht in der Quote-Antwort (`systemeEntbehrlich`),
      // auch wenn sie die Zahl selbst nicht veraendert.
      void queryClient.invalidateQueries({ queryKey: quoteKeys.listen() });
      void queryClient.invalidateQueries({ queryKey: entbehrlichkeitKeys.all });
    },
  });
}
