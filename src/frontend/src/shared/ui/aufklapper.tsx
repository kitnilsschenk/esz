// Eigenentwicklung wie die übrigen Primitive dieses Ordners (kein
// Radix — keine freigegebene Abhängigkeit, s. `tabs.tsx`/`select.tsx`).
// DOM-/ARIA-Struktur folgt dem WAI-ARIA-APG-Muster „Disclosure":
// Schaltfläche mit `aria-expanded` + `aria-controls`, die den zugehörigen
// Bereich zeigt oder verbirgt.
import { useId, useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '../lib/cn';

export interface AufklapperProps {
  /** Beschriftung der Schaltfläche — benennt, was aufgeklappt wird. */
  readonly titel: string;
  /** Optionale Erläuterung unter der Schaltfläche, auch im zugeklappten Zustand sichtbar. */
  readonly hinweis?: string;
  readonly children: ReactNode;
  /** `true` = beim ersten Rendern offen. Default: zu. */
  readonly initialOffen?: boolean;
}

/**
 * Ein Abschnitt, der zugeklappt beginnt.
 *
 * **Wofür.** Formulare zum Anlegen sind Aktionen, keine Inhalte. Standen sie
 * dauerhaft ausgeklappt auf einer Betriebsseite, verdrängten sie das, weswegen
 * man die Seite geöffnet hat: Die Messdaten-Aufnahme trug zwei solche
 * Formulare mit zusammen über zwanzig Feldern, und der Arbeitsvorrat — der
 * eigentliche Grund für den Besuch — lag dahinter im Scroll.
 *
 * Zugeklappt heißt hier NICHT versteckt: Die Schaltfläche benennt die
 * Aktion, und ein optionaler Hinweis erklärt sie auch im geschlossenen
 * Zustand. Der Inhalt wird erst beim Öffnen gerendert — ein zugeklapptes
 * Formular hält weder Fokus noch Zustand fest.
 */
export function Aufklapper({ titel, hinweis, children, initialOffen = false }: AufklapperProps): ReactNode {
  const [offen, setOffen] = useState(initialOffen);
  const bereichId = useId();

  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        aria-expanded={offen}
        aria-controls={bereichId}
        onClick={() => {
          setOffen(!offen);
        }}
        className="flex w-full items-center gap-2 rounded-md px-4 py-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted"
      >
        <ChevronRight aria-hidden="true" className={cn('h-4 w-4 shrink-0 transition-transform', offen && 'rotate-90')} />
        {titel}
      </button>
      {hinweis !== undefined && !offen && (
        <p className="max-w-prose px-4 pb-3 pl-10 text-xs text-muted-foreground">{hinweis}</p>
      )}
      {offen && (
        <div id={bereichId} className="border-t border-border px-4 py-4">
          {children}
        </div>
      )}
    </div>
  );
}
