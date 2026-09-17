import { expect, test } from '@playwright/test';
import { meldeAn, OHNE_PASSWORT } from './support/anmeldung';
import { sammleBarrierefreiheitsVerstoesse, type BarrierefreiheitsVerstoss } from './support/barrierefreiheit';

/**
 * **Die zentrale Bedienfolge, im echten Browser.**
 *
 * Die Vitest-Tests prüfen Komponenten gegen nachgebaute Antworten. Was sie
 * nicht sehen: ob die Anmeldung durchläuft, ob der Dev-Proxy die Backend-Pfade
 * trifft, ob eine Route nach dem Code-Splitting überhaupt lädt, und ob die
 * Seiten in der Reihenfolge begehbar sind, in der ein Bediener sie braucht.
 * Genau dort sind in diesem Projekt schon Fehler aufgetreten (fehlende
 * Proxy-Pfade, ein Puffer-Objekt, an dem das Rendern abbrach).
 *
 * Bewusst schlank: Diese Datei prüft die BEGEHBARKEIT der Folge
 *
 *   Anmeldung → Arbeitsplatz → Kunde → Verbrauch & Einsparung
 *   → Monatliche Nutzerinformation
 *
 * und nicht die Fachlogik — die steht in den Integrationstests des Backends,
 * im Kettentest `src/backend/src/e2e/energiekette.e2e.integration.spec.ts`
 * und in den MUTATIONS-Spezifikationen dieses Verzeichnisses
 * (`stammdaten-pflege.pw.ts`, `berechnungslauf.pw.ts`, `nachweis-export.pw.ts`,
 * `nutzerportal.pw.ts`): Diese Datei klickt nur und schaut, ob etwas da ist —
 * sie legt nichts an, ändert nichts, löscht nichts.
 */

