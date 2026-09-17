import { useCallback, useLayoutEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

/**
 * `localStorage`-Schlüssel der Theme-Präferenz. Enthält AUSSCHLIESSLICH
 * `'light'`/`'dark'` — KEINE PII, KEIN Access-/Refresh-Token
 * (`.claude/rules/frontend-react.md`: "Kein `localStorage`/`sessionStorage`
 * für PII oder Tokens" — ein reines UI-Farbschema-Flag fällt NICHT darunter).
 */
export const THEME_STORAGE_KEY = 'edms-theme';

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

function readStoredTheme(): Theme | null {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : null;
  } catch {
    // z. B. Safari privates Fenster / deaktiviertes `localStorage` — degradiert
    // auf die System-Preference, KEIN Absturz (best effort).
    return null;
  }
}

function readSystemTheme(): Theme {
  // jsdom (Unit-Tests) implementiert `window.matchMedia` NICHT — Guard hält
  // `resolveInitialTheme` dort lauffähig (Fallback `'light'`).
  if (typeof window.matchMedia !== 'function') {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveInitialTheme(): Theme {
  return readStoredTheme() ?? readSystemTheme();
}

function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

function persistTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Persistenz ist best effort — das Umschalten selbst funktioniert auch
    // ohne erfolgreiches Schreiben (z. B. volles Speicherkontingent).
  }
}

export interface UseThemeResult {
  readonly theme: Theme;
  readonly toggleTheme: () => void;
}

/**
 * Dark-/Light-Mode-Umschaltung (Phase 4c-Feinschliff): togglet die
 * Tailwind-v4-`.dark`-Klasse auf `<html>` (`globals.css`
 * `@custom-variant dark (&:where(.dark, .dark *))`) und persistiert NUR die
 * Präferenz (`'light'`/`'dark'`) in `localStorage`. Initial: gespeicherte
 * Wahl, sonst `prefers-color-scheme` (System-Default) — `useLayoutEffect`
 * wendet die Klasse VOR dem ersten Browser-Paint an (kein sichtbares
 * Umspringen nach dem ersten Render).
 */
export function useTheme(): UseThemeResult {
  const [theme, setTheme] = useState<Theme>(() => resolveInitialTheme());

  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((previous) => {
      const next: Theme = previous === 'dark' ? 'light' : 'dark';
      persistTheme(next);
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
