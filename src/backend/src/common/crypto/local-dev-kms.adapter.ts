import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { GeneratedDataKey, KeyManagementPort, WrappedDekRef } from './key-management.port';

const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;
const DEK_LENGTH = 32;
const ALG_VERSION = 1;

/**
 * ADR-0008 §19 (D7/F3) — Dev-KMS-Adapter: datei-/env-basierter Keystore, NUR
 * für `EDMS_SYNTHETIC_ONLY=true`-Betrieb gegen synthetische Daten (F6-
 * Bedingung 4, rote Linie 5). Der Dev-Master-Key (32 Byte) wird aus
 * `EDMS_DEV_KMS_MASTER_KEY` (Base64) geladen — NIE im Repo, NIE hartkodiert.
 *
 * `kms_key_id = 'dev-local:v1'` — trägt eine Dev-Kennung, damit ein Chiffrat
 * seinen Ursprung deklariert und ein versehentlicher Prod-Un-Wrap-Versuch
 * (`unwrapDek()` gegen einen fremden `kms_key_id`) erkennbar/fail-closed ist.
 *
 * Fail-closed (Studio-Konvention, s. `AuthConfigService`): wirft bereits BEIM
 * KONSTRUIEREN (DI-Instanziierung = Startup-Self-Check), wenn der Master-Key
 * fehlt/ungültig ist — kein stiller Nulldefault, harter Fehlstart.
 *
 * Krypto = Node-built-in `crypto` (AES-256-GCM) — KEINE neue Dependency
 * (ADR-0008 §19/§27).
 */
@Injectable()
export class LocalDevKmsAdapter implements KeyManagementPort {
  static readonly KMS_KEY_ID = 'dev-local:v1';
  private static readonly WRAP_AAD = Buffer.from('edms-dev-kms-dek-wrap-v1', 'utf8');

  private readonly masterKey: Buffer;

  constructor() {
    this.masterKey = LocalDevKmsAdapter.loadMasterKey();
  }

  generateDataKey = async (): Promise<GeneratedDataKey> => {
    const dek = randomBytes(DEK_LENGTH);
    const wrappedDek = this.wrap(dek);
    return Promise.resolve({
      dek,
      wrappedDek,
      kmsKeyId: LocalDevKmsAdapter.KMS_KEY_ID,
      algVersion: ALG_VERSION,
    });
  };

  unwrapDek = async (ref: WrappedDekRef): Promise<Buffer> => {
    if (ref.kmsKeyId !== LocalDevKmsAdapter.KMS_KEY_ID) {
      throw new Error(
        `LocalDevKmsAdapter kann kms_key_id '${ref.kmsKeyId}' nicht entpacken (erwartet ` +
          `'${LocalDevKmsAdapter.KMS_KEY_ID}') — moeglicher versehentlicher Prod-Un-Wrap-Versuch gegen den ` +
          'Dev-KMS-Adapter (ADR-0008 §19).',
      );
    }

    if (ref.algVersion !== ALG_VERSION) {
      throw new Error(
        `LocalDevKmsAdapter unterstuetzt nur alg_version=${ALG_VERSION} (erhalten: ${ref.algVersion}).`,
      );
    }

    return Promise.resolve(this.unwrap(ref.wrappedDek));
  };

  private wrap(dek: Buffer): Buffer {
    const nonce = randomBytes(NONCE_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', this.masterKey, nonce);
    cipher.setAAD(LocalDevKmsAdapter.WRAP_AAD);
    const ciphertext = Buffer.concat([cipher.update(dek), cipher.final()]);
    const tag = cipher.getAuthTag();
    // Layout konsistent zu ADR-0008 §19: nonce(12B) || ciphertext || tag(16B).
    return Buffer.concat([nonce, ciphertext, tag]);
  }

  private unwrap(wrappedDek: Buffer): Buffer {
    if (wrappedDek.length < NONCE_LENGTH + TAG_LENGTH) {
      throw new Error('LocalDevKmsAdapter: wrapped_dek zu kurz (kein gueltiges nonce||ciphertext||tag-Layout).');
    }

    const nonce = wrappedDek.subarray(0, NONCE_LENGTH);
    const tag = wrappedDek.subarray(wrappedDek.length - TAG_LENGTH);
    const ciphertext = wrappedDek.subarray(NONCE_LENGTH, wrappedDek.length - TAG_LENGTH);

    const decipher = createDecipheriv('aes-256-gcm', this.masterKey, nonce);
    decipher.setAAD(LocalDevKmsAdapter.WRAP_AAD);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  private static loadMasterKey(): Buffer {
    const raw = process.env['EDMS_DEV_KMS_MASTER_KEY'];
    if (raw === undefined || raw.length === 0) {
      throw new Error(
        'EDMS_DEV_KMS_MASTER_KEY ist nicht gesetzt — Dev-KMS-Master-Key fehlt (ADR-0008 §19, F6-Bedingung 4: ' +
          'Schluessel NIE im Repo, nur Env/Dev-Volume). Fail-closed: harter Fehlstart statt Nulldefault.',
      );
    }

    const decoded = Buffer.from(raw, 'base64');
    if (decoded.length !== DEK_LENGTH) {
      throw new Error(
        `EDMS_DEV_KMS_MASTER_KEY muss genau ${DEK_LENGTH} Byte (AES-256) nach Base64-Dekodierung ergeben ` +
          `(erhalten: ${decoded.length} Byte).`,
      );
    }

    return decoded;
  }
}
