import { lazy } from 'react';
import type { StammdatenRouteDef } from './routeDef';

// Route-Level Code-Splitting (analog `messkanalRoutes.tsx`).
const MesskonzeptVersionAnlegenPage = lazy(() => import('../pages/messkonzept/MesskonzeptVersionAnlegenPage'));
const MesskonzeptVersionDetailPage = lazy(() => import('../pages/messkonzept/MesskonzeptVersionDetailPage'));

/**
 * Routen der Messkonzept-Entität (ADR-0008 §23 / D11 Phase 4c Pass 2,
 * append-only Sub-Ressource EINES Endkunden). KEINE eigene Top-Level-Liste —
 * die Versionen-Liste ist in `EndkundeDetailAnsicht` eingebettet (analog
 * Messkanal/Zähler, Pass 1).
 */
export const messkonzeptRoutes: readonly StammdatenRouteDef[] = [
  { path: '/stammdaten/endkunden/:endkundeId/messkonzept/versionen/neu', element: <MesskonzeptVersionAnlegenPage /> },
  {
    path: '/stammdaten/endkunden/:endkundeId/messkonzept/versionen/:versionNr',
    element: <MesskonzeptVersionDetailPage />,
  },
];
