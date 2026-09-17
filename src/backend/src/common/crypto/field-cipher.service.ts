import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;
const LENGTH_PREFIX_BYTES = 4;

/**
 * ADR-0008 §19 (D7, A7) — Feld-Verschlüsselung (AES-256-GCM), Node-built-in
 * `crypto` (KEINE neue Dependency). Arbeitet AUSSCHLIESSLICH auf einem
 * bereits entpackten Klartext-DEK (`Buffer`) — der Un-/Wrap-Roundtrip über
 * `KeyManagementPort` ist bewusst NICHT Teil dieses Service (Separation of
 * Concerns): der Aufrufer beschafft den DEK und reicht ihn hier nur noch als
 * Klartext-Bytes durch. Hinweis zum `backend-lead`-Constraint "KMS-Roundtrip
 * nie in offener Tx" (§19): der Aufrufer zieht den KMS-Call zwar VOR die
 * innere `@Transactional(Propagation.Nested)`-Klammer, aber die ÄUSSERE
 * Request-Tx (globaler `TransactionInterceptor`, `Propagation.Required` mit
 * sofortigem BEGIN) ist dann bereits offen — der Constraint ist also NUR
 * relativ zur Nested-Tx erfüllt. Für den synchronen `LocalDevKmsAdapter`
 * folgenlos; vor einem echten Cloud-KMS-Adapter architektonisch zu lösen,
 * s. `key-management.port.ts` + ADR-0008 §29(C6).
 *
 * Byte-Layout (MASSGEBLICH, ADR-0008 §19 — Korrektur/Präzisierung zu
 * ADR-0004 §15, dort `ciphertext||nonce||tag` skizziert):
 *
 *   nonce(12 Byte) || ciphertext || tag(16 Byte)
 *
 * AAD (Associated Data) — kanonisch längen-präfigiert (ADR-0008 §19, KEINE
 * bloße Konkatenation): `LP(subjektId) || LP(feld)`, `LP(x) = uint32-BE-
 * Länge || UTF-8-Bytes von x`. Verhindert Feld-/Subjekt-Vertauschen
 * eindeutig (`("ab","c") ≠ ("a","bc")`).
 */
@Injectable()
export class FieldCipherService {
  encrypt(dek: Buffer, subjektId: string, feld: string, klartext: string): Buffer {
    const nonce = randomBytes(NONCE_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', dek, nonce);
    cipher.setAAD(this.buildAad(subjektId, feld));

    const ciphertext = Buffer.concat([cipher.update(klartext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return Buffer.concat([nonce, ciphertext, tag]);
  }

  decrypt(dek: Buffer, subjektId: string, feld: string, chiffrat: Buffer): string {
    if (chiffrat.length < NONCE_LENGTH + TAG_LENGTH) {
      throw new Error('FieldCipherService: Chiffrat zu kurz (kein gueltiges nonce||ciphertext||tag-Layout).');
    }

    const nonce = chiffrat.subarray(0, NONCE_LENGTH);
    const tag = chiffrat.subarray(chiffrat.length - TAG_LENGTH);
    const ciphertext = chiffrat.subarray(NONCE_LENGTH, chiffrat.length - TAG_LENGTH);

    const decipher = createDecipheriv('aes-256-gcm', dek, nonce);
    decipher.setAAD(this.buildAad(subjektId, feld));
    decipher.setAuthTag(tag);

    // Wirft (GCM-Auth-Tag-Mismatch), wenn subjektId/feld nicht zum
    // Chiffrat passen (AAD-Vertauschung) oder das Chiffrat manipuliert wurde.
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }

  private buildAad(subjektId: string, feld: string): Buffer {
    return Buffer.concat([this.lengthPrefixed(subjektId), this.lengthPrefixed(feld)]);
  }

  private lengthPrefixed(value: string): Buffer {
    const valueBuf = Buffer.from(value, 'utf8');
    const lenBuf = Buffer.alloc(LENGTH_PREFIX_BYTES);
    lenBuf.writeUInt32BE(valueBuf.length, 0);
    return Buffer.concat([lenBuf, valueBuf]);
  }
}
