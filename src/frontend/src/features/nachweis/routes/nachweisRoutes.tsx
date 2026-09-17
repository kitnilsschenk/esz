import { lazy } from 'react';
import type { StammdatenRouteDef } from '../../stammdaten/routes';

// Route-Level Code-Splitting (Muster `stammdaten/routes/*Routes.tsx`).
const FoerderjahrListePage = lazy(() => import('../pages/FoerderjahrListePage'));
const FoerderjahrAnlegenPage = lazy(() => import('../pages/FoerderjahrAnlegenPage'));
const FoerderjahrDetailPage = lazy(() => import('../pages/FoerderjahrDetailPage'));
const PreflightDetailPage = lazy(() => import('../pages/PreflightDetailPage'));
const EinsparlaufListePage = lazy(() => import('../pages/EinsparlaufListePage'));
const EinsparlaufAnlegenPage = lazy(() => import('../pages/EinsparlaufAnlegenPage'));
const EinsparlaufDetailPage = lazy(() => import('../pages/EinsparlaufDetailPage'));
const NachweisExportDetailPage = lazy(() => import('../pages/NachweisExportDetailPage'));
const EinreichungDetailPage = lazy(() => import('../pages/EinreichungDetailPage'));

/**
 * Routen des Nachweis-Kontexts (ADR-0007 Teil B/C).
 *
 * Der Zuschnitt bildet die Kette ab, in der die Artefakte entstehen:
 * Förderjahr → Vollständigkeitsprüfung → Einspar-Lauf → Export → Einreichung.
 * Drei Eigenheiten, die daraus folgen:
 *
 * 1. **„Einspar-Lauf starten" liegt UNTER der Prüfung**
 *    (`/nachweis/preflights/:preflightId/einsparlauf-neu`), nicht neben der
 *    Lauf-Liste. Nur so stehen Förderjahr UND Prüfergebnis fest, wenn das
 *    Formular entscheidet, ob ein Förderjahr-Nachweis überhaupt zur Wahl
 *    steht.
 * 2. **Export und Einreichung haben keine Listen-Route.** Die API bietet
 *    keine — und das ist kein Versehen: Ein Export ist ein Vorgang, kein
 *    abgelegtes Dokument; er wird bei jedem Abruf neu erzeugt. Erreichbar
 *    sind beide über den Vorgang, aus dem sie hervorgehen (Einspar-Lauf →
 *    Export → Einreichung) und über ihre Adresse.
 * 3. **Kein Ändern, kein Löschen.** Alle Ressourcen sind append-only; eine
 *    Korrektur ist immer ein neuer Vorgang, der den alten ablöst.
 *
 * Das Format `StammdatenRouteDef` (`{ path, element }`) wird wiederverwendet
 * statt ein zweites, gleich aussehendes zu erfinden — `AppShell` hüllt beide
 * Listen mit derselben Schleife in ihre Route-Boundary.
 */
export const nachweisRoutes: readonly StammdatenRouteDef[] = [
  { path: '/nachweis/foerderjahre', element: <FoerderjahrListePage /> },
  { path: '/nachweis/foerderjahre/neu', element: <FoerderjahrAnlegenPage /> },
  { path: '/nachweis/foerderjahre/:foerderjahrId', element: <FoerderjahrDetailPage /> },
  { path: '/nachweis/preflights/:preflightId', element: <PreflightDetailPage /> },
  { path: '/nachweis/preflights/:preflightId/einsparlauf-neu', element: <EinsparlaufAnlegenPage /> },
  { path: '/nachweis/einsparlaeufe', element: <EinsparlaufListePage /> },
  { path: '/nachweis/einsparlaeufe/:einsparlaufId', element: <EinsparlaufDetailPage /> },
  { path: '/nachweis/exporte/:exportId', element: <NachweisExportDetailPage /> },
  { path: '/nachweis/einreichungen/:einreichungId', element: <EinreichungDetailPage /> },
];
