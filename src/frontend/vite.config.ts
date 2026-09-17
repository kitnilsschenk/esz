// EDMS Frontend — Vite-Konfiguration (Walking Skeleton, ADR-0001 §10.7 / AP5).
//
// Bundle-Budget initial ≤ 250 KB gz (.claude/rules/frontend-react.md) — der
// Walking-Skeleton-Scope (React, TanStack Query, openapi-fetch) hält dieses
// Budget bewusst ein; Route-Split/`lazy` folgt, sobald mehr als eine Route
// existiert.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import license from 'rollup-plugin-license';

export default defineConfig({
  // `@tailwindcss/vite` (Phase 4c-Feinschliff, visuelle Schicht): scannt über
  // Vites Modulgraph, welche Dateien tatsächlich Tailwind-Klassen enthalten
  // — kein `content: [...]`-Glob nötig (Tailwind v4, CSS-first Config, siehe
  // `src/globals.css`). Reihenfolge vor `react()` ist bei Tailwind v4 ohne
  // Belang (kein JSX-Transform-Overlap).
  plugins: [tailwindcss(), react()],
  // .env liegt im Repo-Root (siehe .env.example), nicht im Paket.
  envDir: '../..',
  server: {
    /**
     * EIGENER Port statt des Vite-Standards 5173.
     *
     * 5173 ist der Default JEDES Vite-Projekts — auf einer Maschine mit
     * mehreren davon gewinnt der, der zuerst startet, und die anderen
     * weichen still auf 5174, 5175 aus. Bei EDMS bricht das den Login:
     * Die OIDC-Redirect-URI steht fest im Keycloak-Realm, und eine
     * Anmeldung von einem anderen Port wird abgewiesen.
     *
     * Schlimmer war die Variante, die tatsaechlich auftrat: Ein zweites
     * Projekt belegte `[::1]:5173`, EDMS `127.0.0.1:5173` — beide liefen,
     * und welches der Browser unter `localhost` erwischte, entschied seine
     * Adressauflösung. Die Betriebs-UI zeigte dann ohne Fehlermeldung eine
     * fremde Anwendung.
     *
     * `strictPort` gehoert dazu: Ein stilles Ausweichen auf einen freien
     * Port waere genau der Zustand, den dieser Eintrag verhindern soll.
     */
    port: 5180,
    strictPort: true,
    // Dev-Proxy statt Backend-CORS: Das Backend bleibt CORS-geschlossen
    // (deny-by-default); der Browser spricht same-origin mit Vite, Vite
    // reicht an NestJS durch. Dafür VITE_API_BASE_URL leer lassen.
    proxy: {
      '/health': {
        // Backend-Ziel per ENV übersteuerbar (lokale Ports sind auf
        // Entwickler-Maschinen oft belegt — PORT des Backends beachten).
        target: process.env['EDMS_BACKEND_URL'] ?? 'http://localhost:3000',
        changeOrigin: true,
      },
      '/auth': {
        // Auth-BFF-Endpunkte (ADR-0002 Teil B, `GET /auth/login|callback`,
        // `POST /auth/refresh|logout`, `GET /auth/session`). Gleiches Ziel
        // wie `/health` — SPA und Backend bleiben same-origin (kein
        // Backend-CORS nötig, Cookies gehen ohne Cross-Site-Zusatzaufwand mit).
        target: process.env['EDMS_BACKEND_URL'] ?? 'http://localhost:3000',
        changeOrigin: true,
      },
      '/stammdaten': {
        // Stammdaten-Betriebs-UI (ADR-0008 Teil B, Phase 4c). Gleiches Ziel
        // wie `/health`/`/auth` — Bearer-geschützt (JwtAuthGuard), same-origin.
        target: process.env['EDMS_BACKEND_URL'] ?? 'http://localhost:3000',
        changeOrigin: true,
        // Deep-Link-Fix: Die SPA-Routen (react-router) teilen sich das Präfix
        // `/stammdaten` mit den proxied API-Pfaden. Eine Volllast-Navigation /
        // Refresh (Accept: text/html) darf NICHT ans Backend proxen (liefert
        // sonst API-JSON/401 statt der App) — stattdessen index.html ausliefern,
        // react-router übernimmt anhand von window.location. Echte API-Fetches
        // (Accept: application/json/*) laufen unverändert ans Backend.
        bypass: (req) =>
          req.headers.accept?.includes('text/html') ? '/index.html' : undefined,
      },
      '/monitoring': {
        // DE-02-Vollständigkeits-Monitoring (ADR-0008 §23 / D11).
        target: process.env['EDMS_BACKEND_URL'] ?? 'http://localhost:3000',
        changeOrigin: true,
        // Deep-Link-Fix wie bei `/stammdaten` (SPA-Route `/monitoring/*`).
        bypass: (req) =>
          req.headers.accept?.includes('text/html') ? '/index.html' : undefined,
      },
      '/berechnung': {
        // Berechnungslauf-API (`schemas/openapi/berechnung.openapi.yaml`).
        // FEHLTE bisher: Die Berechnungslauf-Ansichten riefen im Dev-Server
        // `/berechnung/...` auf, das nie ans Backend ging — Vite lieferte die
        // SPA aus, und die Liste blieb leer, ohne dass irgendwo ein Fehler
        // sichtbar wurde.
        target: process.env['EDMS_BACKEND_URL'] ?? 'http://localhost:3000',
        changeOrigin: true,
        // Deep-Link-Fix wie bei `/stammdaten`: Seit der globalen Übersicht
        // gibt es die SPA-Route `/berechnung/laeufe` — und zugleich den
        // API-Pfad `/berechnung/laeufe/{laufId}`. Beide unterscheiden sich nur
        // im `Accept`-Header, genau daran trennt der Bypass sie.
        bypass: (req) =>
          req.headers.accept?.includes('text/html') ? '/index.html' : undefined,
      },
      '/nachweis': {
        // Nachweis-API (`schemas/openapi/nachweis.openapi.yaml`, ADR-0007).
        target: process.env['EDMS_BACKEND_URL'] ?? 'http://localhost:3000',
        changeOrigin: true,
        // Deep-Link-Fix wie bei `/stammdaten` — die SPA-Routen
        // (`/nachweis/foerderjahre`, `/nachweis/einsparlaeufe`, …) tragen
        // dieselben Pfade wie die API.
        bypass: (req) =>
          req.headers.accept?.includes('text/html') ? '/index.html' : undefined,
      },
      '/consent': {
        // Einwilligungsverwaltung (`schemas/openapi/consent.openapi.yaml`,
        // ADR-0012). Reine API-Routen — die Betriebssicht ist in die
        // Endkunden-/Anschlussnutzer-Detailseite eingebettet und hat keinen
        // eigenen SPA-Pfad, daher OHNE Deep-Link-`bypass`.
        target: process.env['EDMS_BACKEND_URL'] ?? 'http://localhost:3000',
        changeOrigin: true,
      },
      '/nutzerinfo': {
        // Monatliche Nutzerinformation (TB-06,
        // `schemas/openapi/nutzerinfo.openapi.yaml`). MIT Deep-Link-`bypass`:
        // `/nutzerinfo/laeufe` ist zugleich eine SPA-Route.
        target: process.env['EDMS_BACKEND_URL'] ?? 'http://localhost:3000',
        changeOrigin: true,
        bypass: (req) =>
          req.headers.accept?.includes('text/html') ? '/index.html' : undefined,
      },
      '/geraeteerkennung': {
        // Geraete- und Anlagengruppen (TB-05,
        // `schemas/openapi/geraeteerkennung.openapi.yaml`). Reine API-Routen —
        // die Betriebssicht sitzt an Endkunde, Messkanal und System.
        target: process.env['EDMS_BACKEND_URL'] ?? 'http://localhost:3000',
        changeOrigin: true,
      },
      '/portal': {
        // Nutzerportal (`schemas/openapi/portal.openapi.yaml`). Der
        // Endkunden-Bereich ist zugleich SPA-Route UND API-Praefix — und
        // beides unter demselben Wort. Der Deep-Link-`bypass` trennt sie am
        // `Accept`-Header, genau wie bei `/stammdaten`.
        //
        // Ohne diesen Eintrag liefe die Anmeldung ins Leere: Vite lieferte
        // auf `POST /portal/auth/anmeldung` die SPA aus, und der Kunde saehe
        // eine Fehlermeldung ohne Ursache.
        target: process.env['EDMS_BACKEND_URL'] ?? 'http://localhost:3000',
        changeOrigin: true,
        bypass: (req) =>
          req.headers.accept?.includes('text/html') ? '/index.html' : undefined,
      },
      '/messwerte': {
        // Verbrauchs-/Messwert-API (`schemas/openapi/messwerte.openapi.yaml`)
        // — reine API-Routen, kein eigener SPA-Pfad unter `/messwerte/*`
        // (die Verbrauchsanzeige ist in die Standort-Baum-Route eingebettet),
        // daher OHNE Deep-Link-`bypass` wie bei `/stammdaten`/`/monitoring`.
        target: process.env['EDMS_BACKEND_URL'] ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      plugins: [
        // License-Gate Stufe 2 (ADR-0001 §10.3): Manifest aller tatsächlich
        // ins Bundle gelangten Pakete. Der CI-Job `license-gate` konsumiert
        // dist/oss-licenses.json (Pfad relativ zum Paket-cwd) und prüft es
        // gegen die Whitelist aus .claude/rules/dependencies.md.
        license({
          thirdParty: {
            includePrivate: false,
            output: {
              file: 'dist/oss-licenses.json',
              template(dependencies) {
                return JSON.stringify(
                  dependencies.map((d) => ({
                    name: d.name,
                    version: d.version,
                    license: d.license,
                  })),
                  null,
                  2,
                );
              },
            },
          },
        }),
      ],
    },
  },
});
