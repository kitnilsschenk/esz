// Gezielt exportierte, fachlich benannte Typen aus den generierten
// OpenAPI-Rohtypen (`./generated/health`). Die generated/-Rohtypen selbst
// werden bewusst NICHT pauschal re-exportiert (siehe `index.ts`).

import type { components } from './generated/health';

export type LivenessStatus = components['schemas']['LivenessStatus'];
export type ReadinessStatus = components['schemas']['ReadinessStatus'];
export type DependencyCheck = components['schemas']['DependencyCheck'];
