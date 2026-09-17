import { createResourceQueryKeys } from '../shared';

// Query-Key-Factory der Anschlussnutzer-Ressource (analog `endkundeKeys.ts`).
// Derselbe Ressourcen-Name (`'anschlussnutzer'`) wie der frühere, schmale
// Pass-1-Baustein `nutzungsverhaeltnis/anschlussnutzerReferenzApi.ts` — der
// jetzt entfällt (Duplikat-Vermeidung, siehe `hooks/nutzungsverhaeltnis/
// useNutzungsverhaeltnisAnlegenView.ts`).
export const anschlussnutzerKeys = createResourceQueryKeys('anschlussnutzer');
