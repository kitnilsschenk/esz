import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { ApiProblemError, EinflussgroesseDetail } from '@edms/shared';
import { einflussgroesseKeys } from './einflussgroesseKeys';
import { fetchEinflussgroessenFuerSystem } from './einflussgroesseApi';

export interface EinflussgroesseListeOptions {
  /**
   * Steuert den CTA-Gate „Einflussgrößen anzeigen"
   * (`hooks/einflussgroesse/useEinflussgroesseListeView.ts`) — bleibt
   * `false`, bis die Nutzer:in den Klartext-Aufruf bewusst ausgelöst hat.
   */
  readonly aktiviert: boolean;
}

/**
 * `read:einflussgroesse` (`GET /stammdaten/systeme/{systemId}/einflussgroessen`)
 * ist eine Klartext-PII-Leseaktion, die serverseitig BEI JEDEM Aufruf
 * auditiert wird (EIN `einflussgroesse.stammdaten.einsicht`-Event je
 * HTTP-Call, `schemas/openapi/stammdaten.openapi.yaml`). Bewusst `useQuery`
 * (NICHT `useMutation` wie das break-glass-Pendant
 * `api/verbrauch/useMesskanalZeitreiheLesen.ts`) — anders als dort gibt es
 * hier KEINEN Zeitraum-Parameter (bounded Liste, max. fünf Katalog-Codes je
 * System), ein zweckgebundener Cache ist daher sinnvoll: `enabled` bleibt so
 * lange `false`, bis die aufrufende Seite den CTA ausgelöst hat; danach
 * hält ein hoher `staleTime` + `refetchOnWindowFocus:false` die
 * Klartext-Werte im Cache, OHNE bei jedem beiläufigen Fokuswechsel/Remount
 * (z. B. Browser-Zurück zur Liste) einen weiteren Audit-Eintrag zu erzeugen.
 *
 * Direkter `useQuery`-Aufruf statt der geteilten `createDetailQuery`-Fabrik,
 * weil diese weder `staleTime` noch `refetchOnWindowFocus` konfigurierbar
 * macht (die Fabrik bleibt bewusst UNVERÄNDERT,
 * `api/shared/createDetailQuery.ts`s Doku-Kommentar) — ein bewusster
 * Fabrik-Bypass ist bereits an anderer Stelle etabliert
 * (`useMesskanalZeitreiheLesen.ts`). Der Query-Key läuft trotzdem über die
 * geteilte `einflussgroesseKeys.liste({ systemId })`-Form (NICHT `.detail`),
 * damit `createAnlegenMutation`/`createAendernMutation`s Standard-
 * Invalidierung (`.listen()`, TanStack-Präfix-Matching) diesen Eintrag nach
 * `erfassen`/`korrigieren` korrekt mit invalidiert.
 */
export function useEinflussgroesseListeFuerSystem(
  systemId: string,
  options: EinflussgroesseListeOptions,
): UseQueryResult<readonly EinflussgroesseDetail[], ApiProblemError> {
  return useQuery<readonly EinflussgroesseDetail[], ApiProblemError>({
    queryKey: einflussgroesseKeys.liste({ systemId }),
    queryFn: () => fetchEinflussgroessenFuerSystem(systemId),
    enabled: options.aktiviert,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
