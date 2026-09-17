// Struktur (cva-Varianten/-Größen als Klassen-Fabrik neben einer schlanken
// Wrapper-Komponente) ist an das verbreitete shadcn/ui-Button-Pattern
// angelehnt (MIT, ui.shadcn.com) — Klassen/Varianten sind hier für die
// KIT-CI aus `Design-System` neu geschrieben, kein Copy-Paste
// (Eigenentwicklungs-Nachweis, `.claude/rules/dependencies.md`).
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

export const buttonVariants = cva(
  // Basis: echtes <button>, sichtbarer Fokus-Ring (Green Primary), keine
  // Icon-Verzerrung bei direkt eingebetteten Lucide-Icons.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        // `text-link` statt `text-primary` (AA-Fix Runde 2, `globals.css`):
        // `--primary` ist als FLÄCHE für weißen Text darauf kalibriert
        // (Button/Badge-Fill), `--link` ist die dedizierte Text-auf-Hintergrund-
        // Variante. Beide Tokens sind aktuell zahlenwertgleich (kein optischer
        // Unterschied) — die Referenz auf `text-link` ist Zukunftssicherung,
        // falls `--primary`/`--link` künftig wieder auseinanderlaufen.
        link: 'text-link underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

/**
 * Button-Primitive (Design-System „Buttons"). Rendert immer ein echtes
 * `<button>` (kein `asChild`/Slot-Polymorphismus — dafür wäre
 * `@radix-ui/react-slot` nötig, das für diesen Auftrag nicht freigegeben
 * ist; siehe Abschlussbericht „offene Punkte"). `type="button"` ist
 * Default, damit ein Button innerhalb eines `<form>` nicht versehentlich
 * submitted — Aufrufer, die tatsächlich submitten wollen, übergeben
 * explizit `type="submit"` (siehe `EntityForm`).
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = 'button', ...props }, ref) => {
    return (
      <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
    );
  },
);
Button.displayName = 'Button';
