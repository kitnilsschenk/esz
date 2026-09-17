// Eigenentwicklung (kein `@radix-ui/react-tooltip` — keine freigegebene
// Abhängigkeit für diesen Auftrag, analog `select.tsx`/`confirm-dialog.tsx`).
// Info-Icon-Trigger + Text-Bubble, sichtbar bei Hover UND Tastatur-Fokus
// (WCAG 2.2 AA 1.4.13 „Content on Hover or Focus": per Esc schließbar, der
// Trigger bleibt fokussiert — kein Fokusverlust; die Bubble selbst enthält
// keine interaktiven Elemente, daher genügt Hover/Focus-Persistenz ohne
// eigenes `pointer-events`-Handling der Bubble).
import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { cn } from '../lib/cn';

export interface TooltipProps {
  /** Sichtbarer Erklärtext (Betriebs-UI-Konzept „Begriffserklärungen"). */
  readonly text: string;
  /** `aria-label` des Info-Icon-Triggers (z. B. "Erklärung zu Systemgrenze"). */
  readonly label: string;
  readonly className?: string;
}

/**
 * Info-Icon mit Erklär-Text (Betriebs-UI-Konzept Punkt 4/5
 * „Begriffserklärungen"). Öffnet bei Hover UND Tastatur-Fokus, schließt bei
 * `Escape`, `blur` oder `mouseleave`. Der Trigger ist ein `<button
 * type="button">` (fokussierbar, ohne Formular-Submit-Nebenwirkung) mit
 * `aria-describedby` auf die Bubble (`role="tooltip"`).
 */
export function Tooltip({ text, label, className }: TooltipProps): ReactNode {
  const [offen, setOffen] = useState(false);
  const tooltipId = useId();

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (event.key === 'Escape') {
      setOffen(false);
    }
  }

  return (
    <span className={cn('relative inline-flex', className)}>
      <button
        type="button"
        aria-describedby={tooltipId}
        aria-label={label}
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onMouseEnter={() => setOffen(true)}
        onMouseLeave={() => setOffen(false)}
        onFocus={() => setOffen(true)}
        onBlur={() => setOffen(false)}
        onKeyDown={handleKeyDown}
      >
        <Info aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 w-max max-w-xs -translate-x-1/2 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md',
          offen ? 'visible opacity-100' : 'invisible opacity-0',
        )}
      >
        {text}
      </span>
    </span>
  );
}
