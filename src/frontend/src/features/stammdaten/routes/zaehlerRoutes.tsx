import { lazy } from 'react';
import type { StammdatenRouteDef } from './routeDef';

// Route-Level Code-Splitting (analog `systemRoutes.tsx`).
const ZaehlerListePage = lazy(() => import('../pages/zaehler/ZaehlerListePage'));
const ZaehlerAnlegenPage = lazy(() => import('../pages/zaehler/ZaehlerAnlegenPage'));
const ZaehlerDetailPage = lazy(() => import('../pages/zaehler/ZaehlerDetailPage'));

/** Routen der Zähler-Entität (ADR-0008 §23 / D11 Pass 1). */
export const zaehlerRoutes: readonly StammdatenRouteDef[] = [
  { path: '/stammdaten/zaehler', element: <ZaehlerListePage /> },
  { path: '/stammdaten/zaehler/neu', element: <ZaehlerAnlegenPage /> },
  { path: '/stammdaten/zaehler/:zaehlerId', element: <ZaehlerDetailPage /> },
];
