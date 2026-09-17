import { ApiProblemError } from '@edms/shared';

/** Wie oft ein Fehlschlag höchstens wiederholt wird (nur bei Server-/Netzfehlern). */
export const MAX_RETRIES = 1;

/**
 * Entscheidet, ob eine fehlgeschlagene Query wiederholt wird.
 *
 * Wiederholt NUR, was durch einen erneuten Versuch überhaupt heilen kann:
 * Server-/Infrastrukturfehler (5xx) und Fehler ohne HTTP-Status (Netzabbruch,
 * DNS, abgebrochene Verbindung). Ein 4xx ist eine Aussage über die ANFRAGE
 * (400 ungültig, 403 verboten, 404 nicht da, 409 Konflikt) — ein Retry ändert
 * daran nichts, kostet nur Latenz und erzeugt auf dem auditierten Backend
 * einen zweiten Eintrag für denselben Nutzerklick.
 *
 * 401 ist bewusst NICHT dabei: den behandeln `QueryCache`/`MutationCache`
 * (`queryClient.ts`) über den stillen Refresh, nicht über blindes Wiederholen.
 */
export function sollWiederholen(anzahlFehlversuche: number, error: unknown): boolean {
  if (anzahlFehlversuche >= MAX_RETRIES) {
    return false;
  }
  if (!(error instanceof ApiProblemError)) {
    return true;
  }
  return error.status >= 500;
}
