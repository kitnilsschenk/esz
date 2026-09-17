import type { JWTVerifyGetKey } from 'jose';

/**
 * Schlüsselquelle für `jose.jwtVerify` — eigener DI-Token, damit
 * Tests/Integrationstests eine LOKALE JWKS (`createLocalJWKSet`) einspeisen
 * können, ohne einen echten Keycloak zu brauchen. Die Produktions-Bindung
 * (`AuthModule`) nutzt `createRemoteJWKSet` gegen
 * `${KEYCLOAK_ISSUER_URL}/protocol/openid-connect/certs` (Caching + `kid`-
 * Rotation, ADR-0002 Teil B §11 D1).
 */
export type JwtKeyResolver = JWTVerifyGetKey;

export const JWT_KEY_RESOLVER = Symbol('JWT_KEY_RESOLVER');
