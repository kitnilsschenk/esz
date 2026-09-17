import { Injectable } from '@nestjs/common';
import type { ActiveBlindIndexPepper, BlindIndexPepperPort } from './blind-index-pepper.port';

const PEPPER_VERSION = 1;
const MIN_PEPPER_BYTES = 32;
const ENV_KEY = 'EDMS_DEV_BLIND_INDEX_PEPPER';

function isHexString(value: string): boolean {
  return value.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(value);
}

/**
 * ADR-0005 §26.3 (D14, O4 Vorgabe-Punkt 2) — Dev-Adapter für
 * `BlindIndexPepperPort`, analog `LocalDevKmsAdapter`. Liest einen fixen
 * Dev-only-Pepper aus `EDMS_DEV_BLIND_INDEX_PEPPER` (Hex-kodiert, ≥ 32 Byte
 * nach Dekodierung) — **niemals im Repo** (RL-3/A3/DS-10-Regel).
 *
 * Fail-closed (Studio-Konvention, s. `AuthConfigService`/`LocalDevKmsAdapter`):
 * wirft bereits BEIM KONSTRUIEREN (DI-Instanziierung = Startup-Self-Check),
 * wenn der Pepper fehlt, kein gültiger Hex-String ist oder < 32 Byte (256
 * bit) ergibt — kein stiller Nulldefault, harter Fehlstart. Fehlermeldungen
 * enthalten NIEMALS den Pepper-Wert selbst (RL-3).
 *
 * `version = 1` (konstant) — dieser Codestand kennt genau einen aktiven
 * Dev-Pepper; Rotation (mehrere Versionen) ist ein späterer Ausbauschritt
 * (s. Scope-Hinweis in `blind-index-pepper.port.ts`).
 */
@Injectable()
export class LocalDevPepperAdapter implements BlindIndexPepperPort {
  private readonly pepper: Buffer;

  constructor() {
    this.pepper = LocalDevPepperAdapter.loadPepper();
  }

  getActivePepper = (): Promise<ActiveBlindIndexPepper> =>
    Promise.resolve({ pepper: this.pepper, version: PEPPER_VERSION });

  private static loadPepper(): Buffer {
    const raw = process.env[ENV_KEY];
    if (raw === undefined || raw.length === 0) {
      throw new Error(
        `${ENV_KEY} ist nicht gesetzt — Dev-Blind-Index-Pepper fehlt (ADR-0005 §26.3, RL-3: Pepper NUR aus ` +
          'KMS/Vault/ENV, NIE im Repo). Fail-closed: harter Fehlstart statt Nulldefault.',
      );
    }

    if (!isHexString(raw)) {
      throw new Error(
        `${ENV_KEY} ist kein gueltiger Hex-String (gerade Anzahl Hex-Zeichen 0-9/a-f erwartet) — fail-closed ` +
          '(ADR-0005 §26.3).',
      );
    }

    const decoded = Buffer.from(raw, 'hex');
    if (decoded.length < MIN_PEPPER_BYTES) {
      throw new Error(
        `${ENV_KEY} muss mindestens ${MIN_PEPPER_BYTES} Byte (256 bit, RL-3) nach Hex-Dekodierung ergeben ` +
          `(erhalten: ${decoded.length} Byte) — fail-closed.`,
      );
    }

    return decoded;
  }
}
