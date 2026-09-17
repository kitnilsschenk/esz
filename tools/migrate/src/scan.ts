import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { downFilenameFor, formatVersion, parseUpFilename } from './migration-file.js';
import type { MigrationFile } from './migration-file.js';

/**
 * Sammelt alle Validierungsprobleme eines Scans in einer einzigen
 * Fehlermeldung, statt beim ersten Problem abzubrechen — so sieht man in
 * einem Lauf alle Namens-/Paarungs-/Lücken-Verstöße auf einmal.
 */
export class MigrationValidationError extends Error {
  constructor(public readonly issues: readonly string[]) {
    super(
      `Migrations-Validierung fehlgeschlagen (${issues.length} Problem(e)):\n- ${issues.join('\n- ')}`,
    );
    this.name = 'MigrationValidationError';
  }
}

/**
 * Scannt `migrationsDir` und validiert gegen die Konvention aus
 * .claude/rules/database-migrations.md:
 *   (1) Namensformat V<NNNN>__<snake_case>.sql
 *   (2) jede Up-Datei hat eine gepaarte .down.sql (und umgekehrt: keine
 *       verwaisten .down.sql-Dateien)
 *   (3) keine doppelten Versionsnummern
 *   (4) lückenlose, bei 0001 beginnende Sequenz
 *
 * Wirft `MigrationValidationError` mit allen gefundenen Problemen, statt nur
 * dem ersten. Gibt bei Erfolg die Migrationen aufsteigend sortiert zurück.
 */
export function scanMigrations(migrationsDir: string): MigrationFile[] {
  if (!existsSync(migrationsDir)) {
    throw new MigrationValidationError([`Migrations-Verzeichnis nicht gefunden: ${migrationsDir}`]);
  }

  const entries = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name !== '.gitkeep');

  const issues: string[] = [];
  const files: MigrationFile[] = [];
  const seenVersions = new Map<number, string>();
  const unmatchedDownFiles = new Set(entries.filter((name) => name.endsWith('.down.sql')));

  for (const filename of entries) {
    if (filename.endsWith('.down.sql')) {
      continue;
    }
    if (!filename.endsWith('.sql')) {
      issues.push(
        `Unerwartete Datei in ${migrationsDir}: "${filename}" (nur *.sql / *.down.sql erlaubt).`,
      );
      continue;
    }

    const parsed = parseUpFilename(filename);
    if (parsed === undefined) {
      issues.push(
        `Ungültiger Dateiname: "${filename}" — erwartet "V<NNNN>__<snake_case>.sql" ` +
          '(NNNN = genau 4 Ziffern, Name nur [a-z0-9_], keine führenden/doppelten Unterstriche).',
      );
      continue;
    }

    const downFilename = downFilenameFor(filename);
    if (!existsSync(path.join(migrationsDir, downFilename))) {
      issues.push(`Fehlende Down-Migration für "${filename}": erwartet "${downFilename}".`);
    } else {
      unmatchedDownFiles.delete(downFilename);
    }

    const existingName = seenVersions.get(parsed.version);
    if (existingName !== undefined) {
      issues.push(`Doppelte Versionsnummer V${parsed.versionRaw}: "${existingName}" und "${filename}".`);
    } else {
      seenVersions.set(parsed.version, filename);
    }

    files.push({
      version: parsed.version,
      versionRaw: parsed.versionRaw,
      name: parsed.name,
      upFile: path.join(migrationsDir, filename),
      downFile: path.join(migrationsDir, downFilename),
    });
  }

  for (const orphanDown of unmatchedDownFiles) {
    issues.push(
      `Down-Migration ohne zugehörige Up-Migration: "${orphanDown}" (verstößt gegen die Paarungs-Pflicht).`,
    );
  }

  files.sort((a, b) => a.version - b.version);

  for (let i = 0; i < files.length; i += 1) {
    const expectedVersion = i + 1;
    const file = files[i];
    if (file !== undefined && file.version !== expectedVersion) {
      issues.push(
        `Lücke/Unordnung in der Versions-Sequenz: erwartet V${formatVersion(expectedVersion)}, ` +
          `gefunden V${file.versionRaw} ("${file.name}"). Versionsnummern müssen lückenlos bei ` +
          '0001 beginnend aufsteigen.',
      );
      break;
    }
  }

  if (issues.length > 0) {
    throw new MigrationValidationError(issues);
  }

  return files;
}
