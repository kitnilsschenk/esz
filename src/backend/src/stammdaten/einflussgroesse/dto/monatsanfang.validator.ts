import { ValidatorConstraint } from 'class-validator';
import type { ValidatorConstraintInterface } from 'class-validator';

const MONATSANFANG_PATTERN = /^\d{4}-\d{2}-01$/;

/**
 * Spiegelt V0020s `CHECK (gueltig_ab_monat = date_trunc('month', gueltig_ab_monat)::date)`
 * (und die analoge `gueltig_bis_monat`-CHECK) — 400 `problem+json` VOR jedem
 * DB-Roundtrip statt eines rohen Constraint-Fehlers (`.claude/rules/backend-nestjs.md`).
 * Format `YYYY-MM-01` (Tages-Anteil FEST `01`) ist strenger als ein reines
 * `date_trunc`-Äquivalent, aber äquivalent dazu für JEDEN Client-Input, der
 * überhaupt als valides Kalenderdatum geparst wird — und schließt zusätzlich
 * offensichtlich falsche Tages-Werte (z. B. `2026-02-30`) über den
 * nachgelagerten `Date.parse`-Check aus.
 */
@ValidatorConstraint({ name: 'istMonatsanfang', async: false })
export class MonatsanfangConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || !MONATSANFANG_PATTERN.test(value)) {
      return false;
    }
    return !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));
  }

  defaultMessage(): string {
    return 'muss ein Monatsanfang im Format YYYY-MM-01 sein (DB-CHECK gespiegelt).';
  }
}
