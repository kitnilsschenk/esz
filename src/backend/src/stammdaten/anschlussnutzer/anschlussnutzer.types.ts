import type { EinschraenkungGrundCode } from '../../nachweis/domain/paar-einschraenkung';
import type { VerarbeitungsStatus } from '../persistence/energy/energy-endkunde.repository';

export interface AnschlussnutzerListItem {
  readonly id: string;
  readonly endkundeId: string;
  readonly verarbeitungsStatus: VerarbeitungsStatus;
  readonly createdAt: string;
}

export interface AnschlussnutzerPiiResponse {
  readonly name: string;
  readonly kontakt: string | null;
}

/**
 * `einschraenkungGrundCode`/`gesperrtSeit` (ADR-0007 A11.4/A11.6) — dieselben
 * Grenzen wie bei `EndkundeDetail`: sichtbar fuer `betrieb` UND
 * `compliance-auditor`, NICHT ueber `PiiProjektionsPolicy` gefuehrt, NICHT im
 * Listen-Item, kein Filter/Sort. Nach aussen verlaesst nur der neutrale
 * Sammelcode `datenschutzrechtliche_einschraenkung` das System.
 */
export interface AnschlussnutzerDetail {
  readonly id: string;
  readonly endkundeId: string;
  readonly verarbeitungsStatus: VerarbeitungsStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly einschraenkungGrundCode: EinschraenkungGrundCode | null;
  readonly gesperrtSeit: string | null;
  /**
   * Auflage C-8 — die am Sperrvorgang festgehaltene Entscheidung ueber die
   * WEITERE ERHEBUNG. `null` heisst „Frage stellt sich nicht" (lit. a/lit. c)
   * oder „keine Einschraenkung"; NICHT „entschieden, nicht weiterzuerheben".
   * Die Sichtbarkeit folgt `einschraenkungGrundCode` (s. dortiger Kommentar):
   * wer den Grund sehen darf, muss auch sehen, was daraus folgt — sonst steht
   * im Betrieb eine Sperre ohne erkennbare Wirkung auf die Messung.
   */
  readonly neuerhebungFortsetzen: boolean | null;
  readonly stammdatenPii: AnschlussnutzerPiiResponse | null;
}
