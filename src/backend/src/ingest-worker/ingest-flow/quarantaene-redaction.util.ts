import { createHash } from 'node:crypto';
import type { ChirpStackUplinkEnvelope } from './envelope.types';

/**
 * ADR-0005 §25 (SEC-1) — feldbasierte Redaction: nur fuer Reason-Codes
 * AUSSER `envelope_parse_fehler` verwendet (dort existiert bereits ein
 * geparstes Objekt, s. `envelope-parser.util.ts`). Ersetzt AUSSCHLIESSLICH
 * `deviceInfo.devEui` — der Rest der Nutzlast (inkl. `data`, dem
 * Messwert-Payload) bleibt fuer die Fehlerdiagnose erhalten (RL-2, ADR-0005
 * §25: "der redigierte (DevEUI-freie) Rest-Payload fuer Fehlerdiagnose").
 */
export function redigiereEnvelopeFuerQuarantaene(envelope: ChirpStackUplinkEnvelope): Record<string, unknown> {
  return {
    deviceInfo: { devEuiRedigiert: true },
    fPort: envelope.fPort,
    data: envelope.data,
    ...(envelope.time !== undefined ? { time: envelope.time } : {}),
    ...(envelope.rxInfo !== undefined ? { rxInfo: envelope.rxInfo } : {}),
    ...(envelope.fCnt !== undefined ? { fCnt: envelope.fCnt } : {}),
  };
}

/**
 * ADR-0005 §25 (SEC-1, Sonderfall `envelope_parse_fehler`) — SHA-256 der
 * ROHEN Bytes, fuer "gleiche fehlerhafte Quelle wiedererkennen" OHNE
 * jeglichen Payload-Inhalt zu persistieren.
 */
export function hashRohpayload(payload: Buffer): Buffer {
  return createHash('sha256').update(payload).digest();
}
