import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DWD_AENDERUNGSVERMERK, DWD_QUELLENVERMERK, istQuellenvermerkPlatzhalter } from './dwd-quellenvermerk.const';

/**
 * Die `NOTICE`-Datei im Repo-Wurzelverzeichnis gegen die Konstanten.
 *
 * **Warum es diesen Test gibt.** `.claude/rules/dependencies.md` verlangt, den
 * geforderten Quellenvermerk als EINE zentrale Konstante zu halten und von
 * allen Ausgabepfaden zu referenzieren — „kein Duplizieren von Vermerkstexten",
 * weil Kopien auseinanderdriften und die Attributionspflicht dann formal
 * verletzt ist, ohne dass es jemand merkt.
 *
 * `NOTICE` ist eine statische Datei. Sie kann nichts importieren, und seit dem
 * Wechsel auf Apache-2.0 (ADR-0001 §14) ist sie genau der Text, den §4(d)
 * weiterzugeben verlangt — der Vermerk MUSS also dort stehen. Die Kopie ist
 * damit unvermeidbar; unbemerkt driften darf sie nicht. Dieser Test ist der
 * Ersatz für die Referenz, die eine Textdatei nicht haben kann.
 */
describe('NOTICE und die DWD-Vermerke', () => {
  const notice = readFileSync(join(__dirname, '../../../../../NOTICE'), 'utf8');
  /** Zeilenumbrüche der Datei aufheben — der Vermerk steht dort umbrochen. */
  const flach = notice.split(/\s+/).join(' ');

  it('trägt den Quellenvermerk wörtlich so, wie der Code ihn führt', () => {
    expect(flach).toContain(DWD_QUELLENVERMERK);
  });

  it('trägt den Änderungsvermerk wörtlich so, wie der Code ihn führt', () => {
    // Art. 3(a)(i)(B) CC BY 4.0 verlangt neben der Quelle die Angabe, DASS und
    // WIE verändert wurde.
    expect(flach).toContain(DWD_AENDERUNGSVERMERK);
  });

  it('enthält keinen Platzhalter', () => {
    // Ein Platzhalter IN einer Ausgabe wäre schlimmer als gar kein Vermerk: Er
    // behauptet eine Quelle und verrät im selben Satz, dass die Behauptung
    // nicht abgenommen ist.
    expect(istQuellenvermerkPlatzhalter()).toBe(false);
    expect(notice).not.toContain('PLATZHALTER');
  });

  it('nennt den Markenvorbehalt — der ist der Grund für Apache-2.0 statt MIT', () => {
    expect(notice).toContain('Marken');
    expect(notice).toContain('KIT Consulting');
  });
});
