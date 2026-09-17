import { lazy } from 'react';
import type { StammdatenRouteDef } from './routeDef';

// Route-Level Code-Splitting (analog `endkundeRoutes.tsx`, Referenz-Muster).
const SystemeListePage = lazy(() => import('../pages/system/SystemeListePage'));
const SystemAnlegenPage = lazy(() => import('../pages/system/SystemAnlegenPage'));
const SystemDetailPage = lazy(() => import('../pages/system/SystemDetailPage'));

/** Routen der System-Entität (ADR-0008 §23 / D11 Pass 1). */
export const systemRoutes: readonly StammdatenRouteDef[] = [
  { path: '/stammdaten/systeme', element: <SystemeListePage /> },
  { path: '/stammdaten/systeme/neu', element: <SystemAnlegenPage /> },
  { path: '/stammdaten/systeme/:systemId', element: <SystemDetailPage /> },
];
