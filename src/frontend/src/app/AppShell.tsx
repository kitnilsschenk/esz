import { useRef, type ReactNode } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { AuthStatusHeader } from '../features/auth/components/AuthStatusHeader';
import { HealthStatusPanel } from '../features/health/components/HealthStatusPanel';
import { DashboardPage } from '../features/dashboard';
import { stammdatenRoutes } from '../features/stammdaten';
import { nachweisRoutes } from '../features/nachweis';
import { nutzerinfoRoutes } from '../features/nutzerinfo';
import { AppNav } from './AppNav';
import { RouteBoundary } from './RouteBoundary';
import { RouteAnnouncer } from './RouteAnnouncer';
import { Brotkrumen } from './Brotkrumen';
import { KitConsultingMarke, KitConsultingSignet } from '../shared/branding/Marke';
import { NotFoundPage } from './NotFoundPage';
import { t } from '../shared/i18n/t';

/**
 * Authentifizierter App-Bereich: Sidebar-Layout (Design-System „Navigation":
 * `w-64`-Sidebar + Content-Bereich) + Routing (Betriebs-UI, ADR-0008 §23 /
 * D11, Phase 4c; Sidebar-Optik Phase 4c-Feinschliff; A11y-Härtung
 * Skip-Link/Fokus-Management, WCAG 2.2 AA). Wird von `AuthGate` erst NACH
 * erfolgreichem Login-Bootstrap gerendert (`App.tsx`).
 *
 * `AuthStatusHeader` (Session-/Logout-Anzeige) wird HIER als Topbar der
 * Content-Spalte gerendert — GENAU EINMAL. Vorher stand sie zusätzlich auch
 * in `AuthGate` (Live-Run-Fund: „Angemeldet als Betrieb / Abmelden" doppelt);
 * `AuthGate` rendert seit dem Fix nur noch die reine Zugangskontrolle.
 *
 * Jede Route ist einzeln in eine `RouteBoundary` (Suspense + Error-Boundary,
 * Route-Level) gehüllt — das geschieht HIER zentral, damit
 * `stammdatenRoutes`-Einträge selbst nur `{ path, element }` liefern müssen.
 *
 * `/` zeigt seit dem Betriebs-UI-Konzept (Punkt 1) `DashboardPage`
 * („Arbeitsplatz" statt Health-Check) — der bisherige Health-Walking-
 * Skeleton-Inhalt (`HealthStatusPanel`) ist NICHT verschwunden, sondern
 * unter `/verwaltung/systemstatus` erreichbar (Nav-Eintrag admin-only, s.
 * `AppNav.tsx`) UND über den Ampel-Punkt in `AuthStatusHeader` (für ALLE
 * Rollen, „Betriebs-Team sieht Auffälligkeiten beiläufig").
 *
 * A11y-Härtung (2.4.1/2.4.2/2.4.3/4.1.3):
 * - Skip-Link als erstes fokussierbares Element der Seite (`sr-only` +
 *   `focus:not-sr-only`-Muster — unsichtbar bis zum Tastatur-Fokus),
 *   Sprungziel `#hauptinhalt` auf dem `<main>`.
 * - `<main id="hauptinhalt" tabIndex={-1}>` ist zugleich das Fokus-Ziel bei
 *   Client-seitigen Routenwechseln (`RouteAnnouncer`, innerhalb `<main>` aber
 *   AUSSERHALB der `<Routes>`-Kinder — bleibt über die gesamte App-Laufzeit
 *   gemountet, siehe dortige Doku).
 * - Die Haupt-Navigation ist ein `<div>` (kein `<aside>`/„complementary"-
 *   Landmark) — das Navigations-Landmark bleibt allein das `<nav aria-label>`
 *   in `AppNav.tsx`.
 */
export function AppShell(): ReactNode {
  const hauptinhaltRef = useRef<HTMLElement>(null);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <a
        href="#hauptinhalt"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg"
      >
        {t('app.skipLink')}
      </a>
      <div className="flex w-64 shrink-0 flex-col border-r border-border bg-card">
        <div className="flex h-16 shrink-0 items-center justify-center border-b border-border">
          {/*
            Der Titel ist ein LINK zur Startseite. Zuvor war er ein `<span>`,
            und es gab auch sonst nirgends in der Anwendung einen Verweis auf
            `/` — das „Arbeitsplatz"-Dashboard war aus der laufenden App
            überhaupt nicht mehr erreichbar (nur über den Zurück-Button oder
            die URL). „Logo führt nach Hause" ist die verbreitetste
            Navigations-Konvention überhaupt; sie zu brechen kostet mehr als
            jede andere Auffindbarkeits-Schwäche.

            Der sichtbare Text IST der Accessible Name (kein `aria-label`,
            das ihn ersetzen würde) — WCAG 2.2 AA 2.5.3 „Label in Name".
          */}
          <Link
            to="/"
            className="flex items-center gap-2 rounded-md px-2 py-1 text-base font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {/*
              Das Signet steht NEBEN dem Produktnamen, nicht an seiner Stelle:
              Der sichtbare Text bleibt der Accessible Name des Links (WCAG
              2.5.3 „Label in Name", s. Kommentar oben). Ein Bild als einziger
              Inhalt hätte den Namen in ein `alt` verschoben — technisch
              zulässig, aber der Text ist die robustere Zusage.
            */}
            <KitConsultingSignet hoehe={22} />
            {t('app.title')}
          </Link>
        </div>
        <AppNav />
        {/*
          Der Urhebernachweis steht am FUSS der Leiste, nicht im Kopf. Oben
          gehört hin, wo man ist (das Produkt); unten, von wem es stammt. Die
          Reihenfolge umzudrehen hiesse, die Marke über die Orientierung zu
          stellen.

          `mt-auto` schiebt den Block an das untere Ende, sobald die
          Navigation kürzer ist als die Leiste — ohne feste Höhenannahme.
        */}
        <div className="mt-auto border-t border-border p-4">
          <KitConsultingMarke />
          <p className="mt-2 text-xs text-muted-foreground">{t('app.marke.urheberHinweis')}</p>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <AuthStatusHeader />
        <main id="hauptinhalt" tabIndex={-1} ref={hauptinhaltRef} className="flex-1 overflow-y-auto p-6">
          <RouteAnnouncer hauptinhaltRef={hauptinhaltRef} />
          <Brotkrumen />
          <Routes>
            <Route
              path="/"
              element={
                <RouteBoundary>
                  <DashboardPage />
                </RouteBoundary>
              }
            />
            <Route
              path="/verwaltung/systemstatus"
              element={
                <RouteBoundary>
                  <HealthStatusPanel />
                </RouteBoundary>
              }
            />
            {[...stammdatenRoutes, ...nachweisRoutes, ...nutzerinfoRoutes].map((route) => (
              <Route key={route.path} path={route.path} element={<RouteBoundary>{route.element}</RouteBoundary>} />
            ))}
            <Route
              path="*"
              element={
                <RouteBoundary>
                  <NotFoundPage />
                </RouteBoundary>
              }
            />
          </Routes>
        </main>
      </div>
    </div>
  );
}
