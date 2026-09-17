import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Der Pfad zum echten `migrations/`-Verzeichnis des Repositorys.
 *
 * Ersetzt seit dem 2026-09-17 `merged-migrations-dir.test-support.ts`. Jener
 * Behelf kopierte die reale Migrationskette in ein temporäres Verzeichnis und
 * legte eine noch nicht freigegebene Datei dazu — nötig, solange V0084
 * ausserhalb von `migrations/` lag. Seit sie dort liegt, gibt es nichts mehr
 * zusammenzuführen: Der Test läuft gegen dieselbe Kette wie jeder andere.
 *
 * Der Behelf hatte übrigens einen Preis, den man erst im Rückblick sieht: Als
 * die Datei kurzzeitig dieselbe Versionsnummer trug wie eine bereits
 * angewendete Migration, überschrieb die eine im Temp-Verzeichnis die andere,
 * und der Test lief grün weiter, ohne die Migration je anzuwenden, die er
 * prüfen sollte. Eine Kette ohne Zwischenschritt kann das nicht passieren.
 */
export function migrationsVerzeichnis(): string {
  return path.join(findRepoRoot(process.cwd()), 'migrations');
}

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
