import { lazy } from 'react';
import type { StammdatenRouteDef } from './routeDef';

// Route-Level Code-Splitting (`.claude/rules/frontend-react.md`: „Suspense +
// lazy für Route-Split"). Import zeigt bewusst direkt auf die Seiten-Datei,
// nicht auf den `pages/endkunde`-Barrel — sonst läge der gesamte Barrel-Inhalt
// in einem einzigen Chunk.
const EndkundenListePage = lazy(() => import('../pages/endkunde/EndkundenListePage'));
const EndkundeAnlegenPage = lazy(() => import('../pages/endkunde/EndkundeAnlegenPage'));
const EndkundeDetailPage = lazy(() => import('../pages/endkunde/EndkundeDetailPage'));
const EndkundeAendernPage = lazy(() => import('../pages/endkunde/EndkundeAendernPage'));

/**
 * Routen der Endkunde-Referenz-Entität (ADR-0008 §23 / D11). Dies ist die
 * VORLAGE: eine neue Entität (System, Zähler, …) legt eine analoge
 * `<entität>Routes.tsx` an und wird in `routes/index.ts` mit EINER
 * zusätzlichen Zeile eingehängt — diese Datei selbst bleibt unangetastet.
 */
export const endkundeRoutes: readonly StammdatenRouteDef[] = [
  { path: '/stammdaten/endkunden', element: <EndkundenListePage /> },
  { path: '/stammdaten/endkunden/neu', element: <EndkundeAnlegenPage /> },
  { path: '/stammdaten/endkunden/:endkundeId', element: <EndkundeDetailPage /> },
  // Feature-Pass B: EIGENE Route für PII-Bearbeitung (anders als
  // System/Zähler/Messkanal, deren Ändern-Formular inline im Detail lebt,
  // react-router v6 rankt `:endkundeId/aendern` unabhängig von der
  // Deklarationsreihenfolge korrekt vor `:endkundeId`).
  { path: '/stammdaten/endkunden/:endkundeId/aendern', element: <EndkundeAendernPage /> },
];
