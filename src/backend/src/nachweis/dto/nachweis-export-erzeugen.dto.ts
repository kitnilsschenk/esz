import { IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

const ZWECK_WERTE = ['nachweis', 'erfolgskontrolle', 'wissenschaftliche_auswertung'] as const;
const STATION_DARSTELLUNG_WERTE = ['pseudonymisiert', 'klarname'] as const;

/**
 * `POST /nachweis/einsparlaeufe/{id}/exporte` (`create:nachweis_export`,
 * ADR-0007 D5/D6/B10 — Teil C A13/A14/A21/A23). `einsparlaufId` kommt aus
 * dem Pfad (Muster `EinsparlaufAnlegenDto` für die analoge, bereits
 * etablierte Portfolio-Route), NICHT aus dem Body.
 *
 * **A23-Fail-closed (App-seitig VOR dem DB-CHECK geprüft, sprechende
 * Fehlermeldung statt roher `23514`-Exception):** `zweck=
 * 'wissenschaftliche_auswertung'` ist strukturell gesperrt
 * (`ck_export_zweck_wiss_auswertung_gesperrt`, V0025) — Empfänger/Rolle/
 * Rechtsgrundlage sind ungeklärt. `@IsIn(ZWECK_WERTE)` lässt den Wert aus
 * DTO-Sicht zu (damit die Fehlermeldung im Service, NICHT als generischer
 * 400 „ungültiger Enum-Wert" erscheint) — `NachweisExportService.erzeugen()`
 * weist ihn mit einem sprechenden `NachweisFehlerException` ab.
 *
 * **A13-Fail-closed:** `stationDarstellung='klarname'` verlangt
 * `anfrageRef` (aktenkundige Anforderung) — `@ValidateIf` erzwingt das
 * bereits an der DTO-Grenze (Backstop: DB-CHECK
 * `ck_export_station_klarname_anfrage`, V0025).
 *
 * **A21 (Zweitfreigabe für `stationDarstellung='klarname'` UND
 * `zweck='wissenschaftliche_auswertung'`) — NAHT, NICHT gebaut:** dieses DTO
 * nimmt beide Werte ENTGEGEN (kein Vier-Augen-Freigabe-Feld). Die
 * Zweitfreigabe ist eine Workflow-/Rollenfrage (Muster
 * `shred:endkunde:freigeben`, ADR-0009 §2.2), die eine EIGENE `PolicyAction`
 * bräuchte — das wäre spekulative, tote RBAC-Fläche, solange kein
 * Freigabe-Endpoint existiert (Muster `nachweis.module.ts`-Kommentar „keine
 * tote RBAC-Fläche ohne Implementierung"). `zweck='wissenschaftliche_
 * auswertung'` ist ohnehin DB-seitig gesperrt (A23) — für `stationDarstellung
 * ='klarname'` bleibt das Vier-Augen-Prinzip in v1 UNGESICHERT (nur RBAC
 * `@Roles('betrieb')`), s. finale Antwort „offene Punkte".
 */
export class NachweisExportErzeugenDto {
  @IsOptional()
  @IsIn(ZWECK_WERTE)
  zweck?: (typeof ZWECK_WERTE)[number];

  @IsOptional()
  @IsIn(STATION_DARSTELLUNG_WERTE)
  stationDarstellung?: (typeof STATION_DARSTELLUNG_WERTE)[number];

  @ValidateIf((o: NachweisExportErzeugenDto) => o.stationDarstellung === 'klarname')
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  anfrageRef?: string;
}
