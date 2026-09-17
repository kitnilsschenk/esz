import { existsSync } from 'node:fs';
import path from 'node:path';
import { connect, runUp } from '@edms/migrate';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';

/**
 * Repo-Root über die pnpm-Workspace-Marker-Datei finden (identisches Muster
 * zu `health/health.contract.integration.spec.ts`) — bewusst weder
 * `import.meta` (im CJS-Typecheck verboten, TS1470) noch `__dirname` (in
 * Vitest-ESM undefiniert).
 */
function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (;;) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error('Repo-Root nicht gefunden (pnpm-workspace.yaml fehlt im Pfadbaum)');
    }
    dir = parent;
  }
}

/**
 * Test-Support: wendet ALLE `migrations/**`-Dateien (V0001-V0006) auf einen
 * gestarteten Testcontainer an — via `@edms/migrate`s programmatischer API
 * (`runUp`), NICHT über eine eigene SQL-Kopie (Single Source of Truth bleibt
 * `migrations/**`, `.claude/rules/database-migrations.md`).
 */
export async function migrateTestPostgres(container: StartedPostgreSqlContainer): Promise<void> {
  const migrationsDir = path.join(findRepoRoot(process.cwd()), 'migrations');
  const client = await connect({ connectionString: container.getConnectionUri() });
  try {
    await runUp(client, migrationsDir);
  } finally {
    await client.end();
  }
}
