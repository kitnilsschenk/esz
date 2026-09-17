// Namenskonvention laut .claude/rules/database-migrations.md:
//   "V<NNNN>__<snake_case_beschreibung>.sql", NNNN = 4 Ziffern, aufsteigend
//   und lückenlos. Jede Up-Migration braucht eine gepaarte
//   "V<NNNN>__<snake_case_beschreibung>.down.sql".
//
// Der Namensteil ist bewusst strikt auf [a-z0-9_] beschränkt (kein Punkt) —
// das reicht bereits aus, um Down-Dateien (die auf ".down.sql" enden) beim
// Scannen der Up-Dateien NICHT versehentlich zu matchen, ganz ohne
// Sonderbehandlung im Aufrufer.

export interface MigrationFile {
  readonly version: number;
  /** Ursprüngliche 4-stellige Zeichenkette aus dem Dateinamen, z. B. "0001". */
  readonly versionRaw: string;
  readonly name: string;
  readonly upFile: string;
  readonly downFile: string;
}

const UP_FILE_RE = /^V(\d{4})__([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/;

export interface ParsedUpFilename {
  readonly version: number;
  readonly versionRaw: string;
  readonly name: string;
}

/**
 * Parst einen Dateinamen gegen die Up-Migrations-Konvention. Gibt
 * `undefined` zurück, wenn der Name nicht passt (Aufrufer entscheidet über
 * Fehlerbehandlung/Sammlung).
 */
export function parseUpFilename(filename: string): ParsedUpFilename | undefined {
  const match = UP_FILE_RE.exec(filename);
  if (match === null) {
    return undefined;
  }
  const versionRaw = match[1];
  const name = match[2];
  if (versionRaw === undefined || name === undefined) {
    return undefined;
  }
  return { version: Number.parseInt(versionRaw, 10), versionRaw, name };
}

export function downFilenameFor(upFilename: string): string {
  return upFilename.replace(/\.sql$/, '.down.sql');
}

export function formatVersion(version: number): string {
  return String(version).padStart(4, '0');
}
