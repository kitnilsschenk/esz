import { Injectable } from '@nestjs/common';

export const EDMS_ENV_CLASSES = ['dev', 'staging', 'prod'] as const;
export type EdmsEnvClass = (typeof EDMS_ENV_CLASSES)[number];

function isEdmsEnvClass(value: string): value is EdmsEnvClass {
  return (EDMS_ENV_CLASSES as readonly string[]).includes(value);
}

function parseEnvClass(raw: string | undefined): EdmsEnvClass {
  const value = raw ?? 'dev';
  if (!isEdmsEnvClass(value)) {
    throw new Error(
      `EDMS_ENV_CLASS='${value}' ist ungueltig (erlaubt: ${EDMS_ENV_CLASSES.join('|')}) — fail-closed (ADR-0008 §22).`,
    );
  }
  return value;
}

function parseSyntheticOnlyFlag(raw: string | undefined): boolean {
  if (raw === undefined) {
    return true; // Default TRUE (ADR-0008 §22).
  }
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  throw new Error(`EDMS_SYNTHETIC_ONLY='${raw}' ist ungueltig (erlaubt: 'true'|'false') — fail-closed (ADR-0008 §22).`);
}

/**
 * ADR-0008 §22 (D10) — `EDMS_ENV_CLASS` ist die WAHRHEITSQUELLE des
 * Startup-Self-Checks (statt mehrerer Heuristik-Signale, `security-lead`-
 * Votum 12). Zusammen mit `EDMS_SYNTHETIC_ONLY` (Default `true`) erzwingt
 * diese Klasse beim Konstruieren (Studio-Konvention, s. `AuthConfigService`)
 * fail-closed:
 *
 *   - `EDMS_SYNTHETIC_ONLY=true` ⇒ `EDMS_ENV_CLASS` MUSS ≠ `prod` sein (der
 *     `LocalDevKmsAdapter` ist in diesem Codestand der EINZIGE gebundene
 *     `KeyManagementPort`-Adapter — die Bedingung "Dev-KMS aktiv" ist damit
 *     strukturell erfüllt, solange kein Prod-Adapter existiert).
 *   - `EDMS_SYNTHETIC_ONLY=false` ⇒ in DIESEM Codestand NICHT unterstützt
 *     (kein Prod-`KeyManagementPort`, kein geschützter Gate-Marker-
 *     Config-Store, ADR-0008 §22/§29 OP C3 — Folgeauftrag `devops-lead`) —
 *     fail-closed Fehlstart. Das Umschalten auf Real-PII-Betrieb bleibt der
 *     dokumentierte, gate-pflichtige Punkt (F6-Bedingung 5, §0).
 */
@Injectable()
export class SyntheticOnlyConfigService {
  readonly envClass: EdmsEnvClass;
  readonly syntheticOnly: boolean;

  constructor() {
    this.envClass = parseEnvClass(process.env['EDMS_ENV_CLASS']);
    this.syntheticOnly = parseSyntheticOnlyFlag(process.env['EDMS_SYNTHETIC_ONLY']);
    this.assertStartupInvariants();
  }

  private assertStartupInvariants(): void {
    if (this.syntheticOnly) {
      if (this.envClass === 'prod') {
        throw new Error(
          'EDMS_SYNTHETIC_ONLY=true, aber EDMS_ENV_CLASS=prod — fail-closed (ADR-0008 §22: synthetic-only darf ' +
            'nicht gegen eine Prod-Umgebung laufen).',
        );
      }
      return;
    }

    throw new Error(
      'EDMS_SYNTHETIC_ONLY=false ist in diesem Codestand nicht unterstuetzt (kein Prod-KeyManagementPort, kein ' +
        'geschuetzter Gate-Marker-Config-Store gebunden) — fail-closed (ADR-0008 §22, offener Punkt C3, ' +
        'Folgeauftrag devops-lead: CI/CD-Deploy-Gate mit Pflicht-Referenz auf compliance-director-Freigabeartefakt).',
    );
  }
}
