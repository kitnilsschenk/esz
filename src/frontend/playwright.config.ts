import { defineConfig, devices } from '@playwright/test';

/**
 * Browserprüfung der zentralen Bedienfolge (`.claude/rules/frontend-react.md`:
 * „Playwright für Flow-Tests").
 *
 * **Kein `webServer`-Block, und das ist Absicht.** Die Bedienfolge braucht
 * mehr als den Vite-Server: Backend, Postgres und Keycloak müssen laufen,
 * sonst prüft der Test eine Anmeldemaske gegen sich selbst. Playwright kann
 * diesen Stapel nicht sinnvoll hochfahren — er gehört in den Dev-Stack
 * (`deployment/docker/docker-compose.dev.yml` + `pnpm --filter @edms/backend
 * start` + `pnpm --filter @edms/frontend dev`). Fehlt er, scheitert der Lauf
 * mit der unveränderten Verbindungsmeldung; bewusst KEIN stiller Auslassen.
 *
 * Die Zugangsdaten kommen aus der Umgebung und stehen NICHT im Repository —
 * auch keine Dev-Zugangsdaten (`.claude/hooks` Secret-Scan, und der Grund
 * dahinter gilt unabhängig davon):
 *
 *   EDMS_E2E_BENUTZER   Standard `dev-betrieb-01`
 *   EDMS_E2E_PASSWORT   Pflicht für die angemeldete Folge
 *
 * Ohne `EDMS_E2E_PASSWORT` läuft nur die unangemeldete Prüfung.
 */
export default defineConfig({
  // Die Spezifikationen liegen unter `src/e2e/` mit der Endung `.pw.ts` —
  // damit deckt sie `tsc --noEmit` und der typbewusste Lint ab (beide sind
  // auf `src` eingestellt), waehrend Vitest sie NICHT einsammelt (dort zaehlt
  // nur `*.spec.ts(x)`). Ein Browsertest, den der Typcheck nicht sieht,
  // veraltet still.
  testDir: './src/e2e',
  testMatch: '**/*.pw.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env['EDMS_E2E_BASIS_URL'] ?? 'http://localhost:5180',
    locale: 'de-DE',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
