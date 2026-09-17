import { hkdfSync } from 'node:crypto';
import { loadJose } from '../jwt/jose-loader';

export interface AuthTxPayload {
  readonly state: string;
  readonly nonce: string;
  readonly codeVerifier: string;
}

const HKDF_INFO = 'edms-auth-tx-cookie-v1';
const HKDF_KEY_LENGTH = 32;

/**
 * Domänen-separierter symmetrischer Schlüssel für den verschlüsselten
 * Vor-Auth-Cookie (`__Host-edms_auth_tx`, ADR-0002 §12: "verschlüsselter ...
 * Vor-Auth-Cookie"). Abgeleitet via HKDF-SHA256 aus dem ohnehin vorhandenen
 * vertraulichen `EDMS_BFF_CLIENT_SECRET` — KEIN neues Secret nötig, da HKDFs
 * `info`-Label genau für diese Domänentrennung gedacht ist (ein Angreifer,
 * der NUR den abgeleiteten Cookie-Schlüssel bräche, käme nicht an das
 * Client-Secret selbst; umgekehrt bräuchte die Cookie-Verschlüsselung allein
 * keinen Zugriff auf den Token-Endpoint). Alternative (getrenntes
 * `AUTH_TX_COOKIE_SECRET`) ist ein offener Punkt für `security-lead`, s.
 * finale Antwort.
 */
function deriveKey(clientSecret: string): Uint8Array {
  const derived = hkdfSync(
    'sha256',
    Buffer.from(clientSecret, 'utf8'),
    Buffer.alloc(0),
    Buffer.from(HKDF_INFO, 'utf8'),
    HKDF_KEY_LENGTH,
  );

  return new Uint8Array(derived);
}

/** Verschlüsselt (JWE, `dir`/`A256GCM`) den PKCE-/State-/Nonce-Transienten, TTL 10 min. */
export async function encryptAuthTx(payload: AuthTxPayload, clientSecret: string): Promise<string> {
  const jose = await loadJose();
  const key = deriveKey(clientSecret);

  return new jose.EncryptJWT({ ...payload })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .encrypt(key);
}

/** Entschlüsselt, gibt `undefined` bei Manipulation/Ablauf/falscher Form zurück (nie werfen). */
export async function decryptAuthTx(token: string, clientSecret: string): Promise<AuthTxPayload | undefined> {
  const jose = await loadJose();
  const key = deriveKey(clientSecret);

  try {
    const { payload } = await jose.jwtDecrypt(token, key);
    // `payload` ist jose's `JWTPayload` (Index-Signatur für Custom-Claims) —
    // wir haben den Token selbst verschlüsselt (AEAD, A256GCM), die Form ist
    // uns bekannt; defensiver Typ-Check statt Vertrauen in die Struktur.
    const state = payload['state'];
    const nonce = payload['nonce'];
    const codeVerifier = payload['codeVerifier'];

    if (typeof state === 'string' && typeof nonce === 'string' && typeof codeVerifier === 'string') {
      return { state, nonce, codeVerifier };
    }

    return undefined;
  } catch {
    return undefined;
  }
}
