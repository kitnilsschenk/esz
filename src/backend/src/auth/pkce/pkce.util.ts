import { createHash, randomBytes } from 'node:crypto';

function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** PKCE `code_verifier` (43-128 Zeichen erlaubt, RFC 7636) — 32 Zufallsbytes -> 43 Zeichen base64url. */
export function generateCodeVerifier(): string {
  return base64UrlEncode(randomBytes(32));
}

/** PKCE `code_challenge` (S256, RFC 7636 §4.2) — Keycloak erzwingt S256 IdP-seitig auf `edms-bff`. */
export function deriveCodeChallengeS256(codeVerifier: string): string {
  return base64UrlEncode(createHash('sha256').update(codeVerifier).digest());
}

export function generateState(): string {
  return base64UrlEncode(randomBytes(16));
}

export function generateNonce(): string {
  return base64UrlEncode(randomBytes(16));
}
