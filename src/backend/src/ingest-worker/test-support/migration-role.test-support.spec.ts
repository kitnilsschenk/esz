import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BEKANNTE_OWNER_ROLLEN_OHNE_SET_GRANT } from './migration-role.test-support';

/**
 * Driftschutz zwischen zwei Listen, die dasselbe meinen.
 *
 * Drei Migrationen (V0003, V0019, V0025) uebertragen Objekt-Eigentum an eine
 * Owner-Rolle, holen sich dafuer aber nicht das PostgreSQL-16-SET-Recht. Die
 * Rollen muessen deshalb VOR dem Migrationslauf existieren, mit SET-Recht
 * fuer die migrierende Rolle. Das steht an zwei Stellen:
 *
 *   - `tools/db/bootstrap-owner-rollen.sh` — der ausgelieferte Schritt, der
 *     in jeder Umgebung vor `migrate up` laeuft.
 *   - `preCreateKnownOwnerRolesWithSetOption()` — dieselbe Wirkung fuer den
 *     Testcontainer, damit der Integrationstest die Kette unter einer echten
 *     Nicht-Superuser-Rolle durchlaufen laesst.
 *
 * Bash und TypeScript teilen keine Konstante. Laufen die Listen auseinander,
 * merkt es niemand: Beide Seiten funktionieren fuer sich weiter, und der
 * Integrationstest bleibt gruen — waehrend das echte Deployment an genau der
 * Rolle scheitert, die nur eine der beiden Listen kennt. Das ist dieselbe
 * Klasse Fehler, die den Befund ueberhaupt erst so lange verborgen hat.
 *
 * Dieser Test liest deshalb die Rollenliste aus dem Skript und vergleicht.
 */
const SKRIPT = path.join(__dirname, '..', '..', '..', '..', '..', 'tools', 'db', 'bootstrap-owner-rollen.sh');

/** Liest die Rollen aus dem `v_owner_rollen`-ARRAY des Skripts. */
function rollenAusSkript(inhalt: string): readonly string[] {
  const treffer = /v_owner_rollen\s+text\[\]\s*:=\s*ARRAY\[(.*?)\]/s.exec(inhalt);
  if (treffer?.[1] === undefined) {
    throw new Error(
      'Rollenliste im Skript nicht gefunden. Wurde `v_owner_rollen` umbenannt? ' +
        'Dann ist dieser Driftschutz blind und muss nachgezogen werden.',
    );
  }
  return [...treffer[1].matchAll(/'([^']+)'/g)].map((m) => m[1] as string);
}

describe('Bootstrap der Owner-Rollen', () => {
  const inhalt = readFileSync(SKRIPT, 'utf8');

  it('fuehrt im Skript dieselben Rollen wie der Test-Support', () => {
    expect(rollenAusSkript(inhalt)).toEqual([...BEKANNTE_OWNER_ROLLEN_OHNE_SET_GRANT]);
  });

  it('erteilt das SET-Recht, nicht nur die Mitgliedschaft', () => {
    // Ohne `SET TRUE` ist das Skript wirkungslos: Seit PostgreSQL 16 macht
    // `CREATE ROLE` die erzeugende Rolle zwar zum Mitglied MIT ADMIN OPTION,
    // aber `ALTER ... OWNER TO` verlangt zusaetzlich SET. Genau diese
    // Unterscheidung ist der ganze Punkt des Skripts.
    expect(inhalt).toMatch(/SET TRUE/);
  });

  it('nennt die drei betroffenen Migrationen, damit die Herkunft auffindbar bleibt', () => {
    // Ein Bootstrap-Schritt, dessen Anlass niemand mehr zuordnen kann, wird
    // beim naechsten Aufraeumen geloescht.
    for (const migration of ['V0003', 'V0019', 'V0025']) {
      expect(inhalt).toContain(migration);
    }
  });
});
