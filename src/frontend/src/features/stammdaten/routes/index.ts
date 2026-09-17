import type { StammdatenRouteDef } from './routeDef';
import { endkundeRoutes } from './endkundeRoutes';
import { systemRoutes } from './systemRoutes';
import { zaehlerRoutes } from './zaehlerRoutes';
import { messkanalRoutes } from './messkanalRoutes';
import { nutzungsverhaeltnisRoutes } from './nutzungsverhaeltnisRoutes';
import { anschlussnutzerRoutes } from './anschlussnutzerRoutes';
import { messkonzeptRoutes } from './messkonzeptRoutes';
import { monitoringRoutes } from './monitoringRoutes';
import { standortRoutes } from './standortRoutes';
import { berechnungRoutes } from './berechnungRoutes';
import { einflussgroesseRoutes } from './einflussgroesseRoutes';

export type { StammdatenRouteDef } from './routeDef';

// Aggregiert die Routen ALLER Stammdaten-Entitäten. Eine neue Entität
// (System, Zähler, Messkanal, Messkonzept, Anschlussnutzer,
// Nutzungsverhältnis, Monitoring) ergänzt hier GENAU ZWEI Zeilen — einen
// Import + einen Spread-Eintrag im Array unten — sonst bleibt diese Datei
// unverändert (konfliktarme Erweiterung bei paralleler Arbeit, ADR-0008 §23 / D11).
export const stammdatenRoutes: readonly StammdatenRouteDef[] = [
  ...endkundeRoutes,
  ...systemRoutes,
  ...zaehlerRoutes,
  ...messkanalRoutes,
  ...nutzungsverhaeltnisRoutes,
  ...anschlussnutzerRoutes,
  ...messkonzeptRoutes,
  ...monitoringRoutes,
  ...standortRoutes,
  ...berechnungRoutes,
  ...einflussgroesseRoutes,
];
