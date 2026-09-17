// Test-Support (per `tsconfig.build.json` von der Produktions-Build
// ausgeschlossen, s. `src/**/test-support/**`) — statischer `import` von
// `jose` ist hier bewusst unproblematisch: Vitest/Vite handhabt ESM-only-
// Pakete transparent, unabhängig vom Produktions-Risiko (`ERR_REQUIRE_ESM`
// unter `node dist/main.js`), das die dynamische `import()`-Entscheidung in
// den Produktionsdateien begründet (s. `auth/jwt/jose-loader.ts`).
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import type { JWTPayload, JWTVerifyGetKey } from 'jose';

export interface TestJwtIssuer {
  readonly keyResolver: JWTVerifyGetKey;
  sign(payload: JWTPayload, options?: { readonly alg?: string; readonly expiresIn?: string }): Promise<string>;
}

const TEST_KID = 'test-key-1';

/**
 * Erzeugt ein selbstständiges RSA-Schlüsselpaar + eine lokale JWKS
 * (`createLocalJWKSet`) für Tests, die einen validen, signierten Keycloak-
 * ähnlichen Token brauchen — OHNE echten Keycloak/Netzzugriff (ADR-0002 §11:
 * der `JWT_KEY_RESOLVER`-DI-Token existiert GENAU für diesen Zweck).
 */
export async function createTestJwtIssuer(): Promise<TestJwtIssuer> {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
  const jwk = await exportJWK(publicKey);
  const jwks = { keys: [{ ...jwk, kid: TEST_KID, alg: 'RS256', use: 'sig' }] };
  const keyResolver = createLocalJWKSet(jwks);

  return {
    keyResolver,
    async sign(payload, options = {}) {
      return new SignJWT(payload)
        .setProtectedHeader({ alg: options.alg ?? 'RS256', kid: TEST_KID })
        .setIssuedAt()
        .setExpirationTime(options.expiresIn ?? '5m')
        .sign(privateKey);
    },
  };
}
