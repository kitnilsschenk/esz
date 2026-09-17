import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { meldeAn, OHNE_PASSWORT } from './support/anmeldung';
import { eindeutig, eindeutigesPasswort } from './support/synthetik';
import { sammleBarrierefreiheitsVerstoesse, type BarrierefreiheitsVerstoss } from './support/barrierefreiheit';

/**
 * **Das Nutzerportal: Zugangscode ausgeben, einlösen, anmelden — und der
 * digitale Widerspruch.**
 *
 * Der Widerspruch ist das eigentliche Ziel dieser Spezifikation: das
 * DSGVO-Opt-out ([Q3] Kap. 6, Beleg nach DS-03) war bislang in KEINEM
 * E2E-Test über die Oberfläche nachgewiesen — nur, dass die Seite sich
 * aufrufen lässt. Er lässt sich aber nicht isoliert prüfen: Ohne einen
 * echten Zugangscode gibt es keine Portal-Sitzung, und der Code existiert
 * laut Produktentscheidung ausdrücklich NUR EINMAL — in der Antwort der
 * Ausgabe (`PortalZugangAbschnitt`: „Der Code steht genau einmal auf dem
 * Bildschirm … wird nirgends gespeichert"). Dieser Test greift ihn deshalb
 * genau dort ab, wo er entsteht, und läuft ihn in derselben Sitzung
 * unmittelbar zu Ende.
 *
 * Zwei getrennte Browser-Kontexte: Die Betriebs-UI (Keycloak-Sitzung) und
 * das Nutzerportal (Kennung/Passwort-Sitzung per `__Host-`-Cookie) sind
 * unterschiedliche Anwendungsteile mit unterschiedlichen Sitzungsarten
 * (`App.tsx`: „Der Endkunde … soll die Betriebsanwendung nie zu sehen
 * bekommen"). Ein zweiter Kontext bildet das nach, statt beide Sitzungen im
 * selben Tab zu vermengen.
 *
 * Synthetischer Endkunde ohne Bezug zu den Bestandsdaten des Pilotbestands A. Für
 * einen frischen Kunden ohne Berechnungshistorie zeigt die Übersicht den
 * dokumentierten Leerzustand („Für Sie liegt noch keine monatliche
 * Information vor") — das ist der korrekte, geprüfte Zustand für GENAU
 * diesen Kunden, kein Ausweichen: eine tatsächlich befüllte Monatsübersicht
 * setzt einen Berechnungslauf voraus, und dessen Voraussetzungen sind nicht
 * in vertretbarer Zeit über die Oberfläche herstellbar (s. Begründung in
 * `berechnungslauf.pw.ts`).
 *
 * **BEFUND beim ersten Lauf gegen den Dev-Stack — SCHWERWIEGEND, bewusst
 * NICHT „repariert" (`.claude/rules/tests.md`).** Unmittelbar nach
 * „Zugangscode ausgeben" stürzt die GESAMTE Endkunde-Detailseite ab
 * (`RouteBoundary`/`RouteErrorBoundary`-Auffangzustand „Ein unerwarteter
 * Fehler ist aufgetreten."), nicht nur der Zugangs-Abschnitt. Ursache: Der
 * Server liefert nach der Ausgabe (`GET .../portal-zugang`) den Status
 * `"ausgegeben"` — dieser Wert ist NICHT Teil des Frontend-Typs
 * `PortalZugangStatus` (`'offen' | 'aktiv' | 'gesperrt'`) und fehlt
 * entsprechend in `PortalZugangAbschnitt.tsx`s `STATUS_SCHLUESSEL`-Tabelle.
 * `STATUS_SCHLUESSEL[stand.data.status]` wird zu `undefined`,
 * `t(undefined)` wirft `"i18n: fehlender Schlüssel \"undefined\""`, und die
 * Route-Error-Boundary ersetzt die komplette Seite. Ein Vertrags-Drift
 * zwischen Backend-Enum und Frontend-Union — genau die Art Fehler, die ein
 * gemockter Komponententest (fester Fixture-Wert) nicht findet, ein echter
 * Klick gegen den echten Server aber sofort.
 *
 * Diese Spezifikation prüft deshalb bewusst den BEABSICHTIGTEN Ablauf
 * (Zugangsbrief erscheint, Kunde meldet sich an) und bleibt rot, bis
 * `PortalZugangStatus`/`STATUS_SCHLUESSEL` den Wert `"ausgegeben"` kennen
 * (oder Frontend und Backend sich auf `"offen"` einigen — die deutsche
 * Beschriftung `portal.zugang.statusOffen` „Code ausgegeben, noch nicht
 * eingelöst" deutet auf GENAU diesen Zustand hin). Als direkte Folge lässt
 * sich der Rest der Kette (Code einlösen, anmelden, Widerspruch) durch DIESEN
 * Absturz aktuell nicht Ende-zu-Ende gegen den echten Server bestätigen —
 * die Schritte danach sind sorgfältig gegen den Quellcode nachgezeichnet,
 * aber ungeprüft, solange der Absturz besteht.
 */

