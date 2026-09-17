import type { ReactNode } from 'react';

/** Minimaler, framework-neutraler Routen-Eintrag (Pfad + Element). */
export interface StammdatenRouteDef {
  readonly path: string;
  readonly element: ReactNode;
}
