import { expect, test } from '@playwright/test';
import { meldeAn, OHNE_PASSWORT } from './support/anmeldung';
import { eindeutig } from './support/synthetik';
import { sammleBarrierefreiheitsVerstoesse, type BarrierefreiheitsVerstoss } from './support/barrierefreiheit';

/**
 * **Berechnungslauf: der fachliche Kern — und eine dokumentierte Lücke.**
 *
 * AUFTRAG war, hier „Lauf starten → Ergebnis sehen" nachzuweisen. Das ist
 * beim Durchklicken NICHT herstellbar, ohne entweder (a) auf die
 * vorhandenen Bestandsdaten des Pilotbestands A zu bauen — ausdrücklich untersagt,
 * weil ein Aufräumlauf diesen Test dann rot macht — oder (b) einen
 * vollständigen Datensatz von Grund auf zu erzeugen: System, Zähler,
 * Messkonzept UND echte Messdaten, die den geforderten Zeitraum abdecken.
 *
 * (b) hat keinen für einen Testlauf schnellen Weg über die Oberfläche:
 * - Es gibt keine UI für einen Massen-/Alt-Import (`src/backend/src/import/**`
 *   ist ein CLI-Werkzeug ohne HTTP-Route, s. `aufbau-pilotbestand-a.ts` — bewusst
 *   liegenschaftsspezifisch, kein allgemeines Werkzeug).
 * - Der synthetische MQTT-Publisher (`EDMS_SYNTHETIC_PUBLISHER_*`,
 *   `synthetic-uplink-publisher.service.ts`) publiziert in Echtzeit-Intervallen
 *   (Default 15 Minuten) — für einen Kalendermonat Deckung bräuchte ein
 *   E2E-Lauf Tage an Wanduhrzeit.
 * - `BerechnungslaufAnlegenFormular` verlangt zusätzlich zur Baseline (die
 *   sich seit V0076 tatsächlich rein manuell über
 *   `BaselinePeriodenAbschnitt` pflegen lässt) einen aktiven Zähler MIT
 *   Messwerten im gewählten Zeitraum (Hindernis-Codes `keine_zaehler`/
 *   `keine_daten`) — das ist der Teil, der ohne Ingest nicht zu befüllen ist.
 *
 * Diese Lücke gehört gemeldet, nicht überspielt: Ohne einen UI- oder
 * API-erreichbaren Weg, einem frischen Testkunden in Sekunden statt Tagen
 * plausible Messdaten zu geben, bleibt der Kern-Flow der Anwendung im
 * Browser nicht Ende-zu-Ende prüfbar. Was diese Spezifikation STATT dessen
 * beweist: dass die Anwendung einen Berechnungslauf ohne Messkonzept korrekt
 * und begründet verweigert, statt ihn klaglos ins Leere laufen zu lassen
 * oder mit einem unerklärten deaktivierten Knopf abzuspeisen — das ist die
 * Bedienbarkeits-Eigenschaft, die sich mit vertretbarem Aufwand tatsächlich
 * nachweisen lässt.
 *
 * **BEFUND beim ersten Lauf gegen den Dev-Stack (bewusst NICHT „repariert",
 * s. `.claude/rules/tests.md`: „Jeder Bug-Fix hat einen Regressionstest, der
 * vor Fix rot war").** Für einen Endkunden OHNE jede Messkonzept-Version
 * zeigt die Seite nicht die vorgesehene, konkrete Meldung
 * (`stammdaten.berechnung.anlegen.keinMesskonzept`), sondern die generische
 * Ladefehler-Meldung `stammdaten.berechnung.anlegen.ladeFehler` („Das
 * Messkonzept konnte nicht geladen werden.") — das suggeriert einen
 * Netzwerk-/Serverfehler, wo in Wahrheit ein normaler, erwartbarer Zustand
 * vorliegt (ein Kunde ohne Messkonzept ist der Regelfall direkt nach dem
 * Anlegen).
 *
 * Ursache: `useBerechnungslaufAnlegenView.ts` ruft
 * `useMesskonzeptVersionDetail(aktuelleVersionNr === undefined ? '' : …)`
 * OHNE `{ enabled: aktuelleVersionNr !== undefined }` — die Detail-Query
 * bleibt bei einer leeren Id per Fabrik-Default (`createDetailQuery.ts`:
 * `enabled: options?.enabled ?? true`) AKTIV. `fetchMesskonzeptVersionDetail('')`
 * decodiert das zu `{ endkundeId: '', versionNr: 0 }`
 * (`messkonzeptApi.ts` `decodeMesskonzeptVersionId`: `Number('') === 0`,
 * kein `NaN`) und schickt tatsächlich
 * `GET /stammdaten/endkunden//messkonzept/versionen/0` — das schlägt
 * serverseitig fehl und liefert `detail.isError = true`, was in der Ansicht
 * Vorrang vor der eigentlich zutreffenden „kein Messkonzept"-Meldung hat.
 *
 * Diese Spezifikation prüft deshalb bewusst die BEABSICHTIGTE Meldung und
 * bleibt rot, bis der fehlende `enabled`-Guard ergänzt ist.
 */
