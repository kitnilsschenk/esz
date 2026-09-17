import { expect, test } from '@playwright/test';
import { meldeAn, OHNE_PASSWORT } from './support/anmeldung';
import { eindeutig, eindeutigeKennung, ersterTagDiesesMonats } from './support/synthetik';
import { sammleBarrierefreiheitsVerstoesse, type BarrierefreiheitsVerstoss } from './support/barrierefreiheit';

/**
 * **Die Nachweis-Kette: Förderjahr → Vollständigkeitsprüfung → Einspar-Lauf
 * → Export → Download.** Das Artefakt am Ende ist es, das beim BAFA landet.
 *
 * Ein Förderjahr ist — anders als Endkunde/System/Zähler — KEINE
 * Unterressource eines bestimmten Kunden (`FoerderjahrAnlegenFormular` hat
 * kein `endkundeId`-Feld); es ist eine globale Zeitraum-Definition, gegen die
 * die Vollständigkeitsprüfung über den gesamten Bestand läuft. Diese
 * Spezifikation braucht deshalb KEINEN eigens aufgebauten Kunden mit
 * Baseline und Messdaten (s. dazu die dokumentierte Lücke in
 * `berechnungslauf.pw.ts`) — sie prüft die Kette selbst, nicht deren Inhalt.
 *
 * Der Lauf ist im Dev-Stack deterministisch ROT: `EDMS_SYNTHETIC_ONLY=true`
 * (gesetzt in `.env`) lässt den Preflight-Blocker `FJ-09` IMMER greifen
 * (`preflight.service.ts`: „ein grüner Preflight für
 * art=foerderjahr_nachweis ist strukturell unerreichbar, solange der Betrieb
 * auf synthetischen Testdaten läuft — das ist beabsichtigt"). Das ist
 * fachlich genau richtig für einen E2E-Lauf: Er behauptet nie versehentlich,
 * einen einreichbaren Förderjahr-Nachweis erzeugt zu haben. Der Weiterweg
 * für einen roten Preflight — ein Zwischenstand — ist ausdrücklich vorgesehen
 * (`nachweis.preflight.detail.einsparlaufHinweisRot`) und bis zum Download
 * durchgängig begehbar; genau den prüft dieser Test.
 *
 * Append-only Kette ohne Löschpfad (ADR-0007 Teil B/C) — kein Aufräumen nach
 * dem Lauf nötig oder möglich. Wiederholbarkeit über die eindeutige
 * Förderjahr-Kennung (`eindeutigeKennung()`), die einzige UNIQUE-Spalte
 * dieser Kette (`nachweis.foerderjahr.code`).
 */
