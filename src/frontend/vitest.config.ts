import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Unit-Test-Config für @edms/frontend (.claude/rules/frontend-react.md:
 * "Testing Library + Vitest, mindestens 1 Test pro interaktiver Komponente",
 * "axe-Check in Unit-Test-Setup aktiv").
 *
 * jsdom-Environment für DOM-Rendering; `setupFiles` registriert die
 * jest-dom-Matcher und aktiviert den axe-Check-Helper (`vitest.setup.ts`).
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.spec.ts', 'src/**/*.spec.tsx'],
    exclude: ['node_modules/**', 'dist/**'],
    setupFiles: ['./vitest.setup.ts'],
    restoreMocks: true,
  },
});
