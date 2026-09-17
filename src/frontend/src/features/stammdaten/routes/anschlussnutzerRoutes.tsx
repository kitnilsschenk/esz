import { lazy } from 'react';
import type { StammdatenRouteDef } from './routeDef';

// Route-Level Code-Splitting (analog `endkundeRoutes.tsx`, Referenz-Muster).
const AnschlussnutzerListePage = lazy(() => import('../pages/anschlussnutzer/AnschlussnutzerListePage'));
const AnschlussnutzerAnlegenPage = lazy(() => import('../pages/anschlussnutzer/AnschlussnutzerAnlegenPage'));
const AnschlussnutzerDetailPage = lazy(() => import('../pages/anschlussnutzer/AnschlussnutzerDetailPage'));

/** Routen der Anschlussnutzer-Entität (ADR-0008 §23 / D11 Phase 4c Pass 2, Muster = Endkunde). */
export const anschlussnutzerRoutes: readonly StammdatenRouteDef[] = [
  { path: '/stammdaten/anschlussnutzer', element: <AnschlussnutzerListePage /> },
  { path: '/stammdaten/anschlussnutzer/neu', element: <AnschlussnutzerAnlegenPage /> },
  { path: '/stammdaten/anschlussnutzer/:anschlussnutzerId', element: <AnschlussnutzerDetailPage /> },
];
