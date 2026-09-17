import { expect, test } from '@playwright/test';
import { meldeAn, OHNE_PASSWORT } from './support/anmeldung';
import { eindeutig } from './support/synthetik';
import { sammleBarrierefreiheitsVerstoesse, type BarrierefreiheitsVerstoss } from './support/barrierefreiheit';

/**
 * **Stammdaten-Pflege: Endkunde anlegen, wiederfinden, ändern.**
 *
 * `bedienfolge.pw.ts` prüft nur, ob sich die Seiten aufrufen lassen — hier
 * geht es um die Mutation selbst: Legt das Formular tatsächlich einen
 * Datensatz an? Findet man ihn danach wieder? Übersteht eine Änderung ein
 * Neuladen der Seite (also: liegt sie wirklich in der Datenbank und nicht
 * nur im Formular-State)?
 *
 * Das ist der am häufigsten benutzte Flow der Betriebs-UI — jeder Endkunde,
 * jedes System, jeder Zähler entsteht über genau dieses Muster
 * (`EntityForm`). Ein Formularfehler hier trifft daher nicht nur den
 * Endkunden, sondern strahlt auf jede andere Stammdaten-Entität aus.
 *
 * Synthetischer Endkunde, eindeutig benannt (`eindeutig()`) — kein Bezug zu
 * den vorhandenen Bestandsdaten des Pilotbestands A. Aufräumen: Die Betriebs-UI bietet
 * für Endkunden bewusst KEIN Hard-Delete (nur Sperren nach Art. 18 oder
 * Krypto-Shredding im Vier-Augen-Verfahren, ADR-0009) — ein Testkunde bleibt
 * nach dem Lauf bestehen. Die eindeutige Kennzeichnung sorgt dafür, dass ein
 * erneuter Lauf nicht mit einem vorherigen kollidiert (Wiederholbarkeit statt
 * Aufräumen, s. `support/synthetik.ts`).
 */
test.describe('Stammdaten-Pflege im Browser', () => {
  test('legt einen Endkunden an, findet ihn über die Liste wieder, ändert ihn — und die Änderung übersteht ein Neuladen', async ({
    page,
  }) => {
    test.skip(
      OHNE_PASSWORT,
      'EDMS_E2E_PASSWORT ist nicht gesetzt — Zugangsdaten stehen bewusst nicht im Repository (s. playwright.config.ts).',
    );

    const name = eindeutig('E2E Endkunde');
    const anschrift = `Teststraße 1, ${eindeutig('88212 Testort')}`;
    const geaenderterName = eindeutig('E2E Endkunde geändert');
    // Sammelt Barrierefreiheits-Verstöße über den ganzen Flow, statt beim
    // ersten Fund abzubrechen — s. `support/barrierefreiheit.ts`. `axe-core`
    // misst hier ECHT (inkl. `color-contrast`, im jsdom-Unit-Setup nicht
    // messbar) — WCAG 2.2 AA 1.4.3/1.4.11, BITV-2.0-Pflicht.
    const barrierefreiheitsVerstoesse: BarrierefreiheitsVerstoss[] = [];

    await meldeAn(page);

    // --- Anlegen ---
    await page.goto('/stammdaten/endkunden/neu');
    await expect(page.getByRole('heading', { name: 'Endkunde anlegen' })).toBeVisible();
    barrierefreiheitsVerstoesse.push(...(await sammleBarrierefreiheitsVerstoesse(page, 'Endkunde anlegen')));
    await page.getByLabel('Name', { exact: true }).fill(name);
    await page.getByLabel('Anschrift', { exact: true }).fill(anschrift);
    await page.getByRole('button', { name: 'Anlegen' }).click();

    // Erfolgreiches Anlegen navigiert auf die Detailseite des neuen Kunden —
    // die URL trägt seine Kennung, die restliche Prüfung braucht sie nicht.
    await expect(page).toHaveURL(/\/stammdaten\/endkunden\/[0-9a-f-]+$/);
    const detailUrl = page.url();
    await expect(page.getByText(name, { exact: true })).toBeVisible();
    await expect(page.getByText(anschrift, { exact: true })).toBeVisible();
    barrierefreiheitsVerstoesse.push(...(await sammleBarrierefreiheitsVerstoesse(page, 'Endkunde-Detail (neu angelegt)')));

    // --- Wiederfinden über die Liste (Filter, keine feste Positionsannahme) ---
    await page.getByRole('link', { name: 'Zurück zur Liste' }).click();
    await expect(page.getByRole('heading', { name: 'Endkunden' })).toBeVisible();
    await page.getByLabel('Liste filtern').fill(name);
    barrierefreiheitsVerstoesse.push(...(await sammleBarrierefreiheitsVerstoesse(page, 'Endkunden-Liste (gefiltert)')));

    const zeile = page.getByRole('row').filter({ hasText: name });
    await expect(zeile).toBeVisible();
    await zeile.getByRole('link', { name: /Details anzeigen/ }).click();
    await expect(page).toHaveURL(detailUrl);

    // --- Ändern ---
    await page.getByRole('link', { name: 'Bearbeiten' }).click();
    await expect(page).toHaveURL(`${detailUrl}/aendern`);
    await expect(page.getByRole('heading', { name: 'Endkunde ändern' })).toBeVisible();
    barrierefreiheitsVerstoesse.push(...(await sammleBarrierefreiheitsVerstoesse(page, 'Endkunde ändern')));

    const nameFeld = page.getByLabel('Name', { exact: true });
    await expect(nameFeld).toHaveValue(name); // vorbefuellt aus dem geladenen Datensatz
    await nameFeld.fill(geaenderterName);
    await page.getByRole('button', { name: 'Speichern' }).click();

    await expect(page).toHaveURL(detailUrl);
    await expect(page.getByText(geaenderterName, { exact: true })).toBeVisible();
    await expect(page.getByText(name, { exact: true })).toHaveCount(0);

    // --- Übersteht die Änderung ein Neuladen? ---
    // Ohne diesen Schritt bliebe unklar, ob „Speichern" wirklich in die
    // Datenbank schreibt oder nur den React-Query-Cache der laufenden Seite
    // aktualisiert — beides sieht im selben Tab identisch aus.
    await page.reload();
    await expect(page.getByText(geaenderterName, { exact: true })).toBeVisible();
    barrierefreiheitsVerstoesse.push(...(await sammleBarrierefreiheitsVerstoesse(page, 'Endkunde-Detail (nach Neuladen)')));

    // Nur GEMELDET, nicht repariert — Farbwerte sind KIT-Branding und nicht
    // Gegenstand dieses Auftrags (s. Modul-Doku `support/barrierefreiheit.ts`).
    expect(barrierefreiheitsVerstoesse, JSON.stringify(barrierefreiheitsVerstoesse, null, 2)).toEqual([]);
  });
});