test.describe('Berechnungslauf im Browser', () => {
  test('verweigert einen Berechnungslauf ohne Messkonzept — mit Begründung, nicht mit einer stillen Sperre', async ({
    page,
  }) => {
    test.skip(
      OHNE_PASSWORT,
      'EDMS_E2E_PASSWORT ist nicht gesetzt — Zugangsdaten stehen bewusst nicht im Repository (s. playwright.config.ts).',
    );

    const name = eindeutig('E2E Ohne Messkonzept');
    const barrierefreiheitsVerstoesse: BarrierefreiheitsVerstoss[] = [];

    await meldeAn(page);

    // Ein frischer, synthetischer Endkunde OHNE jedes Messkonzept.
    await page.goto('/stammdaten/endkunden/neu');
    await page.getByLabel('Name', { exact: true }).fill(name);
    await page.getByLabel('Anschrift', { exact: true }).fill(eindeutig('Teststraße 2'));
    await page.getByRole('button', { name: 'Anlegen' }).click();
    await expect(page).toHaveURL(/\/stammdaten\/endkunden\/[0-9a-f-]+$/);

    // Über die Detailseite zum Berechnungslauf-Einstieg — derselbe Weg, den
    // ein Bediener nimmt, kein direkter Sprung per URL.
    await page.getByRole('link', { name: 'Berechnungsläufe ansehen' }).click();
    await expect(page.getByRole('heading', { name: 'Berechnungsläufe' })).toBeVisible();
    barrierefreiheitsVerstoesse.push(...(await sammleBarrierefreiheitsVerstoesse(page, 'Berechnungsläufe (Liste)')));
    await page.getByRole('link', { name: 'Berechnung starten' }).click();
    await expect(page.getByRole('heading', { name: 'Berechnung starten' })).toBeVisible();

    // Die Verweigerung ist eine BEGRÜNDETE Fehlermeldung, kein wortloses
    // Verschwinden des Formulars.
    await expect(
      page.getByText(
        'Für diesen Endkunden ist keine gültige Messkonzept-Version mit Energieträger hinterlegt. Ohne Messkonzept gibt es keine Baseline und damit nichts zu rechnen.',
      ),
    ).toBeVisible();

    // Und sie ist VOLLSTÄNDIG — es gibt keinen Feldsatz, über den sich der
    // Lauf trotzdem auslösen ließe (das Formular erscheint erst, sobald
    // mindestens ein Energieträger zur Wahl steht).
    await expect(page.getByRole('button', { name: 'Berechnung starten' })).toHaveCount(0);
    await expect(page.getByLabel('Energieträger')).toHaveCount(0);
    barrierefreiheitsVerstoesse.push(...(await sammleBarrierefreiheitsVerstoesse(page, 'Berechnung starten (verweigert)')));

    // Nur GEMELDET, nicht repariert — Farbwerte sind KIT-Branding und nicht
    // Gegenstand dieses Auftrags (s. Modul-Doku `support/barrierefreiheit.ts`).
    expect(barrierefreiheitsVerstoesse, JSON.stringify(barrierefreiheitsVerstoesse, null, 2)).toEqual([]);
  });
});
