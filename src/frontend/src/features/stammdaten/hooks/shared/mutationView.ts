import type { ApiProblemError } from '@edms/shared';
import { t } from '../../../../shared/i18n/t';

/**
 * Der gemeinsame Anzeige-Zustand JEDER schreibenden Stammdaten-Aktion.
 * Vor Einführung dieses Moduls wurde diese Form — inklusive einer
 * zeichengleichen `toSubmitErrorMessage`-Kopie — in 27 View-Hooks
 * dupliziert; Erfolgs-Rückmeldung gab es dabei in keinem.
 */
export interface MutationViewBasis {
  readonly isSubmitting: boolean;
  /** Server-/Submit-Fehler als fertiger Anzeigetext, `undefined` = kein Fehler. */
  readonly submitErrorMessage: string | undefined;
  /** Bestätigungstext nach erfolgreicher Aktion, `undefined` = (noch) kein Erfolg. */
  readonly erfolgsMeldung: string | undefined;
}

/**
 * Der Ausschnitt eines `UseMutationResult`, den `mutationViewBasis` liest —
 * bewusst strukturell statt der vollen TanStack-Typen: so ist die Fabrik ohne
 * React-Renderer testbar und bleibt gegenüber TanStack-Minor-Updates stabil.
 */
export interface MutationZustand {
  readonly isPending: boolean;
  readonly isSuccess: boolean;
  readonly error: ApiProblemError | null;
}

/**
 * Übersetzt einen `ApiProblemError` in einen Anzeigetext: bevorzugt das
 * `detail` des Servers (RFC 9457, fachlich präzise — z. B. „Zähler ist
 * bereits stillgelegt"), sonst der generische Fallback.
 */
export function toSubmitErrorMessage(error: ApiProblemError | null): string | undefined {
  if (error === null) {
    return undefined;
  }
  return error.detail ?? t('stammdaten.common.fehlerAllgemein');
}

/**
 * Leitet den gemeinsamen Anzeige-Zustand aus einer Mutation ab. Bewusst eine
 * REINE Funktion, kein Hook — sie ruft selbst kein `use*` auf; als Hook
 * getarnt würde sie nur unnötig an die Hook-Regeln gebunden.
 *
 * `erfolgsMeldung` ist optional: Views, die nach Erfolg WEGNAVIGIEREN (z. B.
 * `useEndkundeAnlegenView` → Detailseite), brauchen keine — die neue Seite
 * ist die Rückmeldung. Views, die stehen bleiben (Ändern-Formulare im Detail,
 * Stilllegen/Sperren), übergeben sie zwingend, sonst passiert für den Nutzer
 * sichtbar nichts.
 *
 * Selbstlöschend: `mutate()` setzt den Status sofort auf `pending`, `isSuccess`
 * fällt damit beim nächsten Submit von selbst weg — kein manuelles `reset()`.
 */
export function mutationViewBasis(mutation: MutationZustand, erfolgsMeldung?: string): MutationViewBasis {
  return {
    isSubmitting: mutation.isPending,
    submitErrorMessage: toSubmitErrorMessage(mutation.error),
    erfolgsMeldung: mutation.isSuccess ? erfolgsMeldung : undefined,
  };
}
