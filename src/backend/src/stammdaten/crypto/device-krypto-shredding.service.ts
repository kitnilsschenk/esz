import { Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { DeviceSchluesselRepository } from '../persistence/device/device-schluessel.repository';
import { DeviceGeraetZuordnungRepository } from '../persistence/device/device-geraet-zuordnung.repository';
import type { SecurityContext } from '../../common/security/security-context';
import { STAMMDATEN_EVENT_CODES } from '../audit/stammdaten-audit-events';

export interface DeviceShreddingErgebnis {
  readonly geraetZuordnungId: string;
  readonly cryptoKeyId: string;
  readonly geschreddert: boolean;
}

export interface DeviceShredInput {
  readonly cryptoKeyId: string;
  /** Pseudonym-Referenz (kein FK) — NUR fuer den Audit-Kontext, RL-2. */
  readonly zaehlerId: string;
  /** Verkettung mit dem uebergeordneten Vier-Augen-Antrag (ADR-0009, V0015). */
  readonly antragId: string;
  /**
   * Der Akteur, der die Endkunden-Shred-Freigabe erteilt hat
   * (`ShredAntragService.freigebenInTx`) — dieselbe Vier-Augen-Kontrollspur
   * traegt beide Ereignisse (`endkunde.stammdaten.geschreddert` UND
   * `geraet_zuordnung.stammdaten.geschreddert`, V0015-Kommentar).
   */
  readonly subject: SecurityContext;
}

/**
 * ADR-0005 §26.5 (D14, O4 Vorgabe-Punkt 5) — Krypto-Shredding (Art. 17
 * DSGVO) fuer die GERAETE-Dimension, PARALLEL zur bestehenden
 * `KryptoShreddingService` (die ausschliesslich `identity.subjekt_schluessel`
 * kennt) — operiert NUR auf `device.*` (Namensraum-Trennung, V0002 rote
 * Linie 5). IDEMPOTENT, in EINER Transaktion je Zuordnung (Aufrufer haelt
 * die umgebende `@Transactional(Propagation.Nested)`-Klammer offen,
 * `EndkundeService.shredInTx`):
 *
 *   1. DEK in `device.schluessel` vernichten (`markGeschreddert`).
 *   2. `device.geraet_zuordnung` `status`→`geschreddert` + `gueltig_bis`
 *      (falls noch NULL) + `deveui_blind_index`→NULL (GB-C) IN DERSELBEN
 *      Operation (`markGeschreddertByCryptoKeyId`, D-KANON).
 *   3. Manuelles `AuditService.append('geraet_zuordnung.stammdaten.
 *      geschreddert')` — Ordering WIE ADR-0009 (`endkunde.stammdaten.
 *      geschreddert`, `ShredAntragService`): innerhalb der Shred-Tx, KEIN
 *      `@AuditAction`-Decorator (dieser Pfad hat keine eigene HTTP-Route —
 *      er ist ein begleitender Schritt von `EndkundeService.shred()`,
 *      selbst wiederum innerhalb der `ShredAntragService.freigebenInTx()`-
 *      Vier-Augen-Transaktion).
 *
 * Kontext EXAKT `{ synthetic, zaehler_id, antrag_id }` (V0015-Whitelist,
 * `erlaubte_kontext_keys` von `geraet_zuordnung.stammdaten.geschreddert`) —
 * KEIN DevEUI-Klartext/`deveui_blind_index` im Kontext (RL-2).
 *
 * RL-4 (Design-Prinzip 4, ADR-0005 §11/§26.4): kein eigenstaendiger
 * Device-Shred-Trigger ausserhalb dieser Vier-Augen-gegateten
 * Orchestrierung — diese Klasse wird AUSSCHLIESSLICH von
 * `EndkundeService.shredInTx()` aufgerufen, NIE direkt von einer eigenen
 * HTTP-Route.
 */
@Injectable()
export class DeviceKryptoShreddingService {
  constructor(
    private readonly deviceSchluesselRepository: DeviceSchluesselRepository,
    private readonly geraetZuordnungRepository: DeviceGeraetZuordnungRepository,
    private readonly auditService: AuditService,
  ) {}

  async shred(input: DeviceShredInput): Promise<DeviceShreddingErgebnis> {
    const schluessel = await this.deviceSchluesselRepository.markGeschreddert(input.cryptoKeyId);
    if (schluessel === undefined) {
      throw new Error(
        `DeviceKryptoShreddingService.shred(): kein device.schluessel mit id=${input.cryptoKeyId} gefunden.`,
      );
    }

    const zuordnung = await this.geraetZuordnungRepository.markGeschreddertByCryptoKeyId(input.cryptoKeyId);
    if (zuordnung === undefined) {
      throw new Error(
        `DeviceKryptoShreddingService.shred(): keine device.geraet_zuordnung mit crypto_key_id=${input.cryptoKeyId} gefunden.`,
      );
    }

    await this.auditService.append({
      eventTyp: STAMMDATEN_EVENT_CODES.GERAET_ZUORDNUNG_GESCHREDDERT,
      actorTyp: input.subject.actorTyp,
      actorSub: input.subject.sub,
      ergebnis: 'ok',
      objektRef: zuordnung.id,
      ...(input.subject.roles.length > 0 ? { actorRolle: input.subject.roles.join(',') } : {}),
      kontext: { synthetic: true, zaehler_id: input.zaehlerId, antrag_id: input.antragId },
    });

    return {
      geraetZuordnungId: zuordnung.id,
      cryptoKeyId: input.cryptoKeyId,
      geschreddert: schluessel.keyState === 'geschreddert' && zuordnung.status === 'geschreddert',
    };
  }
}