test.describe('Bedienfolge im Browser', () => {
  test('ohne Anmeldung führt die Anwendung zur Anmeldung — und wirft dabei keinen Skriptfehler', async ({ page }) => {
    const skriptFehler: string[] = [];
    const konsolenFehler: string[] = [];
    page.on('pageerror', (error) => skriptFehler.push(error.message));
    page.on('console', (nachricht) => {
      if (nachricht.type() === 'error') {
        konsolenFehler.push(nachricht.text());
      }
    });

    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Anmeldung erforderlich' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Anmelden' })).toBeVisible();

    expect(skriptFehler, `Skriptfehler auf der Anmeldeseite: ${skriptFehler.join(' | ')}`).toEqual([]);

    // Die 401-Antwort der Sitzungspruefung ist im abgemeldeten Zustand die
    // RICHTIGE Antwort — der Browser protokolliert sie trotzdem als
    // Konsolenfehler. Sie hier durchgehen zu lassen ist kein Aufweichen der
    // Pruefung: Alles andere schlaegt weiterhin fehl.
    const unerwartet = konsolenFehler.filter((zeile) => !zeile.includes('401'));
    expect(unerwartet, `Unerwartete Konsolenfehler: ${unerwartet.join(' | ')}`).toEqual([]);

    // Barrierefreiheit ECHT gemessen (inkl. `color-contrast`, im
    // jsdom-Unit-Setup nicht möglich, s. `support/barrierefreiheit.ts`) — nur
    // gemeldet, nicht repariert (Farbwerte sind KIT-Branding).
    const verstoesse = await sammleBarrierefreiheitsVerstoesse(page, 'Anmeldeseite (abgemeldet)');
    expect(verstoesse, JSON.stringify(verstoesse, null, 2)).toEqual([]);
  });

  test('angemeldet ist die Folge Arbeitsplatz → Kunde → Einsparung → Nutzerinformation begehbar', async ({ page }) => {
    // Ohne Passwort in der Umgebung ist die angemeldete Folge nicht prüfbar.
    // Kein stiller Durchlauf: Der Lauf sagt, was fehlt.
    test.skip(
      OHNE_PASSWORT,
      'EDMS_E2E_PASSWORT ist nicht gesetzt — Zugangsdaten stehen bewusst nicht im Repository (s. playwright.config.ts).',
    );

    const barrierefreiheitsVerstoesse: BarrierefreiheitsVerstoss[] = [];

    await meldeAn(page);

    // --- Arbeitsplatz: die Fragen des Bedieners auf einer Seite ---
    await expect(page.getByRole('heading', { name: 'Arbeitsplatz' })).toBeVisible();
    // BEFUND (unabhängig von diesem Auftrag): Die Kachel heißt tatsächlich
    // „Zähler mit Datenausfall" (Singular, `dashboard.kachel.ausfall.titel`) —
    // das vorherige `/Datenausfälle/` (Plural) traf nie zu und ließ diesen
    // Test seit seiner Einführung an dieser Stelle rot laufen, sobald
    // `EDMS_E2E_PASSWORT` gesetzt war. Korrigiert auf den tatsächlichen Text.
    await expect(page.getByRole('heading', { name: /Datenausfall/ })).toBeVisible();
    // BEFUND: Ebenso hieß die Kachel nie „Monatliche Nutzerinformation"
    // (das ist der Seitentitel von `/nutzerinfo/laeufe`, weiter unten
    // korrekt geprüft) — die Dashboard-Kachel heißt `Monatsinformation`
    // (`dashboard.kachel.nutzerinfo.titel`).
    await expect(page.getByRole('heading', { name: 'Monatsinformation' })).toBeVisible();
    barrierefreiheitsVerstoesse.push(...(await sammleBarrierefreiheitsVerstoesse(page, 'Arbeitsplatz')));

    // --- Kunde: Liste → Detail ---
    await page.getByRole('link', { name: 'Endkunden' }).click();
    await expect(page.getByRole('heading', { name: 'Endkunden' })).toBeVisible();
    barrierefreiheitsVerstoesse.push(...(await sammleBarrierefreiheitsVerstoesse(page, 'Endkunden-Liste')));
    const ersterKunde = page.getByRole('link', { name: /Öffnen|Details/ }).first();
    if (await ersterKunde.isVisible()) {
      await ersterKunde.click();
      // Der Monatsbericht haengt am Kunden — genau das soll auffindbar sein.
      await expect(page.getByText('Monatliche Information')).toBeVisible();
      barrierefreiheitsVerstoesse.push(...(await sammleBarrierefreiheitsVerstoesse(page, 'Endkunde-Detail')));
    }

    // --- Verbrauch und Einsparung ---
    await page.goto('/berechnung/laeufe');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    barrierefreiheitsVerstoesse.push(...(await sammleBarrierefreiheitsVerstoesse(page, 'Verbrauch & Einsparung')));

    // --- Monatliche Nutzerinformation: Lauf-Seite samt Wegweiser ---
    await page.goto('/nutzerinfo/laeufe');
    // BEFUND: Der Seitentitel ist `Monatsinformation` (`nutzerinfo.lauf.pageTitle`),
    // nicht „Monatliche Nutzerinformation" — dasselbe Drift-Muster wie oben.
    await expect(page.getByRole('heading', { name: 'Monatsinformation' })).toBeVisible();
    await expect(page.getByText(/Die erzeugten Informationen stehen beim jeweiligen Endkunden/)).toBeVisible();
    barrierefreiheitsVerstoesse.push(...(await sammleBarrierefreiheitsVerstoesse(page, 'Monatsinformation (Lauf-Seite)')));

    // Barrierefreiheit ECHT gemessen (inkl. `color-contrast`) — nur gemeldet,
    // nicht repariert (Farbwerte sind KIT-Branding, s. `support/barrierefreiheit.ts`).
    expect(barrierefreiheitsVerstoesse, JSON.stringify(barrierefreiheitsVerstoesse, null, 2)).toEqual([]);
  });
});