/**
 * Liest den Wert einer `<dt>`/`<dd>`-Zeile innerhalb von `scope` — exakt,
 * damit z. B. „Kennung" (die sowohl im dauerhaften Zugangsstand als auch im
 * einmaligen Zugangsbrief steht) nicht mit der jeweils anderen Zeile
 * verwechselt wird.
 */
async function leseFeldWert(scope: Locator, label: string, timeoutMs: number): Promise<string> {
  const dt = scope.locator('dt').filter({ hasText: new RegExp(`^${label}$`) });
  const dd = dt.locator('xpath=following-sibling::dd[1]');
  await dd.waitFor({ state: 'visible', timeout: timeoutMs });
  return ((await dd.textContent()) ?? '').trim();
}

/** Erzeugt den Zugangscode für einen frischen Endkunden und liest Kennung + Code aus dem Zugangsbrief. */
async function gebeZugangscodeAus(
  page: Page,
  endkundeId: string,
  barrierefreiheitsVerstoesse: BarrierefreiheitsVerstoss[],
): Promise<{ kennung: string; code: string }> {
  await page.goto(`/stammdaten/endkunden/${endkundeId}`);
  await page.getByRole('tab', { name: 'Verbrauch & Berichte' }).click();
  await expect(page.getByText('Für diesen Endkunden besteht noch kein Portal-Zugang.')).toBeVisible();
  barrierefreiheitsVerstoesse.push(
    ...(await sammleBarrierefreiheitsVerstoesse(page, 'Endkunde-Detail, Reiter Verbrauch & Berichte (ohne Zugang)')),
  );

  // Beim ERSTEN Mal ohne Rückfrage (`PortalZugangAbschnitt`: „es geht nichts verloren").
  await page.getByRole('button', { name: 'Zugangscode ausgeben' }).click();

  // Der Zugangsbrief erscheint zunächst (lokaler State direkt aus der
  // Mutations-Antwort) — der BEFUND aus der Moduldoku schlägt aber ERST kurz
  // DANACH zu, wenn die parallel losgeschickte Invalidierung des
  // Zugangsstands zurückkommt und die ganze Seite abstürzt. Ein einzelner
  // `toBeVisible()`-Check auf die Überschrift liefe deshalb ins Leere — hier
  // wird deshalb der GESAMTE Lesevorgang mit knapper Frist versucht und bei
  // Fehlschlag gezielt auf den bekannten Absturz geprüft, statt 60 s lang
  // ergebnislos auf ein `dt` zu warten, das nie mehr erscheint.
  let kennung: string;
  let code: string;
  try {
    const briefUeberschrift = page.getByRole('heading', { name: 'Zugangsbrief', level: 3 });
    await expect(briefUeberschrift).toBeVisible({ timeout: 10_000 });
    const brief = briefUeberschrift.locator('xpath=..');
    kennung = await leseFeldWert(brief, 'Kennung', 5_000);
    code = await leseFeldWert(brief, 'Zugangscode', 5_000);
  } catch (fehler) {
    const abgestuerzt = await page
      .getByRole('alert')
      .filter({ hasText: 'Ein unerwarteter Fehler ist aufgetreten.' })
      .isVisible()
      .catch(() => false);
    if (abgestuerzt) {
      throw new Error(
        'BEFUND (s. Moduldoku oben): Die Endkunde-Detailseite ist nach "Zugangscode ausgeben" abgestürzt ' +
          '(Route-Error-Boundary „Ein unerwarteter Fehler ist aufgetreten.") — der bekannte Status-Drift ' +
          '"ausgegeben" vs. PortalZugangStatus. Der Zugangsbrief war kurz sichtbar und wurde durch den ' +
          'Absturz wieder entfernt.',
      );
    }
    throw fehler;
  }

  expect(kennung).toMatch(/^EK-[A-HJ-NP-Z2-9]{6}$/);
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  barrierefreiheitsVerstoesse.push(...(await sammleBarrierefreiheitsVerstoesse(page, 'Zugangsbrief (ausgegeben)')));

  return { kennung, code };
}

