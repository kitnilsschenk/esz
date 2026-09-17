import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { FieldCipherService } from './field-cipher.service';

describe('FieldCipherService (ADR-0008 §19, D7/A7)', () => {
  const service = new FieldCipherService();
  const dek = randomBytes(32);

  it('roundtrip: entschlüsselt exakt den ursprünglichen Klartext', () => {
    const chiffrat = service.encrypt(dek, 'endkunde-1', 'name', 'Musterkunde GmbH');
    const klartext = service.decrypt(dek, 'endkunde-1', 'name', chiffrat);

    expect(klartext).toBe('Musterkunde GmbH');
  });

  it('Byte-Layout ist nonce(12B) || ciphertext || tag(16B)', () => {
    const chiffrat = service.encrypt(dek, 'endkunde-1', 'name', 'x');
    // 12 Byte Nonce + 1 Byte Ciphertext ("x" ist 1 Byte UTF-8) + 16 Byte Tag.
    expect(chiffrat.length).toBe(12 + 1 + 16);
  });

  it('jede Verschlüsselung erzeugt einen frischen Nonce (kein Nonce-Reuse)', () => {
    const erste = service.encrypt(dek, 'endkunde-1', 'name', 'gleicher Klartext');
    const zweite = service.encrypt(dek, 'endkunde-1', 'name', 'gleicher Klartext');

    expect(erste.subarray(0, 12).equals(zweite.subarray(0, 12))).toBe(false);
    expect(erste.equals(zweite)).toBe(false);
  });

  it('AAD-Vertauschung (falsche subjektId beim Entschlüsseln) schlägt fehl (Auth-Tag-Mismatch)', () => {
    const chiffrat = service.encrypt(dek, 'endkunde-1', 'name', 'Musterkunde GmbH');

    expect(() => service.decrypt(dek, 'endkunde-2', 'name', chiffrat)).toThrow();
  });

  it('AAD-Vertauschung (falsches Feld beim Entschlüsseln) schlägt fehl (Auth-Tag-Mismatch)', () => {
    const chiffrat = service.encrypt(dek, 'endkunde-1', 'name', 'Musterkunde GmbH');

    expect(() => service.decrypt(dek, 'endkunde-1', 'anschrift', chiffrat)).toThrow();
  });

  it('AAD-Feld-/Subjekt-Grenzverwischung ("ab","c") vs. ("a","bc") erzeugt unterschiedliche Chiffrate/AAD (Längenpräfix wirkt)', () => {
    // Gleiche Konkatenation ohne Längenpräfix wäre mehrdeutig
    // ("ab"+"c" === "a"+"bc") — der Längenpräfix verhindert das strukturell:
    // beide Chiffrate koennen NICHT gegenseitig entschluesselt werden.
    const chiffratAbC = service.encrypt(dek, 'ab', 'c', 'geheim');
    const chiffratABc = service.encrypt(dek, 'a', 'bc', 'geheim');

    expect(() => service.decrypt(dek, 'a', 'bc', chiffratAbC)).toThrow();
    expect(() => service.decrypt(dek, 'ab', 'c', chiffratABc)).toThrow();

    // Aber mit den jeweils KORREKTEN Werten funktioniert es weiterhin.
    expect(service.decrypt(dek, 'ab', 'c', chiffratAbC)).toBe('geheim');
    expect(service.decrypt(dek, 'a', 'bc', chiffratABc)).toBe('geheim');
  });

  it('manipuliertes Chiffrat (ein Byte im Ciphertext-Teil geflippt) schlägt fehl', () => {
    const chiffrat = service.encrypt(dek, 'endkunde-1', 'name', 'Musterkunde GmbH');
    const manipuliert = Buffer.from(chiffrat);
    // Byte irgendwo im Ciphertext-Bereich (nach den ersten 12 Nonce-Bytes) flippen.
    manipuliert[12] = (manipuliert[12] ?? 0) ^ 0xff;

    expect(() => service.decrypt(dek, 'endkunde-1', 'name', manipuliert)).toThrow();
  });

  it('zu kurzes Chiffrat wird abgelehnt', () => {
    expect(() => service.decrypt(dek, 'endkunde-1', 'name', Buffer.from('zu kurz'))).toThrow();
  });

  it('falscher DEK beim Entschlüsseln schlägt fehl', () => {
    const chiffrat = service.encrypt(dek, 'endkunde-1', 'name', 'Musterkunde GmbH');
    const falscherDek = randomBytes(32);

    expect(() => service.decrypt(falscherDek, 'endkunde-1', 'name', chiffrat)).toThrow();
  });
});
