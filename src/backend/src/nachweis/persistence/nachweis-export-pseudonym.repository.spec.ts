import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ADR-0007 Teil C, Auflage A19 — struktureller Beleg für „diese Klasse ist
 * der EINZIGE Ort im Code, der `nachweis.export_pseudonym` berührt".
 * Rekursiver Quelltext-Scan über `src/backend/src/nachweis/**` (Tests
 * ausgenommen): NUR `nachweis-export-pseudonym.repository.ts` darf die
 * Tabelle referenzieren.
 */
function findeRepoWurzel(): string {
  let dir = process.cwd();
  for (let i = 0; i < 12; i += 1) {
    try {
      readFileSync(join(dir, 'pnpm-workspace.yaml'));
      return dir;
    } catch {
      dir = dirname(dir);
    }
  }
  throw new Error('pnpm-workspace.yaml nicht gefunden — Repo-Wurzel unauffindbar.');
}

function sammleTsDateien(verzeichnis: string): string[] {
  const eintraege = readdirSync(verzeichnis);
  const dateien: string[] = [];
  for (const eintrag of eintraege) {
    const pfad = join(verzeichnis, eintrag);
    const stat = statSync(pfad);
    if (stat.isDirectory()) {
      dateien.push(...sammleTsDateien(pfad));
    } else if (eintrag.endsWith('.ts') && !eintrag.endsWith('.spec.ts')) {
      dateien.push(pfad);
    }
  }
  return dateien;
}

describe('nachweis.export_pseudonym — A19 Kapselung', () => {
  it('wird AUSSCHLIESSLICH von nachweis-export-pseudonym.repository.ts referenziert', () => {
    const wurzel = findeRepoWurzel();
    const nachweisDir = join(wurzel, 'src', 'backend', 'src', 'nachweis');
    const dateien = sammleTsDateien(nachweisDir);
    expect(dateien.length).toBeGreaterThan(10);

    const verstoesse: string[] = [];
    for (const pfad of dateien) {
      if (pfad.endsWith('nachweis-export-pseudonym.repository.ts')) {
        continue;
      }
      const inhalt = readFileSync(pfad, 'utf8');
      if (inhalt.includes('export_pseudonym')) {
        verstoesse.push(pfad);
      }
    }
    expect(verstoesse).toEqual([]);
  });
});
