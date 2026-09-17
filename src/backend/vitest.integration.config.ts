import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Integration-Test-Config für @edms/backend (ADR-0001 §10.5).
 *
 * Läuft AUSSCHLIESSLICH über den isolierten `test:integration`-Script (siehe
 * `package.json`) — bewusst getrennt vom Standard-`test`-Lauf und vom
 * Root-Vitest-Workspace (`vitest.workspace.ts`), weil echte Testcontainers
 * (Docker) benötigt werden. Fehlt Docker, scheitert der Lauf mit der
 * unveränderten Testcontainers-Fehlermeldung — bewusst KEIN Auto-Skip
 * (.claude/rules/tests.md: "keine stillen Ausfälle", "kein Retry-Loop bei
 * flaky Tests").
 *
 * `fileParallelism: false`, weil mehrere Integration-Spec-Dateien jeweils
 * eigene Testcontainers starten/stoppen — sequentiell hält das den
 * Docker-Ressourcenverbrauch und Port-Zuteilung beherrschbar.
 */
export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.integration.spec.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
