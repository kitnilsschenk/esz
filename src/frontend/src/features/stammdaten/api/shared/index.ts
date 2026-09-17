// Öffentliche Oberfläche der geteilten Stammdaten-API-Bausteine
// (Hook-Fabriken + Query-Key-Fabrik). Jede Stammdaten-Entität importiert NUR
// aus diesem Modul — niemals aus `@tanstack/react-query` direkt in ihrer
// eigenen `api/<entität>/`-Schicht (Konsistenz der Query-Konventionen).

export { createResourceQueryKeys } from './resourceQueryKeys';
export type { ResourceQueryKeys, ListenFilter } from './resourceQueryKeys';
export type { CursorSeiteResponse, CursorParams } from './cursorTypes';
export { createListeQuery } from './createListeQuery';
export type { ListeQueryConfig, ListeQueryResult, ListeQueryOptions } from './createListeQuery';
export { createDetailQuery } from './createDetailQuery';
export type { DetailQueryConfig, DetailQueryOptions } from './createDetailQuery';
export { createAnlegenMutation } from './createAnlegenMutation';
export type { AnlegenMutationConfig } from './createAnlegenMutation';
export { createAendernMutation } from './createAendernMutation';
export type { AendernMutationConfig, AendernMutationVariables } from './createAendernMutation';
export { createStilllegenMutation } from './createStilllegenMutation';
export type { StilllegenMutationConfig } from './createStilllegenMutation';
export { createIdempotencyKey } from './idempotencyKey';
