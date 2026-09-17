import { lazy } from 'react';
import type { StammdatenRouteDef } from './routeDef';

// Route-Level Code-Splitting (analog `systemRoutes.tsx`).
const MesskanalAnlegenPage = lazy(() => import('../pages/messkanal/MesskanalAnlegenPage'));
const MesskanalDetailPage = lazy(() => import('../pages/messkanal/MesskanalDetailPage'));

/**
 * Routen der Messkanal-Entität (ADR-0008 §23 / D11 Pass 1). KEINE
 * Top-Level-Liste/Anlegen-Route ohne Zähler-Kontext — Messkanal-Anlegen ist
 * eine Sub-Ressourcen-Route unter `/stammdaten/zaehler/:zaehlerId/…`
 * (Backend-Controller `MesskanalUnterZaehlerController` hat keinen globalen
 * Index-Endpunkt).
 */
export const messkanalRoutes: readonly StammdatenRouteDef[] = [
  { path: '/stammdaten/zaehler/:zaehlerId/messkanaele/neu', element: <MesskanalAnlegenPage /> },
  { path: '/stammdaten/messkanaele/:messkanalId', element: <MesskanalDetailPage /> },
];
