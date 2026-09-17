// Globales Test-Setup (.claude/rules/frontend-react.md: "axe-Check in
// Unit-Test-Setup aktiv").
//
// - Registriert die jest-dom-Matcher (`toBeInTheDocument`, …) für Vitest.
// - Räumt nach jedem Test das gerenderte DOM auf (Testing-Library-Konvention;
//   verhindert Bleed-through zwischen Tests derselben Datei).
//
// Der axe-core-Check selbst (`src/shared/testing/axe.ts`) läuft direkt in den
// jeweiligen Komponententests (`runAxe(container)`) — bewusst ohne
// zusätzliche Wrapper-Bibliothek (axe-core, MPL-2.0, whitelist-konform).
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
