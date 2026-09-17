// Gezielt exportierte, fachlich benannte Typen aus den generierten
// OpenAPI-Rohtypen (`./generated/auth`, ADR-0002 Teil B). Die generated/-
// Rohtypen selbst werden bewusst NICHT pauschal re-exportiert (siehe
// `index.ts` und die analoge Health-Konvention in `types.ts`).

import type { components } from './generated/auth';

export type AccessTokenResponse = components['schemas']['AccessTokenResponse'];
export type SessionInfo = components['schemas']['SessionInfo'];
export type AuthActorTyp = SessionInfo['actorTyp'];
export type AuthRole = SessionInfo['roles'][number];
