import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthConfigService } from './auth.config';
import { KeycloakOidcAdapter } from './adapters/keycloak-oidc.adapter';
import { KEYCLOAK_OIDC_PORT } from './adapters/keycloak-oidc.port';
import { RolesMapperService } from './roles/roles-mapper.service';
import { AccessTokenVerifierService } from './jwt/access-token-verifier.service';
import { JWT_KEY_RESOLVER } from './jwt/jwks-provider';
import type { JwtKeyResolver } from './jwt/jwks-provider';
import { loadJose } from './jwt/jose-loader';
import { InCodePolicyAdapter } from './policy/in-code-policy.adapter';
import { POLICY_DECISION_PORT, RESOURCE_ATTRIBUTES_PROVIDER } from './policy/policy.constants';
import { NullResourceAttributesProvider } from './policy/resource-attributes-provider';

/** JWKS-Caching-Fenster (ADR-0002 §11 D1: "Caching/Rotation" via `createRemoteJWKSet`). */
const JWKS_CACHE_MAX_AGE_MS = 10 * 60 * 1000;
const JWKS_COOLDOWN_MS = 30 * 1000;

/**
 * `AuthModule` (ADR-0002 Teil B, Phase 4 AP-B/AP-C). Bindet:
 * - `JWT_KEY_RESOLVER` -> `createRemoteJWKSet` gegen die Keycloak-JWKS
 *   (Caching + `kid`-Rotation, D1). Tests binden hier stattdessen eine
 *   lokale JWKS (`createLocalJWKSet`), s. `test-support/`.
 * - `KEYCLOAK_OIDC_PORT` -> `KeycloakOidcAdapter` (Port/Adapter, D2).
 * - `POLICY_DECISION_PORT` -> `InCodePolicyAdapter` (v1-PDP, D3).
 * - `RESOURCE_ATTRIBUTES_PROVIDER` -> `NullResourceAttributesProvider`
 *   (Default: kein Fach-Endpoint liefert in v1 reale ABAC-Attribute, A2).
 *
 * Exportiert NUR das, was `JwtAuthGuard`/`PolicyInterceptor` (global in
 * `AppModule` registriert, s. dort) zum Konstruieren brauchen —
 * `JWT_KEY_RESOLVER` selbst bleibt modul-intern (bereits in
 * `AccessTokenVerifierService` "eingebacken").
 */
@Module({
  imports: [ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 20 }])],
  controllers: [AuthController],
  providers: [
    AuthConfigService,
    AuthService,
    RolesMapperService,
    AccessTokenVerifierService,
    { provide: KEYCLOAK_OIDC_PORT, useClass: KeycloakOidcAdapter },
    { provide: POLICY_DECISION_PORT, useClass: InCodePolicyAdapter },
    { provide: RESOURCE_ATTRIBUTES_PROVIDER, useClass: NullResourceAttributesProvider },
    {
      provide: JWT_KEY_RESOLVER,
      useFactory: async (config: AuthConfigService): Promise<JwtKeyResolver> => {
        const jose = await loadJose();
        return jose.createRemoteJWKSet(new URL(config.jwksEndpoint), {
          cacheMaxAge: JWKS_CACHE_MAX_AGE_MS,
          cooldownDuration: JWKS_COOLDOWN_MS,
        });
      },
      inject: [AuthConfigService],
    },
  ],
  exports: [
    AuthConfigService,
    RolesMapperService,
    AccessTokenVerifierService,
    POLICY_DECISION_PORT,
    RESOURCE_ATTRIBUTES_PROVIDER,
  ],
})
export class AuthModule {}
