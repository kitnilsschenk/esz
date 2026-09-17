import { describe, expect, it } from 'vitest';
import { decryptAuthTx, encryptAuthTx } from './auth-tx-cookie.util';

const CLIENT_SECRET = 'test-client-secret-mit-ausreichend-entropie';
const PAYLOAD = { state: 'state-1', nonce: 'nonce-1', codeVerifier: 'verifier-1' };

describe('auth-tx-cookie (verschlüsselter Vor-Auth-Cookie, ADR-0002 Teil B §12)', () => {
  it('verschlüsselt und entschlüsselt den PKCE-/State-/Nonce-Transienten verlustfrei', async () => {
    const token = await encryptAuthTx(PAYLOAD, CLIENT_SECRET);
    expect(token).not.toContain('state-1');

    const decrypted = await decryptAuthTx(token, CLIENT_SECRET);
    expect(decrypted).toEqual(PAYLOAD);
  });

  it('liefert undefined bei manipuliertem Ciphertext (AEAD-Integritätsschutz)', async () => {
    const token = await encryptAuthTx(PAYLOAD, CLIENT_SECRET);
    const tampered = `${token.slice(0, -2)}xx`;

    await expect(decryptAuthTx(tampered, CLIENT_SECRET)).resolves.toBeUndefined();
  });

  it('liefert undefined bei falschem Schlüssel (anderes Client-Secret)', async () => {
    const token = await encryptAuthTx(PAYLOAD, CLIENT_SECRET);

    await expect(decryptAuthTx(token, 'falsches-secret')).resolves.toBeUndefined();
  });

  it('liefert undefined bei völlig unstrukturiertem Input', async () => {
    await expect(decryptAuthTx('kein-jwe-token', CLIENT_SECRET)).resolves.toBeUndefined();
  });
});
