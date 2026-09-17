// Struktur (Card + Sub-Komponenten als reine div-Wrapper) ist an das
// verbreitete shadcn/ui-Card-Pattern angelehnt (MIT, ui.shadcn.com) —
// Klassen sind hier für die KIT-CI aus `Design-System` neu geschrieben
// (Eigenentwicklungs-Nachweis, `.claude/rules/dependencies.md`).
import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export type CardProps = HTMLAttributes<HTMLDivElement>;

/** Card-Container (Design-System „Cards"): abgerundeter Rahmen, dezenter Schatten, Card-Padding 1.5rem in den Sub-Bereichen. */
export const Card = forwardRef<HTMLDivElement, CardProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('rounded-lg border border-border bg-card text-card-foreground shadow-sm', className)} {...props} />
));
Card.displayName = 'Card';

export const CardHeader = forwardRef<HTMLDivElement, CardProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
));
CardHeader.displayName = 'CardHeader';

export interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  /**
   * Überschriften-Ebene (Default `h3`, wie zuvor). Card selbst ist rein
   * visuell und kein eigenes Landmark — welche Ebene an einer Einbaustelle
   * KORREKT ist, hängt von der umgebenden Überschriften-Hierarchie ab (axe
   * `heading-order`: keine übersprungenen Ebenen). Beispiele:
   * `as="h1"` für eine alleinstehende Seite (z. B. `LoginScreen`), `as="h2"`
   * für eine Card-Sektion UNTER einem Seiten-`<h1>` (Phase 4c-Feinschliff,
   * Stammdaten-Detail-Sektionen).
   */
  readonly as?: 'h1' | 'h2' | 'h3' | 'h4';
}

/**
 * Schriftgröße FOLGT der Überschriften-Ebene.
 *
 * Zuvor rendered `CardTitle` unabhängig von `as` immer `text-base` — genau
 * wie das Seiten-`<h1>` in `PageHeader`/`DetailView`. Seitentitel,
 * Abschnitts- und Kartenüberschrift waren dadurch optisch identisch (16 px
 * fett), und die einzige Gliederung, die das Auge bekam, war der
 * Kartenrahmen. Auf einer Detailseite mit vier Karten-Abschnitten plus Tabs
 * musste man lesen statt zu scannen.
 *
 * Die Staffelung bleibt bewusst flach (20/16/14 px) — dies ist ein dichtes
 * Betriebswerkzeug, keine Marketing-Seite; Ebenen müssen unterscheidbar
 * sein, nicht dominant. `className` überschreibt weiterhin (tailwind-merge).
 */
const GROESSE_JE_EBENE: Readonly<Record<NonNullable<CardTitleProps['as']>, string>> = {
  h1: 'text-xl',
  h2: 'text-base',
  h3: 'text-sm',
  h4: 'text-sm',
};

/** Rendert als `<h3>` per Default — s. `as`-Prop für abweichende Ebenen. */
export const CardTitle = forwardRef<HTMLHeadingElement, CardTitleProps>(({ className, as: Heading = 'h3', ...props }, ref) => (
  <Heading
    ref={ref}
    className={cn(GROESSE_JE_EBENE[Heading], 'font-bold leading-none tracking-tight text-foreground', className)}
    {...props}
  />
));
CardTitle.displayName = 'CardTitle';

export type CardDescriptionProps = HTMLAttributes<HTMLParagraphElement>;

export const CardDescription = forwardRef<HTMLParagraphElement, CardDescriptionProps>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
));
CardDescription.displayName = 'CardDescription';

export const CardContent = forwardRef<HTMLDivElement, CardProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
));
CardContent.displayName = 'CardContent';

export const CardFooter = forwardRef<HTMLDivElement, CardProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex items-center gap-2 p-6 pt-0', className)} {...props} />
));
CardFooter.displayName = 'CardFooter';
