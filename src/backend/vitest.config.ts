import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Unit-Test-Config für @edms/backend (ADR-0001 §10.5, backend-lead-Votum 1 —
 * "harte Auflage").
 *
 * Vitests esbuild-Default unterstützt KEIN `emitDecoratorMetadata` — NestJS'
 * DI-Container würde Provider dadurch STILL (ohne Fehlermeldung) nicht
 * auflösen. Der SWC-Transform via `unplugin-swc` (MIT, auf `@swc/core`,
 * Apache-2.0) ersetzt esbuild für diesen Workspace; `.swcrc` im Paket-Root
 * spiegelt exakt die Decorator-Flags aus `tsconfig.json`
 * (`experimentalDecorators`/`emitDecoratorMetadata`).
 *
 * Nur `*.spec.ts` (Unit-Ebene). Integrationstests (`*.integration.spec.ts`,
 * echte Testcontainers-PG) laufen über die getrennte
 * `vitest.integration.config.ts` und den isolierten `test:integration`-Script
 * — bewusst NICHT hier eingeschlossen (Tests-Rule: kein impliziter
 * DB-/Docker-Bedarf im Standard-`test`-Lauf; auch nicht Teil des
 * Root-Vitest-Workspace).
 */
export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    exclude: ['src/**/*.integration.spec.ts', 'node_modules/**', 'dist/**'],
    restoreMocks: true,
  },
});
