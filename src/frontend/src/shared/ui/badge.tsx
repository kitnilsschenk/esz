// Struktur (cva-Varianten-Fabrik + <span>-Wrapper) ist an das verbreitete
// shadcn/ui-Badge-Pattern angelehnt (MIT, ui.shadcn.com) — Klassen/Varianten
// sind hier für die KIT-CI aus `Design-System` neu geschrieben
// (Eigenentwicklungs-Nachweis, `.claude/rules/dependencies.md`).
import { forwardRef, type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

export const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'border-border text-foreground',
        success: 'border-transparent bg-success text-success-foreground',
        warning: 'border-transparent bg-warning text-warning-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

/** Badge-Primitive (Design-System „Badges"). `<span>` statt `<div>` — Badges stehen üblicherweise inline neben/ in Tabellenzellen und Statuslabeln. */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(({ className, variant, ...props }, ref) => (
  <span ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />
));
Badge.displayName = 'Badge';
