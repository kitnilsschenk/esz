import type { EinschraenkungGrundCode } from '../../nachweis/domain/paar-einschraenkung';
import type { ConsentStatus, VerarbeitungsStatus } from '../persistence/energy/energy-endkunde.repository';

/** `components/schemas/EndkundeListItem` — PII-FREI (Linie 2). */
export interface EndkundeListItem {
  readonly id: string;
  readonly verarbeitungsStatus: VerarbeitungsStatus;
  readonly consentStatus: ConsentStatus;
  readonly vonWissAuswertungAusgenommen: boolean;
  /** Endkundengruppe/Branche fuer den LK-Nachweis (V0074). */
  readonly endkundengruppe: string | null;
  readonly createdAt: string;
}

/** `components/schemas/EndkundePii` — pii=true, NUR im Detail, projektions-maskiert (D6). */
export interface EndkundePiiResponse {
  readonly name: string;
  readonly anschrift: string;
  readonly kontakt: string | null;
}

/**
 * `components/schemas/EndkundeDetail`.
 *
 * `einschraenkungGrundCode`/`gesperrtSeit` (ADR-0007 A11.4, C8-Folgeauftrag):
 * sichtbar fuer `betrieb` UND `compliance-auditor`.
 *
 * - `betrieb` SETZT die Sperre und kennt den Grund ohnehin — ihn zu
 *   verbergen waere keine Datenminimierung, sondern die Ursache fuer blindes
 *   Ueberschreiben und fehlende Fristenkontrolle (1a/1d sind BEFRISTET).
 * - `compliance-auditor` prueft, ob die Preflight-Einstufung (FJ-07b vs.
 *   FJ-07c) zum dokumentierten Grund passt — ohne Sicht auf den Grund ist
 *   genau die eine Kontrolle nicht auditierbar, fuer die die Rolle existiert.
 *
 * BEWUSST NICHT ueber `PiiProjektionsPolicy` gefuehrt: die liefert `false`
 * fuer `compliance-auditor` UND `false` fuer jeden nicht-`aktiv`-Status. Der
 * Grund existiert per `ck_endkunde_einschraenkung_kohaerenz` (V0024) aber
 * AUSSCHLIESSLICH bei `gesperrt` — ueber diese Policy gefuehrt waere er also
 * nie sichtbar, genau dann nicht, wenn es ihn gibt. Sachlich passt sie
 * ebenfalls nicht: sie schuetzt entschluesselten Klartext-PII, der Grund ist
 * laut V0024-Spaltenkommentar `pii=false` und ein geschlossener Code.
 *
 * GRENZEN (A11.4, verbindlich): nur hier im Detail, NIE in
 * `EndkundeListItem`; KEIN Filter-, Sort- oder Query-Parameter darauf (sonst
 * wird aus einem Zustandsfeld eine abfragbare Betroffenenrechts-Kartei);
 * nach aussen — Nutzerinformation, Mehrwertdienste, jeder Export — gilt
 * unveraendert nur der neutrale Sammelcode
 * `datenschutzrechtliche_einschraenkung` (ADR-0007 C4 Punkt 6).
 */
export interface EndkundeDetail {
  readonly id: string;
  readonly verarbeitungsStatus: VerarbeitungsStatus;
  readonly consentStatus: ConsentStatus;
  readonly consentTextVersion: string | null;
  readonly vonWissAuswertungAusgenommen: boolean;
  /** Endkundengruppe/Branche fuer den LK-Nachweis (V0074). */
  readonly endkundengruppe: string | null;
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
  readonly stammdatenPii: EndkundePiiResponse | null;
}

/**
 * `components/schemas/ShreddingErgebnis`. `standortPiiNeutralisiert`
 * (ADR-0010 D4, neue Shred-Dimension "Standort-PII" analog ADR-0005 §26
 * GB-C) — Anzahl der in DIESEM Aufruf neutralisierten
 * `identity.standort_pii`-Zeilen (Reichweiten-Nachweis). Der Endkunden-DEK
 * (== Standort-DEK, D4/A2) wird ohnehin nur EINMAL vernichtet
 * (`KryptoShreddingService.shred()`) — dieses Feld belegt zusätzlich, WIE
 * VIELE Standort-PII-Zeilen davon betroffen waren. `0` bei einem
 * idempotenten Wiederholungsaufruf (bereits geschreddert, keine erneute
 * Neutralisierung nötig) — NICHT die historische Gesamtzahl.
 */
export interface ShreddingErgebnis {
  readonly id: string;
  readonly verarbeitungsStatus: VerarbeitungsStatus;
  readonly geschreddert: boolean;
  readonly standortPiiNeutralisiert: number;
  /**
   * P5b (dsgvo-auditor, ADR-0006 Phase 5, Auflage A7) — Ausweis der
   * Nachweis-gebundenen Bestände, die den Shred **bewusst überleben**
   * (Art. 17(3)(b), BAFA-Nachweispflicht): Anzahl der pseudonymen
   * `analytics.berechnungslauf`-Zeilen bzw. `einfluss.intervall`-Zeilen des
   * Endkunden, die NICHT gelöscht werden. Ohne diesen Ausweis behauptete der
   * Report eine Vollständigkeit, die nicht besteht. Diese Zahlen spiegeln den
   * Bestand zum Shred-Zeitpunkt (auch beim idempotenten Wiederholungsaufruf —
   * die Bestände bleiben ja bestehen).
   */
  readonly analyticsLaeufeUnveraendert: number;
  readonly einflussIntervalleUnveraendert: number;
}
