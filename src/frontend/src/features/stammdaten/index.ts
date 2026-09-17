// Öffentliche API des Stammdaten-Feature-Slices (Betriebs-UI, ADR-0008 §23 /
// D11, Phase 4c). `app/AppShell.tsx` importiert AUSSCHLIESSLICH von hier —
// nie aus `features/stammdaten/<entität>/…` direkt.
export { stammdatenRoutes } from './routes';
export type { StammdatenRouteDef } from './routes';
