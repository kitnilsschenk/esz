import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export type StatusTon = 'erfolg' | 'fehler' | 'hinweis';

export interface StatusRegionProps {
  readonly ton: StatusTon;
  /** `undefined` = nichts anzuzeigen. Die Live-Region bleibt trotzdem gemountet, s. Klassendoku. */
  readonly nachricht: string | undefined;
  readonly className?: string;
}

const TON_KLASSEN: Readonly<Record<StatusTon, string>> = {
  erfolg: 'rounded-md border border-primary/50 bg-primary/10 px-4 py-3 text-sm font-medium text-link',
  fehler: 'rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive-text',
  hinweis: 'rounded-md border border-warning/60 bg-warning/10 px-4 py-3 text-sm text-foreground',
};

/**
 * Einheitliche Rückmeldung nach einer schreibenden Aktion (Erfolg, Fehler,
 * Hinweis) — WCAG 2.2 AA 4.1.3 „Status Messages".
 *
 * Die beiden Töne verhalten sich im DOM bewusst UNTERSCHIEDLICH:
 *
 * - **`fehler`** rendert `role="alert"` und nur DANN, wenn es etwas zu melden
 *   gibt. `alert` ist implizit `aria-live="assertive"` und wird auch beim
 *   Einfügen ins DOM zuverlässig vorgelesen — eine dauerhaft leere
 *   Alert-Region wäre hier nicht nur unnötig, sondern schädlich: sie erzeugt
 *   einen zweiten, inhaltsleeren Alert-Knoten neben den Feld-Fehlermeldungen
 *   (die ebenfalls `role="alert"` tragen) und macht „die" Fehlermeldung einer
 *   Seite mehrdeutig.
 *
 * - **`erfolg`/`hinweis`** rendern `role="status"` + `aria-live="polite"` und
 *   bleiben IMMER gemountet. Eine polite Region, die erst zusammen mit ihrem
 *   Text eingefügt wird, wird von mehreren Screenreadern verschluckt — sie
 *   muss beim Textwechsel bereits beobachtet werden. Ohne Nachricht trägt der
 *   Knoten `sr-only`: `position: absolute`, nimmt also KEINEN Platz im Fluss
 *   ein (wichtig, weil mehrere Aufrufer in `flex … gap-4`-Containern sitzen,
 *   wo ein leeres Blockelement eine sichtbare Lücke erzeugen würde) und bleibt
 *   zugleich im Accessibility-Tree (anders als `hidden`/`display:none`).
 */
export function StatusRegion({ ton, nachricht, className }: StatusRegionProps): ReactNode {
  const hatNachricht = nachricht !== undefined && nachricht.length > 0;

  if (ton === 'fehler') {
    return hatNachricht ? (
      <p role="alert" className={cn(TON_KLASSEN.fehler, className)}>
        {nachricht}
      </p>
    ) : null;
  }

  return (
    <p role="status" aria-live="polite" className={hatNachricht ? cn(TON_KLASSEN[ton], className) : 'sr-only'}>
      {nachricht}
    </p>
  );
}
