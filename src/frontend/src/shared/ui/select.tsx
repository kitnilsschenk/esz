// KEIN Radix-„Select"-Compound (`SelectTrigger`/`SelectContent`/
// `SelectItem`, wie in Design-System „Form-Elemente" gezeigt) — das wäre
// `@radix-ui/react-select`, für diesen Auftrag keine freigegebene
// Abhängigkeit (Deps-Liste des Auftrags). Stattdessen ein gestyltes,
// natives `<select>` (volle Tastatur-/Screenreader-Unterstützung ohne
// jede Zusatzlogik, `.claude/rules/frontend-react.md`: „semantisches
// HTML") mit Chevron-Icon-Overlay — API-Fläche daher ein einzelnes
// `Select`, keine Sub-Komponenten. Siehe Abschlussbericht „offene Punkte"
// für den Kompromiss + eine mögliche spätere Radix-Ergänzung.
import { forwardRef, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../lib/cn';

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

/** Select-Primitive (natives `<select>`, Design-System-Optik). `children` = `<option>`-Elemente (wie gehabt in `EntityForm`). */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(({ className, children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      className={cn(
        'flex h-10 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 pr-8 text-sm text-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive',
        className,
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown
      aria-hidden="true"
      className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
    />
  </div>
));
Select.displayName = 'Select';
