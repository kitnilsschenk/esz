import { createResourceQueryKeys } from '../shared';

// Query-Key-Factory der Einflussgrößen-Ressource (ADR-0006 Teil B, B8/B10,
// analog `berechnungKeys.ts`). `.liste({ systemId })` trägt zusätzlich die
// per-System-Klartext-Liste (`useEinflussgroesseListeFuerSystem` — bewusst
// KEIN `createListeQuery`-Fabrik-Aufruf, s. dortiger Kommentar), damit
// `createAnlegenMutation`/`createAendernMutation`s Standard-Invalidierung
// (`.listen()`) sie per TanStack-Präfix-Matching MIT trifft.
export const einflussgroesseKeys = createResourceQueryKeys('einflussgroesse');
