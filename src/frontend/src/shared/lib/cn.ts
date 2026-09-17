import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Kombiniert bedingte Klassenlisten (`clsx`, MIT) und löst widersprüchliche
 * Tailwind-Utility-Kollisionen zugunsten des zuletzt übergebenen Werts auf
 * (`tailwind-merge`, MIT) — z. B. `cn('px-2', condition && 'px-4')` ergibt
 * IMMER genau eine `px-*`-Klasse statt beide nebeneinander im DOM zu
 * belassen (Tailwinds Utility-Reihenfolge in der generierten CSS-Datei ist
 * sonst nicht garantiert deterministisch gegenüber der Aufrufreihenfolge).
 *
 * Zentraler Helfer für alle `shared/ui/*`-Primitives + restylte
 * Stammdaten-Shared-Komponenten (ADR-0008 §23 / D11 Phase 4c-Feinschliff).
 */
export function cn(...inputs: readonly ClassValue[]): string {
  return twMerge(clsx(inputs));
}
