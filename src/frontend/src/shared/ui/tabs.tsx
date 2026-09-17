// Eigenentwicklung (kein `@radix-ui/react-tabs` — keine freigegebene
// Abhängigkeit für diesen Auftrag, analog `select.tsx`/`confirm-dialog.tsx`).
// DOM-/ARIA-Struktur folgt dem WAI-ARIA-APG-Referenzmuster für Tabs
// (https://www.w3.org/WAI/ARIA/apg/patterns/tabs/, automatische Aktivierung):
// `role="tablist"` mit `role="tab"`-Kindern (rovendes Tabindex-Muster, GENAU
// EIN Tab hat `tabIndex=0`) + EIN `role="tabpanel"` je aktivem Tab.
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface TabItem {
  readonly id: string;
  readonly label: string;
  readonly content: ReactNode;
}

export interface TabsProps {
  readonly items: readonly TabItem[];
  readonly ariaLabel: string;
}

/**
 * Barrierefreie Tabs-Primitive (Betriebs-UI-Konzept Punkt 4 „Verbrauch auf
 * Endkunden-Ebene" — erster Konsument: `EndkundeDetailAnsicht`s
 * „Übersicht"/„Verbrauch"-Tabs). Automatische Aktivierung (Pfeiltasten
 * bewegen Fokus UND Auswahl zugleich, APG-Standardmuster) — bei nur zwei
 * Tabs ist der Unterschied zur manuellen Aktivierung vernachlässigbar,
 * automatische Aktivierung braucht keinen zusätzlichen Bestätigungs-Tastendruck.
 * Nur das AKTIVE `tabpanel` wird ins DOM gerendert (kein `hidden`-Toggle
 * aller Panels) — vermeidet, dass ein inaktiver Tab (z. B. „Verbrauch")
 * bereits im Hintergrund Server-State lädt.
 */
export function Tabs({ items, ariaLabel }: TabsProps): ReactNode {
  const [aktiveId, setAktiveId] = useState<string | undefined>(items[0]?.id);
  const refs = useRef(new Map<string, HTMLButtonElement>());

  function fokussiereUndAktiviere(id: string): void {
    setAktiveId(id);
    refs.current.get(id)?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const index = items.findIndex((item) => item.id === aktiveId);
    if (index === -1) {
      return;
    }
    switch (event.key) {
      case 'ArrowRight': {
        event.preventDefault();
        const naechster = items[(index + 1) % items.length];
        if (naechster !== undefined) {
          fokussiereUndAktiviere(naechster.id);
        }
        break;
      }
      case 'ArrowLeft': {
        event.preventDefault();
        const vorheriger = items[(index - 1 + items.length) % items.length];
        if (vorheriger !== undefined) {
          fokussiereUndAktiviere(vorheriger.id);
        }
        break;
      }
      case 'Home': {
        event.preventDefault();
        const erster = items[0];
        if (erster !== undefined) {
          fokussiereUndAktiviere(erster.id);
        }
        break;
      }
      case 'End': {
        event.preventDefault();
        const letzter = items[items.length - 1];
        if (letzter !== undefined) {
          fokussiereUndAktiviere(letzter.id);
        }
        break;
      }
      default:
        break;
    }
  }

  const aktivesItem = items.find((item) => item.id === aktiveId);

  return (
    <div>
      <div role="tablist" aria-label={ariaLabel} onKeyDown={handleKeyDown} className="flex gap-1 border-b border-border">
        {items.map((item) => {
          const istAktiv = item.id === aktiveId;
          return (
            <button
              key={item.id}
              ref={(element) => {
                if (element) {
                  refs.current.set(item.id, element);
                } else {
                  refs.current.delete(item.id);
                }
              }}
              type="button"
              role="tab"
              id={`tab-${item.id}`}
              aria-selected={istAktiv}
              aria-controls={`tabpanel-${item.id}`}
              tabIndex={istAktiv ? 0 : -1}
              onClick={() => setAktiveId(item.id)}
              className={cn(
                '-mb-px rounded-t-md border-b-2 px-4 py-2 text-sm font-medium outline-none transition-colors',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                istAktiv
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {aktivesItem !== undefined && (
        <div role="tabpanel" id={`tabpanel-${aktivesItem.id}`} aria-labelledby={`tab-${aktivesItem.id}`} tabIndex={0} className="pt-4">
          {aktivesItem.content}
        </div>
      )}
    </div>
  );
}
