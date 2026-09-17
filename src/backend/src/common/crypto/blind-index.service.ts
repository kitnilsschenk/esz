import { Inject, Injectable } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { BLIND_INDEX_PEPPER_PORT } from './blind-index-pepper.port';
import type { BlindIndexPepperPort } from './blind-index-pepper.port';

const DEVEUI_HEX_LENGTH = 16; // 16 Hex-Zeichen = 8 Byte (IEEE EUI-64).
const NORMALISIERUNGS_TRENNZEICHEN = /[:\-\s]/g;
const HEX_ZEICHEN = /^[0-9A-F]+$/;

export interface BlindIndexErgebnis {
  readonly blindIndex: Buffer;
  readonly pepperVersion: number;
}

/**
 * ADR-0005 §26.3 (D14, O4 Vorgabe-Punkt 2) — berechnet den
 * `deveui_blind_index := HMAC-SHA256(pepper, normalisierte_DevEUI_bytes)`
 * für den O(1)-Lookup DevEUI → `device.geraet_zuordnung`, OHNE die DevEUI
 * (die nicht-deterministisch envelope-verschlüsselt in `deveui_enc` liegt)
 * linear entschlüsseln zu müssen.
 *
 * **Normalisierung (kanonische Form, MUSS identisch in Worker-Lookup UND
 * Provisioning-Pfad verwendet werden — sonst Lookup-Miss, ADR-0005 §26.3):**
 * Großbuchstaben, Trennzeichen (`:`, `-`, Whitespace) entfernt, danach exakt
 * 16 Hex-Zeichen (= 8 Byte, IEEE EUI-64) — sonst wird die Eingabe als
 * ungültig abgelehnt.
 *
 * **HMAC-Eingabe:** die 8 **rohen** Bytes der dekodierten DevEUI (NICHT die
 * UTF-8-Bytes der 16-Zeichen-Hex-Zeichenkette) — s. Auslieferungsbericht
 * `backend-lead` für die Begründung dieser Wahl; MUSS bei einer künftigen
 * Worker-/Provisioning-Implementierung identisch übernommen werden.
 *
 * **RL-2 (rote Linie, verbindlich):** diese Klasse loggt NIEMALS `devEui`
 * oder `blindIndex` — auch Fehlermeldungen enthalten KEINE Klartext-DevEUI
 * (nur das Faktum "ungültiges Format").
 */
@Injectable()
export class BlindIndexService {
  constructor(@Inject(BLIND_INDEX_PEPPER_PORT) private readonly pepperPort: BlindIndexPepperPort) {}

  async berechne(devEui: string): Promise<BlindIndexErgebnis> {
    const normalisiert = this.normalisiere(devEui);
    const { pepper, version } = await this.pepperPort.getActivePepper();

    const blindIndex = createHmac('sha256', pepper).update(Buffer.from(normalisiert, 'hex')).digest();

    return { blindIndex, pepperVersion: version };
  }

  private normalisiere(devEui: string): string {
    const bereinigt = devEui.toUpperCase().replace(NORMALISIERUNGS_TRENNZEICHEN, '');

    if (bereinigt.length !== DEVEUI_HEX_LENGTH || !HEX_ZEICHEN.test(bereinigt)) {
      // RL-2: KEINE Klartext-DevEUI in der Fehlermeldung — nur das Faktum.
      throw new Error(
        `BlindIndexService.berechne(): devEui hat kein gueltiges Format (erwartet: ${String(DEVEUI_HEX_LENGTH)} ` +
          'Hex-Zeichen / 8 Byte nach Entfernen von \':\'/\'-\'/Whitespace-Trennzeichen).',
      );
    }

    return bereinigt;
  }
}
