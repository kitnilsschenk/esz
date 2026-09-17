import { hkdfSync } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { BLIND_INDEX_PEPPER_PORT } from '../../common/crypto/blind-index-pepper.port';
import type { BlindIndexPepperPort } from '../../common/crypto/blind-index-pepper.port';
import { berechneCodeIndex } from './portal-zugangscode.util';

/** Zweck-Kennzeichnung der Ableitung — MUSS stabil bleiben, sonst sind alle bestehenden Indizes wertlos. */
const HKDF_INFO = 'edms:portal:zugangscode:v1';
const ABGELEITETE_LAENGE = 32;

/**
 * Berechnet den Suchwert zu einem Zugangscode — mit einem eigenen, aus dem
 * System-Pepper ABGELEITETEN Schlüssel.
 *
 * **Warum nicht direkt der Pepper.** Derselbe Schlüssel für zwei Zwecke ist
 * eine der klassischen Krypto-Fallen: Wer irgendwann einen DevEUI-Blind-Index
 * und einen Portal-Code-Index nebeneinander hat, kann sie vergleichen, und
 * eine Schwäche in einem Verfahren wird zur Schwäche im anderen. HKDF
 * (RFC 5869, in `node:crypto` enthalten) trennt die beiden Zwecke sauber —
 * aus EINEM verwalteten Geheimnis, ohne ein zweites, das jemand rotieren,
 * verteilen und vergessen müsste.
 *
 * **Warum überhaupt der vorhandene Pepper.** Er hat bereits einen Port mit
 * Dev-Adapter und die verbindliche RL-3-Behandlung (≥ 256 bit, nur aus
 * KMS/Vault/ENV, nie geloggt, umgebungsgetrennt). Ein zweites Geheimnis
 * daneben hätte dieselben Anforderungen und dieselbe Betriebslast — für
 * nichts.
 */
@Injectable()
export class PortalCodeIndexService {
  constructor(@Inject(BLIND_INDEX_PEPPER_PORT) private readonly pepperPort: BlindIndexPepperPort) {}

  async berechne(code: string): Promise<Buffer> {
    const { pepper } = await this.pepperPort.getActivePepper();
    // Kein Salt: Der Index muss deterministisch sein, sonst könnte der
    // Einlöse-Pfad die Zeile nicht finden (s. `berechneCodeIndex`-Doc).
    const abgeleitet = Buffer.from(hkdfSync('sha256', pepper, Buffer.alloc(0), HKDF_INFO, ABGELEITETE_LAENGE));
    return berechneCodeIndex(code, abgeleitet);
  }
}
