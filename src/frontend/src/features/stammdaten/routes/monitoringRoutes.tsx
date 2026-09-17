import { lazy } from 'react';
import type { StammdatenRouteDef } from './routeDef';

// Route-Level Code-Splitting (analog `endkundeRoutes.tsx`).
const VollstaendigkeitDashboardPage = lazy(() => import('../pages/monitoring/VollstaendigkeitDashboardPage'));
const EinschraenkungFristenPage = lazy(() => import('../pages/monitoring/EinschraenkungFristenPage'));
const Art19PflichtenPage = lazy(() => import('../pages/monitoring/Art19PflichtenPage'));
const IngestBetriebPage = lazy(() => import('../pages/ingestBetrieb/IngestBetriebPage'));

/**
 * Monitoring-Routen (ADR-0008 §23 / D11 Phase 4c Pass 2). Beide Pfade
 * spiegeln ihren Backend-Controller-Pfad 1:1 — bewusst KEIN
 * `/stammdaten`-Präfix, da es sich fachlich nicht um Stammdaten-Objekte,
 * sondern um Querschnitts-Reports handelt.
 *
 * - `/monitoring/vollstaendigkeit` — DE-02, fehlende Stammdaten je Endkunde.
 * - `/monitoring/ingest` — Betriebssicht der Messdaten-Aufnahme (ADR-0011
 *   A2): kommt etwas an, und was bleibt liegen? Dieselbe ABAC-Aktion
 *   `read:monitoring`, derselbe Rollenschnitt.
 */
export const monitoringRoutes: readonly StammdatenRouteDef[] = [
  { path: '/monitoring/vollstaendigkeit', element: <VollstaendigkeitDashboardPage /> },
  // ADR-0007 A11.11 — Wiedervorlage der befristeten Art.-18-Einschraenkungen.
  // Eigene Route, nicht Teil des Vollstaendigkeits-Dashboards: dort geht es um
  // Messdaten-Luecken, hier um Betroffenenrechts-Vorgaenge.
  { path: '/monitoring/einschraenkung-fristen', element: <EinschraenkungFristenPage /> },
  // ADR-0007 A18/A11.12 — Mitteilungspflichten nach Art. 19 gegenueber dem
  // Empfaenger einer bereits erfolgten Einreichung.
  { path: '/monitoring/art19-pflichten', element: <Art19PflichtenPage /> },
  { path: '/monitoring/ingest', element: <IngestBetriebPage /> },
];
