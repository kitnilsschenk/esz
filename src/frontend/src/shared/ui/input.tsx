// Struktur ist an das verbreitete shadcn/ui-Input-Pattern angelehnt (MIT,
// ui.shadcn.com) — Klassen sind hier für die KIT-CI aus `Design-System` neu
// geschrieben (Eigenentwicklungs-Nachweis, `.claude/rules/dependencies.md`).
import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

/**
 * Input-Primitive (Design-System „Form-Elemente"). `aria-invalid` (von
 * `EntityForm` bei Feldfehlern gesetzt) schaltet automatisch auf den
 * destructive-Rahmen/-Ring um — keine zusätzliche Fehler-Prop nötig, die
 * Komponente reagiert rein auf das ohnehin gesetzte ARIA-Attribut.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, type = 'text', ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';
