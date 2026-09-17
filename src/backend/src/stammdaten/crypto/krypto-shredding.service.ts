import { Injectable } from '@nestjs/common';
import { IdentitySubjektSchluesselRepository } from '../persistence/identity/identity-subjekt-schluessel.repository';

export interface KryptoShreddingErgebnis {
  readonly subjektSchluesselId: string;
  readonly geschreddert: boolean;
}

/**
 * ADR-0008 §19 (D7) — Krypto-Shredding (Art. 17 DSGVO): vernichtet den
 * per-Subjekt-DEK (`identity.subjekt_schluessel.key_state='geschreddert'`,
 * `wrapped_dek` überschrieben) → ALLE mit diesem DEK verschlüsselten
 * Chiffrate werden unwiederbringlich (Un-Wrap ist danach strukturell
 * unmöglich, unabhängig vom `KeyManagementPort`-Adapter). IDEMPOTENT.
 *
 * Diese Klasse kennt NUR `identity.subjekt_schluessel` (Namensraum-Trennung,
 * Linie 5) — die begleitenden Schritte "PII-Zeile neutralisieren" und
 * "`energy.endkunde.verarbeitungs_status='geloescht'`" orchestriert der
 * jeweilige Fach-Service (`EndkundeService.shred()`), NICHT diese Klasse
 * (Ports & Adapters, Single Responsibility).
 *
 * Residualrisiko (dokumentiert, ADR-0008 §19 Review-Nachtrag,
 * `security-lead`-Votum 10, §29 OP C1): ein Restore eines
 * Pre-Shredding-Backups stellt `wrapped_dek` wieder her — die Art.-17-
 * Garantie ist über Backups unterlaufbar. NICHT v1-blockierend
 * (synthetic-only), Folgeauftrag `retention-engineer`/`storage-engineer`/
 * `compliance-director` (Backup-Retention ↔ Master-Key-Rotation ↔
 * Shredding-Nachlauf).
 */
@Injectable()
export class KryptoShreddingService {
  constructor(private readonly subjektSchluesselRepository: IdentitySubjektSchluesselRepository) {}

  async shred(subjektSchluesselId: string): Promise<KryptoShreddingErgebnis> {
    const result = await this.subjektSchluesselRepository.markGeschreddert(subjektSchluesselId);

    if (result === undefined) {
      throw new Error(
        `KryptoShreddingService.shred(): kein identity.subjekt_schluessel mit id=${subjektSchluesselId} gefunden.`,
      );
    }

    return { subjektSchluesselId: result.id, geschreddert: result.keyState === 'geschreddert' };
  }
}
