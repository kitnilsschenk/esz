// Named Re-Exports für Tests/Storybook-artige Nutzung. `routes/endkundeRoutes.tsx`
// importiert bewusst NICHT über diesen Barrel, sondern direkt je Seiten-Datei
// (`lazy(() => import('../pages/endkunde/…Page'))`) — Route-Level-Code-Splitting
// braucht einen eigenen Chunk pro Seite; ein Barrel-Import würde das unterlaufen.
export { EndkundenListePage } from './EndkundenListePage';
export { EndkundeDetailPage } from './EndkundeDetailPage';
export { EndkundeAnlegenPage } from './EndkundeAnlegenPage';
export { EndkundeAendernPage } from './EndkundeAendernPage';
