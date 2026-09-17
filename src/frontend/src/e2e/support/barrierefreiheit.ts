import { createRequire } from 'node:module';
import type { Page } from '@playwright/test';
import type { Result as AxeErgebnis } from 'axe-core';

const require = createRequire(import.meta.url);
/** Bereits Frontend-Abhängigkeit (`axe-core` ^4.10, MPL-2.0, whitelist-konform) — keine neue Abhängigkeit nötig. */
const AXE_CORE_PFAD = require.resolve('axe-core');

export interface BarrierefreiheitsVerstoss {
  readonly seite: string;
  readonly regel: string;
  readonly hilfe: string;
  readonly auswirkung: string;
  readonly ziele: readonly string[];
  readonly zusammenfassung: string;
}

interface AxeLaufzeit {
  run: (context: Document, optionen: Record<string, unknown>) => Promise<{ violations: AxeErgebnis[] }>;
}

declare global {
  interface Window {
    /** Von `page.addScriptTag` injiziert — existiert nur zur Laufzeit im Browser, nicht beim Modul-Import. */
    axe?: AxeLaufzeit;
  }
}

/**
 * Injiziert axe-core in die aktuelle Seite und liefert deren Verstöße —
 * **inklusive `color-contrast`**, das im Unit-Test-Setup (jsdom,
 * `shared/testing/axe.ts`) ausdrücklich NICHT messbar ist: jsdom implementiert
 * `HTMLCanvasElement.getContext` nicht, und axe braucht Canvas-Pixelzugriff,
 * um Kontraste zu ermitteln. Der echte Browser kann das — diese Funktion ist
 * damit die EINZIGE Stelle im Repo, an der WCAG 2.2 AA 1.4.3/1.4.11
 * (BITV 2.0 Pflicht) tatsächlich geprüft werden, statt nur so auszusehen.
 *
 * **Meldet nur — repariert nichts.** Farbwerte sind eine
 * KIT-Branding-Entscheidung und nicht Gegenstand der Testarbeit; Aufrufer
 * sammeln die Verstöße über mehrere besuchte Seiten hinweg und werten sie
 * gebündelt am Ende des jeweiligen Flows aus (ein vollständiges Bild statt
 * eines Abbruchs bei der ersten Fundstelle).
 */
export async function sammleBarrierefreiheitsVerstoesse(page: Page, seite: string): Promise<BarrierefreiheitsVerstoss[]> {
  await page.addScriptTag({ path: AXE_CORE_PFAD });

  const verstoesse = await page.evaluate(async () => {
    if (window.axe === undefined) {
      throw new Error('axe-core wurde nicht in die Seite injiziert.');
    }
    const ergebnis = await window.axe.run(document, { resultTypes: ['violations'] });
    return ergebnis.violations;
  });

  return verstoesse.flatMap((verstoss) =>
    verstoss.nodes.map((knoten) => ({
      seite,
      regel: verstoss.id,
      hilfe: verstoss.help,
      auswirkung: knoten.impact ?? verstoss.impact ?? 'unbekannt',
      ziele: knoten.target.map((eintrag) => (typeof eintrag === 'string' ? eintrag : JSON.stringify(eintrag))),
      zusammenfassung: knoten.failureSummary ?? '',
    })),
  );
}
