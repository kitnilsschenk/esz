import { Inject, Injectable } from '@nestjs/common';
import { loadJose } from './jose-loader';
import type { KeycloakAccessTokenClaims } from './keycloak-claims';
import { JWT_KEY_RESOLVER } from './jwks-provider';
import type { JwtKeyResolver } from './jwks-provider';
import { AuthConfigService } from '../auth.config';

/** Alg-Confusion-Schutz (ADR-0002 §11 D1) — NIE `none`/HS* akzeptieren. */
const ALLOWED_ALGORITHMS = ['RS256', 'ES256'];
/** Einheitlich 5 s, kein Dev/Prod-Split (`security-lead`-Votum 1). */
const CLOCK_TOLERANCE_SECONDS = 5;

export class AccessTokenVerificationError extends Error {}

/**
 * Gemeinsame Access-Token-Verifikationslogik (Signatur/Alg-Allowlist/`iss`/
 * `exp`, Clock-Skew 5 s) — genutzt von `JwtAuthGuard` (volle AuthN-
 * Durchsetzung inkl. `azp`/`actor_typ`-Prüfung, dort zusätzlich) UND
 * `AuthService` (Best-Effort-`sub`-Extraktion aus einem frisch von Keycloak
 * ausgestellten Access-Token für die `auth.token.erneuert`-Audit-Zeile) —
 * vermeidet Logik-Duplikation zwischen beiden Aufrufern.
 */
@Injectable()
export class AccessTokenVerifierService {
  constructor(
    @Inject(JWT_KEY_RESOLVER) private readonly keyResolver: JwtKeyResolver,
    private readonly config: AuthConfigService,
  ) {}

  // Arrow-Klassenfeld statt Methoden-Kurzschreibweise (bewusst, NICHT nur
  // Stilfrage): `verify` wird von `JwtAuthGuard`/`AuthService` injiziert und
  // in Tests häufig gemockt (`expect(tokenVerifier.verify).toHaveBeenCalledWith
  // (...)`) — als Methode deklariert löst das `@typescript-eslint/unbound-
  // method` aus (potenzielle `this`-Bindungs-Gefahr beim Entkoppeln vom
  // Empfänger). Als Arrow-Feld ist der Typ eine funktionswertige Property
  // ohne `this`-Semantik, die Regel greift nicht — kein Unterdrücken, echte
  // Ursachenbehebung.
  verify = async (token: string): Promise<KeycloakAccessTokenClaims> => {
    const jose = await loadJose();

    try {
      const { payload } = await jose.jwtVerify(token, this.keyResolver, {
        issuer: this.config.issuerUrl,
        algorithms: ALLOWED_ALGORITHMS,
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
        requiredClaims: ['exp', 'sub'],
      });

      return payload;
    } catch (error: unknown) {
      throw new AccessTokenVerificationError(
        error instanceof Error ? error.message : 'Token-Verifikation fehlgeschlagen.',
      );
    }
  };
}
