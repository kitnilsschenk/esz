import { defineConfig } from 'vitest/config';

/**
 * Schlanke Unit-Test-Config für @edms/migrate (ADR-0001 §10.4/§10.5).
 *
 * Ausschließlich Unit-Tests gegen die programmatische API aus `src/index.ts`
 * (`scanMigrations`, `runUp`, …) mit Fixture-Verzeichnissen im OS-Temp-Ordner
 * bzw. einem gemockten `pg.Client` — KEIN Testcontainer/keine echte DB in
 * diesem Paket-Scope (Arbeitsauftrag AP6: "Namensvalidierung ... /
 * Checksum-Drift-Erkennung (gemockte schema_migrations-Einträge)"). Ein
 * Testcontainer-Integrationstest für den Runner selbst wäre ein separates,
 * künftiges Arbeitspaket.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    restoreMocks: true,
  },
});
