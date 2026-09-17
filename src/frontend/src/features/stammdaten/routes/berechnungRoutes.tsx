import { lazy } from 'react';
import type { StammdatenRouteDef } from './routeDef';

// Route-Level Code-Splitting (analog `messkonzeptRoutes.tsx`).
const BerechnungUebersichtPage = lazy(() => import('../pages/berechnung/BerechnungUebersichtPage'));
const BerechnungslaufListePage = lazy(() => import('../pages/berechnung/BerechnungslaufListePage'));
const BerechnungslaufDetailPage = lazy(() => import('../pages/berechnung/BerechnungslaufDetailPage'));
const BerechnungslaufAnlegenPage = lazy(() => import('../pages/berechnung/BerechnungslaufAnlegenPage'));

/**
 * Routen der Berechnungslauf-Entität (ADR-0006 Betriebs-UI). DREI Routen:
 * - `/berechnung/laeufe` — globaler Einstiegspunkt („Baseline & Einsparung",
 *   `BerechnungUebersichtPage`): lässt einen Endkunden wählen (bei genau
 *   einem automatisch) und zeigt darunter dieselbe `BerechnungslaufTabelle`
 *   wie die Unterressourcen-Route. Nachgereicht, weil ein Nav-Eintrag dieses
 *   Namens sonst kein Ziel hätte — Läufe sind serverseitig ausschließlich
 *   Unterressource EINES Endkunden. Die Endkunden-Auswahl ist dabei NICHT
 *   nachgebaut, sondern die bestehende `EndkundenTabelle` (dieselbe Lösung
 *   wie bei `standortRoutes.tsx`).
 * - `/stammdaten/endkunden/:endkundeId/berechnungen` und `/…/:laufId` —
 *   Unterressourcen-Routen EINES Endkunden, unverändert und weiterhin Ziel
 *   des Links aus `EndkundeDetailAnsicht`.
 *
 * KEIN Anlegen/Ändern — v1 der Betriebs-UI zeigt Läufe ausschließlich an
 * (sie entstehen serverseitig).
 */
export const berechnungRoutes: readonly StammdatenRouteDef[] = [
  { path: '/berechnung/laeufe', element: <BerechnungUebersichtPage /> },
  { path: '/stammdaten/endkunden/:endkundeId/berechnungen', element: <BerechnungslaufListePage /> },
  // `/neu` VOR `/:laufId` — sonst faengt der Parameter den festen Pfad ab
  // und die Detailseite suchte einen Lauf mit der Kennung "neu".
  { path: '/stammdaten/endkunden/:endkundeId/berechnungen/neu', element: <BerechnungslaufAnlegenPage /> },
  { path: '/stammdaten/endkunden/:endkundeId/berechnungen/:laufId', element: <BerechnungslaufDetailPage /> },
];
