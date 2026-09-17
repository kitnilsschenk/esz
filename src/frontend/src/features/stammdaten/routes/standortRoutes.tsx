import { lazy } from 'react';
import type { StammdatenRouteDef } from './routeDef';

// Route-Level Code-Splitting (analog `messkonzeptRoutes.tsx`).
const StandortUebersichtPage = lazy(() => import('../pages/standort/StandortUebersichtPage'));
const StandortBaumPage = lazy(() => import('../pages/standort/StandortBaumPage'));

/**
 * Routen der Standort-/Gebäudestruktur-Entität (ADR-0010 + Auffindbarkeits-
 * Nachtrag). ZWEI Routen:
 * - `/stammdaten/standorte` — globaler Einstiegspunkt (`StandortUebersichtPage`,
 *   NEU): lässt einen Endkunden wählen (bei genau einem automatisch), zeigt
 *   darunter dieselbe `StandortBaumAnsicht` wie die Sub-Ressourcen-Route.
 * - `/stammdaten/endkunden/:endkundeId/standorte` — Sub-Ressourcen-Route
 *   EINES bestimmten Endkunden (`StandortBaumPage`, unverändert, weiterhin
 *   Deep-Link-Ziel aus `EndkundeDetailAnsicht`s „Standorte anzeigen"-Link).
 *
 * Innerhalb BEIDER Routen ist der Baum die zentrale Navigationsfläche — JEDE
 * schreibende Aktion (Anlegen/Ändern/Verschieben/Stilllegen/Löschen/Zähler-
 * Verortung) läuft inline im Aktions-Panel des ausgewählten Knotens
 * (`StandortKnotenAktionen`) statt über eigene Unterrouten (anders als
 * z. B. Messkanal/Messkonzept).
 */
export const standortRoutes: readonly StammdatenRouteDef[] = [
  { path: '/stammdaten/standorte', element: <StandortUebersichtPage /> },
  { path: '/stammdaten/endkunden/:endkundeId/standorte', element: <StandortBaumPage /> },
];