test.describe('Nutzerportal im Browser', () => {
  test('Betrieb gibt einen Zugangscode aus, der Kunde löst ihn ein, meldet sich an und erklärt den digitalen Widerspruch', async ({
    page,
    browser,
  }) => {
    test.skip(
      OHNE_PASSWORT,
      'EDMS_E2E_PASSWORT ist nicht gesetzt — Zugangsdaten stehen bewusst nicht im Repository (s. playwright.config.ts).',
    );

    const name = eindeutig('E2E Portalkunde');
    const kundenPasswort = eindeutigesPasswort();
    const barrierefreiheitsVerstoesse: BarrierefreiheitsVerstoss[] = [];
    // Skriptfehler auf BEIDEN Seiten mitschneiden (analog `bedienfolge.pw.ts`)
    // — der BEFUND oben (Seitenabsturz nach Codeausgabe) wurde genau darüber
    // gefunden; ohne das läuft ein Absturz nur in einen nichtssagenden Timeout.
    const skriptFehler: string[] = [];
    page.on('pageerror', (fehler) => skriptFehler.push(`Betriebs-UI: ${fehler.message}`));

    // --- Betrieb: Endkunden anlegen und Zugangscode ausgeben ---
    await meldeAn(page);
    await page.goto('/stammdaten/endkunden/neu');
    await page.getByLabel('Name', { exact: true }).fill(name);
    await page.getByLabel('Anschrift', { exact: true }).fill(eindeutig('Teststraße 3'));
    await page.getByRole('button', { name: 'Anlegen' }).click();
    await expect(page).toHaveURL(/\/stammdaten\/endkunden\/([0-9a-f-]+)$/);
    const endkundeId = page.url().split('/').pop() ?? '';
    expect(endkundeId.length).toBeGreaterThan(0);

    const { kennung, code } = await gebeZugangscodeAus(page, endkundeId, barrierefreiheitsVerstoesse);

    // --- Kunde: eigener Browser-Kontext, keine Keycloak-Sitzung ---
    const kundenKontext = await browser.newContext();
    try {
      const kundenSeite = await kundenKontext.newPage();
      kundenSeite.on('pageerror', (fehler) => skriptFehler.push(`Portal: ${fehler.message}`));
      await kundenSeite.goto('/portal');
      await expect(kundenSeite.getByRole('heading', { name: 'Anmeldung', level: 1 })).toBeVisible();
      barrierefreiheitsVerstoesse.push(
        ...(await sammleBarrierefreiheitsVerstoesse(kundenSeite, 'Portal-Anmeldung')),
      );

      await kundenSeite.getByRole('tab', { name: 'Ich habe einen Zugangsbrief' }).click();
      await kundenSeite.getByLabel('Zugangscode', { exact: true }).fill(code);
      await kundenSeite.getByLabel('Neues Passwort', { exact: true }).fill(kundenPasswort);
      await kundenSeite.getByLabel('Passwort wiederholen', { exact: true }).fill(kundenPasswort);
      await kundenSeite.getByRole('button', { name: 'Zugang einrichten' }).click();

      // --- Angemeldet: die eigene Übersicht ---
      await expect(kundenSeite.getByRole('heading', { name: 'Ihre monatlichen Informationen' })).toBeVisible();
      await expect(kundenSeite.getByText(kennung)).toBeVisible();
      // Dokumentierter Leerzustand eines frischen Kunden ohne Berechnungslauf
      // (s. Modul-Doku oben) — genau das ist hier das korrekte Ergebnis.
      await expect(
        kundenSeite.getByText('Für Sie liegt noch keine monatliche Information vor.'),
      ).toBeVisible();
      barrierefreiheitsVerstoesse.push(
        ...(await sammleBarrierefreiheitsVerstoesse(kundenSeite, 'Portal-Übersicht (Leerzustand)')),
      );

      // --- Der digitale Widerspruch ---
      await expect(kundenSeite.getByText('Sie bekommen jeden Monat eine Information über Ihren Verbrauch und Ihre Einsparung.')).toBeVisible();
      await kundenSeite.getByRole('button', { name: 'Keine monatliche Information mehr erhalten' }).click();
      await expect(kundenSeite.getByRole('heading', { name: 'Keine monatliche Information mehr?' })).toBeVisible();
      await kundenSeite.getByRole('button', { name: 'Ja, nicht mehr informieren' }).click();

      await expect(
        kundenSeite.getByText('Ihr Widerspruch ist gespeichert. Sie erhalten ab sofort keine monatliche Information mehr.'),
      ).toBeVisible();
      await expect(
        kundenSeite.getByText('Sie haben der monatlichen Information widersprochen.'),
      ).toBeVisible();
      barrierefreiheitsVerstoesse.push(
        ...(await sammleBarrierefreiheitsVerstoesse(kundenSeite, 'Portal-Übersicht (widersprochen)')),
      );

      // --- Der Weg zurück ist genauso kurz wie der hin ---
      await kundenSeite.getByRole('button', { name: 'Monatliche Information wieder erhalten' }).click();
      await expect(
        kundenSeite.getByText('Sie erhalten wieder jeden Monat eine Information.'),
      ).toBeVisible();
      await expect(
        kundenSeite.getByText('Sie bekommen jeden Monat eine Information über Ihren Verbrauch und Ihre Einsparung.'),
      ).toBeVisible();
    } finally {
      await kundenKontext.close();
    }

    // Kein Skriptfehler auf dem Weg — s. BEFUND in der Moduldoku (Absturz
    // nach „Zugangscode ausgeben" durch den Status-Drift "ausgegeben").
    expect(skriptFehler, `Skriptfehler: ${skriptFehler.join(' | ')}`).toEqual([]);

    // Nur GEMELDET, nicht repariert — Farbwerte sind KIT-Branding und nicht
    // Gegenstand dieses Auftrags (s. Modul-Doku `support/barrierefreiheit.ts`).
    expect(barrierefreiheitsVerstoesse, JSON.stringify(barrierefreiheitsVerstoesse, null, 2)).toEqual([]);
  });
});
