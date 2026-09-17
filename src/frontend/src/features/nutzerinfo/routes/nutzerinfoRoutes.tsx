import { lazy } from 'react';
import type { StammdatenRouteDef } from '../../stammdaten/routes';

// Route-Level Code-Splitting (Muster `stammdaten/routes/*Routes.tsx`).
const NutzerinfoLaufPage = lazy(() => import('../pages/NutzerinfoLaufPage'));

/**
 * Routen der monatlichen Nutzerinformation (TB-06).
 *
 * Nur EINE Route, und das ist Absicht: Der Verlauf einer Person gehoert an
 * die Person, nicht in eine eigene globale Liste. Er ist deshalb ein
 * Abschnitt der Endkunden-Detailseite — eine globale Liste ueber
 * Pseudonym-IDs waere ohnehin nicht durchsuchbar.
 */
export const nutzerinfoRoutes: readonly StammdatenRouteDef[] = [
  { path: '/nutzerinfo/laeufe', element: <NutzerinfoLaufPage /> },
];
