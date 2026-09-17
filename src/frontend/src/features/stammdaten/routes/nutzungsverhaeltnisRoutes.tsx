import { lazy } from 'react';
import type { StammdatenRouteDef } from './routeDef';

// Route-Level Code-Splitting (analog `systemRoutes.tsx`).
const NutzungsverhaeltnisseListePage = lazy(() => import('../pages/nutzungsverhaeltnis/NutzungsverhaeltnisseListePage'));
const NutzungsverhaeltnisAnlegenPage = lazy(() => import('../pages/nutzungsverhaeltnis/NutzungsverhaeltnisAnlegenPage'));
const NutzungsverhaeltnisDetailPage = lazy(() => import('../pages/nutzungsverhaeltnis/NutzungsverhaeltnisDetailPage'));

/** Routen der Nutzungsverhältnis-Entität (ADR-0008 §23 / D11 Pass 1). */
export const nutzungsverhaeltnisRoutes: readonly StammdatenRouteDef[] = [
  { path: '/stammdaten/nutzungsverhaeltnisse', element: <NutzungsverhaeltnisseListePage /> },
  { path: '/stammdaten/nutzungsverhaeltnisse/neu', element: <NutzungsverhaeltnisAnlegenPage /> },
  { path: '/stammdaten/nutzungsverhaeltnisse/:nutzungsverhaeltnisId', element: <NutzungsverhaeltnisDetailPage /> },
];
