// Root-Vitest-Workspace (ADR-0001 §10.5, Arbeitspaket AP6) — bündelt NUR die
// Unit-Test-Configs aller Pakete für einen gemeinsamen `vitest`-Lauf vom
// Repo-Root aus (z. B. `pnpm exec vitest --workspace vitest.workspace.ts`;
// der `vitest`-Binary ist über pnpms Workspace-Bin-Verlinkung am Root
// verfügbar, sobald mindestens ein Paket `vitest` installiert hat — ein
// zusätzlicher Root-`devDependency`-Eintrag ist dafür nicht nötig).
//
// BEWUSST NICHT enthalten: `src/backend/vitest.integration.config.ts` — die
// Backend-Integrationstests brauchen einen echten Docker-Testcontainer und
// laufen ausschließlich über den isolierten `test:integration`-Script (siehe
// src/backend/package.json), niemals über diesen Sammel-Lauf
// (.claude/rules/tests.md: keine impliziten DB-/Docker-Abhängigkeiten im
// Standard-Testlauf).
export default [
  'src/backend/vitest.config.ts',
  'src/frontend/vitest.config.ts',
  'src/shared/vitest.config.ts',
  'tools/migrate/vitest.config.ts',
];
