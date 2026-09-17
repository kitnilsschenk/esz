import { Injectable } from '@nestjs/common';
import { SyntheticOnlyConfigService } from '../../stammdaten/synthetic/synthetic-only.config';

export const INGEST_BROKER_MODES = ['synthetic', 'real'] as const;
export type IngestBrokerMode = (typeof INGEST_BROKER_MODES)[number];

function isIngestBrokerMode(value: string): value is IngestBrokerMode {
  return (INGEST_BROKER_MODES as readonly string[]).includes(value);
}

function parseMode(raw: string | undefined): IngestBrokerMode {
  const value = raw ?? 'synthetic';
  if (!isIngestBrokerMode(value)) {
    throw new Error(
      `EDMS_INGEST_BROKER_MODE='${value}' ist ungueltig (erlaubt: ${INGEST_BROKER_MODES.join('|')}) — fail-closed ` +
        '(ADR-0005 §19, D7).',
    );
  }
  return value;
}

/**
 * ADR-0005 §19 (D7, A2) — worker-spezifischer Gate-Marker-Selbstcheck,
 * ANALOG `SyntheticOnlyConfigService` (ADR-0008 §22/D10), aber ein
 * EIGENSTÄNDIGER Umschaltpunkt: "reale Broker-Credentials/Topics" (dieser
 * Marker) ist eine ANDERE Handlung als "reale PII-Schreibpfade freischalten"
 * (`EDMS_SYNTHETIC_ONLY`) — beide bleiben UNABHÄNGIG gate-pflichtig, damit
 * ein versehentliches Freischalten des einen nicht implizit das andere
 * mitfreischaltet (ADR-0005 §19, "Verworfene Alternative").
 *
 * MUSS als ALLERERSTE Instanziierung im Worker-Bootstrap laufen — VOR
 * `mqttClient.connect()` und VOR dem DB-Connection-Pool-Aufbau
 * (`worker-main.ts`). Wirft bereits beim Konstruieren (Studio-Konvention,
 * s. `SyntheticOnlyConfigService`) — kein stiller Nulldefault, harter
 * Fehlstart.
 *
 * **TD-6 (Auflage) — 2×2-Validitätsmatrix (ADR-0005 §19):**
 *
 * | `EDMS_INGEST_BROKER_MODE` | `synthetic_only=true` | `synthetic_only=false` |
 * |---|---|---|
 * | `synthetic` | **gueltig** (v1-Standard) | fail-closed (Widerspruch) |
 * | `real` | fail-closed (Widerspruch, IMMER Konfigurationsfehler) | einzig gueltige Real-Kombination — in DIESEM Codestand dennoch NICHT unterstuetzt (kein Freigabe-Katalog/`EDMS_GATE_FREIGABE_REF` gebunden) |
 *
 * HINWEIS zur Erreichbarkeit: `SyntheticOnlyConfigService` selbst wirft
 * bereits beim eigenen Konstruieren, wenn `EDMS_SYNTHETIC_ONLY=false` (kein
 * Prod-`KeyManagementPort`/Gate-Marker-Store gebunden, ADR-0008 §22) — durch
 * die Konstruktor-Reihenfolge (dieser Service bekommt eine BEREITS
 * konstruierte `SyntheticOnlyConfigService`-Instanz injiziert) ist die
 * rechte Spalte der Matrix ("synthetic_only=false") in diesem Codestand
 * STRUKTURELL unerreichbar. Die vollstaendige Matrix-Pruefung bleibt
 * dennoch EXPLIZIT im Code (statt sich auf diesen Nebeneffekt zu verlassen)
 * — Verteidigung gegen eine kuenftige Lockerung von
 * `SyntheticOnlyConfigService`, die diese Klasse sonst stillschweigend
 * unterlaufen wuerde.
 */
@Injectable()
export class IngestBrokerModeConfig {
  readonly mode: IngestBrokerMode;

  constructor(private readonly syntheticOnlyConfig: SyntheticOnlyConfigService) {
    this.mode = parseMode(process.env['EDMS_INGEST_BROKER_MODE']);
    this.assertMatrix();
  }

  private assertMatrix(): void {
    const syntheticOnly = this.syntheticOnlyConfig.syntheticOnly;

    if (this.mode === 'synthetic' && syntheticOnly) {
      return; // v1-Standard — einzig gueltige, in diesem Codestand vollstaendig unterstuetzte Kombination.
    }

    if (this.mode === 'synthetic' && !syntheticOnly) {
      throw new Error(
        'EDMS_INGEST_BROKER_MODE=synthetic bei EDMS_SYNTHETIC_ONLY=false ist ein Konfigurationswiderspruch ' +
          '(ADR-0005 §19, TD-6 2x2-Matrix) — fail-closed.',
      );
    }

    if (this.mode === 'real' && syntheticOnly) {
      throw new Error(
        'EDMS_INGEST_BROKER_MODE=real erfordert EDMS_SYNTHETIC_ONLY=false (ADR-0005 §19, TD-6) — die Kombination ' +
          'real+synthetic_only=true ist IMMER ein Konfigurationsfehler — fail-closed.',
      );
    }

    // this.mode === 'real' && !syntheticOnly — die "einzig gueltige
    // Real-Kombination" der Matrix, aber in DIESEM Codestand NICHT
    // unterstuetzt: kein Freigabe-Katalog/`EDMS_GATE_FREIGABE_REF` gebunden
    // (ADR-0005 §19, analog ADR-0008 §22 offener Punkt C3). Fail-closed statt
    // stillem Fallback auf synthetic.
    throw new Error(
      'EDMS_INGEST_BROKER_MODE=real ist in diesem Codestand NICHT unterstuetzt (kein Freigabe-Katalog/' +
        'EDMS_GATE_FREIGABE_REF gebunden, ADR-0005 §19 D7) — fail-closed. Folgeauftrag: devops-lead ' +
        '(CI/CD-Deploy-Gate mit Pflicht-Referenz auf ein compliance-director-Freigabeartefakt).',
    );
  }
}
