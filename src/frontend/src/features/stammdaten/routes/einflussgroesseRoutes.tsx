import { lazy } from 'react';
import type { StammdatenRouteDef } from './routeDef';

// Route-Level Code-Splitting (analog `systemRoutes.tsx`).
const EinflussgroesseListePage = lazy(() => import('../pages/einflussgroesse/EinflussgroesseListePage'));
const EinflussgroesseErfassenPage = lazy(() => import('../pages/einflussgroesse/EinflussgroesseErfassenPage'));
const EinflussgroesseKorrigierenPage = lazy(() => import('../pages/einflussgroesse/EinflussgroesseKorrigierenPage'));

/**
 * Routen der Einflussgrößen-Entität (ADR-0006 Teil B, B8/B10 — Sub-Ressource
 * EINES Systems, RL-B1). KEINE eigene Top-Level-Liste (analog Messkanal/
 * Messkonzept) — erreichbar über die CTA-Sektion auf der System-Detailseite
 * (`SystemDetailAnsicht`, rollen-gegatet). Die TB-03-Befunde-Route
 * (`.../endkunden/{endkundeId}/einflussgroessen/befunde`) ist NICHT Teil
 * dieses Passes (v1 immer leer, Schwellwert-Erkennung fehlt).
 */
export const einflussgroesseRoutes: readonly StammdatenRouteDef[] = [
  { path: '/stammdaten/systeme/:systemId/einflussgroessen', element: <EinflussgroesseListePage /> },
  { path: '/stammdaten/systeme/:systemId/einflussgroessen/neu', element: <EinflussgroesseErfassenPage /> },
  {
    path: '/stammdaten/systeme/:systemId/einflussgroessen/:einflussgroesseId/korrigieren',
    element: <EinflussgroesseKorrigierenPage />,
  },
];