test.describe('Nachweis-Export im Browser', () => {
  test('rechnet aus einer nicht bestandenen Prüfung einen Zwischenstand und lässt den Export herunterladen', async ({
    page,
  }) => {
    test.skip(
      OHNE_PASSWORT,
      'EDMS_E2E_PASSWORT ist nicht gesetzt — Zugangsdaten stehen bewusst nicht im Repository (s. playwright.config.ts).',
    );

    const code = eindeutigeKennung('E2E-FJ');
    const vorhabenRef = eindeutig('E2E-Vorhaben');
    const monat = ersterTagDiesesMonats();
    const barrierefreiheitsVerstoesse: BarrierefreiheitsVerstoss[] = [];

    await meldeAn(page);

    // --- Förderjahr anlegen ---
    await page.goto('/nachweis/foerderjahre/neu');
    barrierefreiheitsVerstoesse.push(...(await sammleBarrierefreiheitsVerstoesse(page, 'Förderjahr anlegen')));
    await page.getByLabel('Kennung', { exact: true }).fill(code);
    await page.getByLabel('Aktenzeichen', { exact: true }).fill(vorhabenRef);
    await page.getByLabel('Projektjahr', { exact: true }).fill('1');
    await page.getByLabel('Erster Monat', { exact: true }).fill(monat);
    await page.getByLabel('Letzter Monat', { exact: true }).fill(monat);
    await page.getByLabel('Zuschnitt', { exact: true }).selectOption({ label: 'Kalenderjahr' });
    await page.getByRole('button', { name: 'Förderjahr anlegen' }).click();

    await expect(page).toHaveURL(/\/nachweis\/foerderjahre\/[0-9a-f-]+$/);
    await expect(page.getByRole('heading', { level: 1, name: code })).toBeVisible();
    barrierefreiheitsVerstoesse.push(...(await sammleBarrierefreiheitsVerstoesse(page, 'Förderjahr-Detail')));

    // --- Vollständigkeit prüfen — im Dev-Stack deterministisch rot ---
    await page.getByRole('button', { name: 'Vollständigkeit prüfen' }).click();
    await expect(page).toHaveURL(/\/nachweis\/preflights\/[0-9a-f-]+$/);
    await expect(page.getByText('Prüfung nicht bestanden')).toBeVisible();
    await expect(
      page.getByText('Mindestens ein blockierender Befund steht offen. Solange er besteht, ist nur ein Zwischenstand möglich, kein Förderjahr-Nachweis.'),
    ).toBeVisible();
    barrierefreiheitsVerstoesse.push(...(await sammleBarrierefreiheitsVerstoesse(page, 'Vollständigkeitsprüfung (rot)')));

    // --- Einspar-Lauf als Zwischenstand starten ---
    await page.getByRole('link', { name: 'Einspar-Lauf starten' }).click();
    await expect(page).toHaveURL(/\/nachweis\/preflights\/[0-9a-f-]+\/einsparlauf-neu$/);
    await expect(page.getByRole('heading', { name: 'Einspar-Lauf starten' })).toBeVisible();
    barrierefreiheitsVerstoesse.push(...(await sammleBarrierefreiheitsVerstoesse(page, 'Einspar-Lauf starten (Formular)')));

    await page.getByLabel('Art des Laufs', { exact: true }).selectOption({ label: 'Zwischenstand' });
    await page.getByLabel('Auslöser', { exact: true }).selectOption({ label: 'manuell' });
    await page.getByRole('button', { name: 'Einspar-Lauf starten' }).click();

    await expect(page).toHaveURL(/\/nachweis\/einsparlaeufe\/[0-9a-f-]+$/);
    await expect(page.getByRole('heading', { name: 'Einspar-Lauf' })).toBeVisible();
    await expect(
      page.getByText('Aus einem Zwischenstand lässt sich ein Export erzeugen — einreichen lässt er sich nicht.'),
    ).toBeVisible();
    barrierefreiheitsVerstoesse.push(...(await sammleBarrierefreiheitsVerstoesse(page, 'Einspar-Lauf-Detail')));

    // --- Export erzeugen ---
    await page.getByLabel('Zweck', { exact: true }).selectOption({ label: 'Nachweis' });
    await page.getByRole('button', { name: 'Export erzeugen' }).click();

    await expect(page).toHaveURL(/\/nachweis\/exporte\/[0-9a-f-]+$/);
    await expect(page.getByRole('heading', { name: 'Nachweis-Export' })).toBeVisible();
    barrierefreiheitsVerstoesse.push(...(await sammleBarrierefreiheitsVerstoesse(page, 'Nachweis-Export-Detail')));

    // --- Download prüfen ---
    // Der Abruf ist bewusst eine Schaltfläche statt eines Links (die Datei
    // wird bei jedem Klick neu erzeugt, s. `NachweisExportDateienTabelle`) —
    // der Test prüft deshalb ein echtes Playwright-`download`-Ereignis, nicht
    // nur das Vorhandensein eines `href`.
    const ersteDatei = page.getByRole('button', { name: /^Herunterladen / }).first();
    await expect(ersteDatei).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent('download'), ersteDatei.click()]);

    expect(download.suggestedFilename().length).toBeGreaterThan(0);
    await expect(page.getByText('Die Datei wurde zum Speichern angeboten.')).toBeVisible();

    // Nur GEMELDET, nicht repariert — Farbwerte sind KIT-Branding und nicht
    // Gegenstand dieses Auftrags (s. Modul-Doku `support/barrierefreiheit.ts`).
    expect(barrierefreiheitsVerstoesse, JSON.stringify(barrierefreiheitsVerstoesse, null, 2)).toEqual([]);
  });
});
