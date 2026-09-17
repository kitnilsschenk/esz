import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MigrationValidationError, scanMigrations } from './scan.js';

function makeFixtureDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'edms-migrate-scan-'));
}

function writeMigrationPair(dir: string, upName: string, downName: string): void {
  writeFileSync(path.join(dir, upName), '-- up\nSELECT 1;\n', 'utf8');
  writeFileSync(path.join(dir, downName), '-- down\nSELECT 1;\n', 'utf8');
}

describe('scanMigrations (Namensvalidierung, .claude/rules/database-migrations.md)', () => {
  let fixtureDir: string;

  beforeEach(() => {
    fixtureDir = makeFixtureDir();
  });

  afterEach(() => {
    rmSync(fixtureDir, { recursive: true, force: true });
  });

  it('akzeptiert eine lückenlose, korrekt benannte Migrations-Sequenz (gültiger Fall)', () => {
    writeMigrationPair(fixtureDir, 'V0001__create_extensions.sql', 'V0001__create_extensions.down.sql');
    writeMigrationPair(fixtureDir, 'V0002__add_documents_table.sql', 'V0002__add_documents_table.down.sql');

    const files = scanMigrations(fixtureDir);

    expect(files.map((file) => file.versionRaw)).toEqual(['0001', '0002']);
    expect(files.map((file) => file.name)).toEqual(['create_extensions', 'add_documents_table']);
  });

  it('lehnt einen ungültigen Dateinamen ab, z. B. camelCase statt snake_case (ungültiger Fall)', () => {
    writeFileSync(path.join(fixtureDir, 'V0001__createExtensions.sql'), '-- up\n', 'utf8');
    writeFileSync(path.join(fixtureDir, 'V0001__createExtensions.down.sql'), '-- down\n', 'utf8');

    expect(() => scanMigrations(fixtureDir)).toThrow(MigrationValidationError);
    try {
      scanMigrations(fixtureDir);
      expect.unreachable('scanMigrations hätte werfen müssen');
    } catch (error) {
      const issues = (error as MigrationValidationError).issues;
      expect(issues.some((issue) => issue.includes('Ungültiger Dateiname'))).toBe(true);
    }
  });

  it('lehnt eine Lücke in der Versions-Sequenz ab — V0001 gefolgt von V0003 (Lücken-Fall)', () => {
    writeMigrationPair(fixtureDir, 'V0001__create_extensions.sql', 'V0001__create_extensions.down.sql');
    writeMigrationPair(fixtureDir, 'V0003__add_documents_table.sql', 'V0003__add_documents_table.down.sql');

    expect(() => scanMigrations(fixtureDir)).toThrow(MigrationValidationError);
    try {
      scanMigrations(fixtureDir);
      expect.unreachable('scanMigrations hätte werfen müssen');
    } catch (error) {
      const issues = (error as MigrationValidationError).issues;
      expect(issues.some((issue) => issue.includes('Lücke'))).toBe(true);
    }
  });

  it('lehnt eine Up-Migration ohne zugehörige .down.sql ab (fehlende Down-Datei)', () => {
    writeFileSync(path.join(fixtureDir, 'V0001__create_extensions.sql'), '-- up\n', 'utf8');

    expect(() => scanMigrations(fixtureDir)).toThrow(MigrationValidationError);
    try {
      scanMigrations(fixtureDir);
      expect.unreachable('scanMigrations hätte werfen müssen');
    } catch (error) {
      const issues = (error as MigrationValidationError).issues;
      expect(issues.some((issue) => issue.includes('Fehlende Down-Migration'))).toBe(true);
    }
  });
});
