// Struktur ist an das verbreitete shadcn/ui-Textarea-Pattern angelehnt
// (MIT, ui.shadcn.com) — Klassen sind hier für die KIT-CI aus
// `Design-System` neu geschrieben (Eigenentwicklungs-Nachweis,
// `.claude/rules/dependencies.md`).
import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

/** Textarea-Primitive (Design-System „Form-Elemente"). `aria-invalid`-Verhalten analog `Input`. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';
