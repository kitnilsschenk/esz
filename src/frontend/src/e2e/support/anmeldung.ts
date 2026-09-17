import type { Page } from '@playwright/test';

/**
 * Zugangsdaten der angemeldeten Bedienfolge im E2E-Lauf gegen den lokalen
 * Dev-Stack — bewusst aus der Umgebung, nie aus dem Repository (s.
 * `playwright.config.ts`, `.claude/hooks` Secret-Scan).
 *
 * Ausgelagert aus `bedienfolge.pw.ts`: Jede Spezifikation, die eine
 * angemeldete Sitzung braucht (Stammdaten-Pflege, Berechnung, Nachweis,
 * Nutzerportal-Ausgabe), verwendet DIESELBE Anmeldung statt sie je Datei
 * nachzubauen — sonst driftet der Login-Ablauf in fünf Kopien auseinander.
 */
export const E2E_BENUTZER = process.env['EDMS_E2E_BENUTZER'] ?? 'dev-betrieb-01';
export const E2E_PASSWORT = process.env['EDMS_E2E_PASSWORT'];

/**
 * `true`, solange kein Passwort in der Umgebung steht — dann lässt sich die
 * angemeldete Bedienfolge nicht prüfen. Aufrufer reichen das an
 * `test.skip(OHNE_PASSWORT, …)` durch: Der Lauf SAGT, was fehlt, statt still
 * grün durchzulaufen.
 */
export const OHNE_PASSWORT = E2E_PASSWORT === undefined || E2E_PASSWORT === '';

/**
 * Meldet an der Keycloak-Maske an und wartet, bis die App-Shell (Vite-Port
 * `5180`) steht.
 */
export async function meldeAn(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Anmelden' }).click();

  // Keycloak-Formular (eigener Origin, deshalb erst auf die Felder warten).
  await page.waitForSelector('#username', { timeout: 30_000 });
  await page.fill('#username', E2E_BENUTZER);
  await page.fill('#password', E2E_PASSWORT ?? '');
  await page.click('#kc-login');

  await page.waitForURL((url) => url.port === '5180', { timeout: 30_000 });
}
