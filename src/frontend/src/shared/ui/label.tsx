// Struktur ist an das verbreitete shadcn/ui-Label-Pattern angelehnt (MIT,
// ui.shadcn.com) — hier bewusst als reines `<label>` ohne
// `@radix-ui/react-label` (für diesen Auftrag nicht freigegebene
// Abhängigkeit; ein natives `<label htmlFor>` erfüllt denselben A11y-Zweck
// ohne zusätzliche Laufzeit-Fläche, `.claude/rules/frontend-react.md`:
// „semantisches HTML").
import { forwardRef, type LabelHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export type LabelProps = LabelHTMLAttributes<HTMLLabelElement>;

/** Label-Primitive (Design-System „Form-Elemente"). IMMER mit `htmlFor` verwenden (Aufrufer-Pflicht, z. B. `EntityForm`). */
export const Label = forwardRef<HTMLLabelElement, LabelProps>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(
      'text-sm font-medium leading-none text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
      className,
    )}
    {...props}
  />
));
Label.displayName = 'Label';
