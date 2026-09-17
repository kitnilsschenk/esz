import { defineConfig } from 'vitest/config';

/**
 * Schlanke Unit-Test-Config für @edms/shared (.claude/rules/tests.md).
 * Reine TS-Logik (Problem-Detail-Mapping, geteilte Typen) — Node-Environment
 * genügt, kein DOM/jsdom nötig.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    restoreMocks: true,
  },
});
