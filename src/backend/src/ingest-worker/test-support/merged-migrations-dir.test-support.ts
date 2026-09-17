import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Findet die Repo-Root ueber die pnpm-Workspace-Marker-Datei — identisches
 * Muster zu `stammdaten/test-support/migrate-test-postgres.ts`.
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

export interface MergedMigrationsDir {
  readonly dir: string;
  cleanup(): void;
}

/**
 * Baut ein TEMPORAERES Migrationsverzeichnis mit GENAU EINER realen
 * Migration (Datei-Paar `V<version>__*.sql`/`.down.sql`) — fuer den
 * zweistufigen Testcontainer-Bootstrap (Auflage C-1): `CREATE EXTENSION`
 * (V0001) verlangt IMMER Superuser (s. `migration-role.test-support.ts`)
 * und laeuft deshalb ALLEIN unter dem Testcontainer-Bootstrap-User, bevor
 * die eigentliche, nicht-superuser Migrationskette (V0002 aufwaerts)
 * beginnt.
 */
export function buildSingleVersionMigrationsDir(versionPrefix: string): MergedMigrationsDir {
  const repoRoot = findRepoRoot(process.cwd());
  const realMigrationsDir = path.join(repoRoot, 'migrations');
  const tempDir = mkdtempSync(path.join(tmpdir(), 'edms-migrations-single-'));

  const matches = readdirSync(realMigrationsDir, { withFileTypes: true }).filter(
    (entry) => entry.isFile() && entry.name.startsWith(versionPrefix),
  );
  if (matches.length !== 2) {
    throw new Error(
      `Erwartet genau 2 Dateien (Up+Down) fuer Praefix "${versionPrefix}" in ${realMigrationsDir}, gefunden: ${String(matches.length)}.`,
    );
  }
  for (const entry of matches) {
    const content = readFileSync(path.join(realMigrationsDir, entry.name));
    writeFileSync(path.join(tempDir, entry.name), content);
  }

  return {
    dir: tempDir,
    cleanup(): void {
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

// HIER STAND `buildMergedMigrationsDir()`, und es wird nicht mehr gebraucht.
//
// Solange die Stufe-C-Migration ausserhalb von `migrations/` lag, musste der
// Integrationstest die reale Kette und die noch nicht freigegebene Datei in
// einem temporaeren Verzeichnis zusammenfuehren -- `scanMigrations()`
// verlangt eine lueckenlose Sequenz in EINEM Verzeichnis. Seit dem
// 2026-09-17 liegt sie als V0084 in der Kette; der Test laeuft gegen
// `migrationsVerzeichnis()` wie jeder andere.
//
// Der Behelf hatte einen Preis, der erst im Rueckblick sichtbar wurde: Als
// die zusammengefuehrte Datei kurzzeitig dieselbe Versionsnummer trug wie
// eine bereits in `migrations/` liegende, ueberschrieb im Temp-Verzeichnis
// die eine die andere -- und der Test lief gruen weiter, ohne die Migration
// je anzuwenden, die er pruefen sollte. Ein Zwischenschritt, der Dateien
// still zusammenwirft, kann das; eine Kette ohne ihn nicht.
