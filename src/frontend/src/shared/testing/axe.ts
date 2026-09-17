import axe from 'axe-core';
import type { Result, RunOptions } from 'axe-core';

/**
 * A11y-Check (.claude/rules/frontend-react.md: "axe-Check in Unit-Test-Setup
 * aktiv"). Führt axe-core DIREKT gegen ein gerendertes DOM-Element aus (MPL-2.0,
 * whitelist-konform, .claude/rules/dependencies.md) — bewusst keine
 * zusätzliche Wrapper-Bibliothek (`vitest-axe`/`jest-axe`).
 *
 * Gibt die Verstoß-Liste zurück; Aufrufer assertieren üblicherweise
 * `expect(await runAxe(container)).toEqual([])`.
 *
 * ## Warum `color-contrast` hier ABGESCHALTET ist
 *
 * axe ermittelt Kontraste, indem es die gerenderten Farben über ein
 * `<canvas>` ausliest. jsdom implementiert `HTMLCanvasElement.getContext`
 * nicht. axe fängt den Fehler ab und legt die Regel in `incomplete` —
 * **nicht** in `violations`.
 *
 * Das ist die gefährliche Variante: `runAxe()` gibt nur `violations` zurück,
 * die Liste bleibt leer, der Test wird grün. 128 Testdateien rufen diese
 * Funktion auf und lesen das Ergebnis als „Kontrast geprüft". Geprüft wurde
 * er nie — in keinem einzigen Lauf, seit es diese Funktion gibt. Eine
 * Prüfung, die still ausfällt und trotzdem grün meldet, ist schlechter als
 * gar keine: Sie erzeugt genau das Vertrauen, das sie widerlegen soll.
 *
 * Die Regel ist deshalb ausdrücklich abgeschaltet statt stillschweigend
 * wirkungslos. WCAG 2.2 AA 1.4.3/1.4.11 sind für dieses Projekt Pflicht
 * (BITV 2.0) und gehören in einen **echten Browser** — dort funktioniert das
 * Canvas. Solange das nicht steht, ist der Kontrast eine offene Lücke, und
 * sie soll als solche sichtbar sein.
 *
 * ## `incomplete` verschwindet nicht mehr lautlos
 *
 * `runAxeVollstaendig()` liefert zusätzlich die `incomplete`-Liste. Wer
 * wissen will, was axe NICHT entscheiden konnte, bekommt es jetzt zu sehen,
 * statt es aus einer leeren Verstoßliste erschließen zu müssen.
 */

/**
 * Regeln, die in jsdom technisch nicht laufen können. Jede Abschaltung
 * braucht hier eine Begründung — eine Liste ohne Gründe wächst, bis sie alles
 * enthält.
 */
const JSDOM_OPTIONEN: RunOptions = {
  rules: {
    // Braucht Canvas-Pixelzugriff auf die gerenderten Farben (s. o.).
    'color-contrast': { enabled: false },
  },
};

export async function runAxe(container: HTMLElement): Promise<Result[]> {
  const results = await axe.run(container, JSDOM_OPTIONEN);
  return results.violations;
}

/**
 * Wie `runAxe`, gibt aber zusätzlich zurück, was axe nicht entscheiden
 * konnte. Für Komponenten, bei denen die Unentscheidbarkeit selbst
 * interessant ist.
 */
export async function runAxeVollstaendig(
  container: HTMLElement,
): Promise<{ violations: Result[]; incomplete: Result[] }> {
  const results = await axe.run(container, JSDOM_OPTIONEN);
  return { violations: results.violations, incomplete: results.incomplete };
}
