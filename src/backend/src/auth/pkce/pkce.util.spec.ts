import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { deriveCodeChallengeS256, generateCodeVerifier, generateNonce, generateState } from './pkce.util';

function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('PKCE-Utilities (RFC 7636, ADR-0002 Teil B §12)', () => {
  it('generiert einen base64url-kodierten code_verifier ohne Padding/Sonderzeichen', () => {
    const verifier = generateCodeVerifier();
    expect(verifier).toMatch(/^[A-Za-z0-9\-_]+$/);
    expect(verifier.length).toBeGreaterThanOrEqual(43);
  });

  it('leitet den code_challenge deterministisch per SHA-256 (S256) ab', () => {
    const verifier = 'test-verifier-fixwert';
    const expected = base64UrlEncode(createHash('sha256').update(verifier).digest());

    expect(deriveCodeChallengeS256(verifier)).toBe(expected);
  });

  it('generiert state/nonce als unterschiedliche, base64url-kodierte Zufallswerte', () => {
    const state1 = generateState();
    const state2 = generateState();
    const nonce = generateNonce();

    expect(state1).not.toBe(state2);
    expect(state1).toMatch(/^[A-Za-z0-9\-_]+$/);
    expect(nonce).toMatch(/^[A-Za-z0-9\-_]+$/);
  });
});
