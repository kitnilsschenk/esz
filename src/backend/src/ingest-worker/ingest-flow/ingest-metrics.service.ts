import { Injectable } from '@nestjs/common';
import type { IngestReasonCode } from './reason-code';

/**
 * ADR-0005 §26.4 (SEC-6, "Metrik-Hygiene fuer den Worker-Vorwaerts-Lookup")
 * — AUSSCHLIESSLICH aggregierte, globale Zaehler. KEINE Geraete-/
 * Blind-Index-/Zaehler-ID-Kardinalitaet als Label (kein `blindIndex`/
 * `zaehlerId` als Metrik-Dimension) — das wuerde eine Kardinalitaets-/
 * Re-Identifikations-Flaeche ueber die Metrik-Pipeline oeffnen.
 *
 * Phase-4-Hinweis (Auslieferungsbericht): echte Metrik-Backend-Anbindung
 * (z. B. `prom-client`, MIT-lizenziert, whitelist-konform) ist NICHT Teil
 * dieses Pakets — bewusst ein einfacher In-Prozess-Zaehler, exponierbar via
 * `snapshot()` fuer Tests/zukuenftige `/metrics`-Anbindung.
 */
@Injectable()
export class IngestMetricsService {
  private lookupErfolgTotal = 0;
  private lookupDevEuiUnbekanntTotal = 0;
  private readonly quarantaeneTotalByGrund = new Map<IngestReasonCode, number>();
  private messwertGeschriebenTotal = 0;
  // ADR-0012 E5/Stufe C, A12-14: Der Verwurf mangels Rechtsgrundlage
  // schreibt NIRGENDS eine Zeile (A12-13 — keine Quarantaene, kein
  // Audit-Event) und muss trotzdem zaehlbar bleiben, sonst ist ein stiller
  // Totalausfall des Gates nicht von "niemand hat eingewilligt" zu
  // unterscheiden. EIN aggregierter Zaehler genuegt dafuer (keine
  // Grund-Aufschluesselung noetig — es gibt bislang nur einen Grund).
  private consentVerworfenTotal = 0;

  lookupErfolg(): void {
    this.lookupErfolgTotal += 1;
  }

  lookupDevEuiUnbekannt(): void {
    this.lookupDevEuiUnbekanntTotal += 1;
  }

  quarantaene(grund: IngestReasonCode): void {
    this.quarantaeneTotalByGrund.set(grund, (this.quarantaeneTotalByGrund.get(grund) ?? 0) + 1);
  }

  messwertGeschrieben(): void {
    this.messwertGeschriebenTotal += 1;
  }

  consentVerworfen(): void {
    this.consentVerworfenTotal += 1;
  }

  snapshot(): {
    readonly ingestLookupErfolgTotal: number;
    readonly ingestLookupDevEuiUnbekanntTotal: number;
    readonly ingestQuarantaeneTotalByGrund: ReadonlyMap<IngestReasonCode, number>;
    readonly ingestMesswertGeschriebenTotal: number;
    readonly ingestConsentVerworfenTotal: number;
  } {
    return {
      ingestLookupErfolgTotal: this.lookupErfolgTotal,
      ingestLookupDevEuiUnbekanntTotal: this.lookupDevEuiUnbekanntTotal,
      ingestQuarantaeneTotalByGrund: new Map(this.quarantaeneTotalByGrund),
      ingestMesswertGeschriebenTotal: this.messwertGeschriebenTotal,
      ingestConsentVerworfenTotal: this.consentVerworfenTotal,
    };
  }
}
