import { Inject, Injectable } from '@nestjs/common';
import { AuthConfigService } from '../auth.config';
import { loadJose } from '../jwt/jose-loader';
import type { KeycloakIdTokenClaims } from '../jwt/keycloak-claims';
import { JWT_KEY_RESOLVER } from '../jwt/jwks-provider';
import type { JwtKeyResolver } from '../jwt/jwks-provider';
import type { AuthorizationRequestParams, KeycloakOidcPort, TokenExchangeResult } from './keycloak-oidc.port';
import { OidcExchangeError, OidcProviderUnavailableError } from './keycloak-oidc.port';

interface KeycloakTokenResponse {
  readonly access_token?: string;
  readonly refresh_token?: string;
  readonly id_token?: string;
  readonly expires_in?: number;
}

const TOKEN_ALGORITHMS = ['RS256', 'ES256'];
const CLOCK_TOLERANCE_SECONDS = 5;

/**
 * `KeycloakOidcAdapter` (ADR-0002 Teil B §12, `backend-lead`-Votum F1) —
 * Token-Endpoint-Calls + ID-Token-Validierung via `jose`/`fetch`. Bewusst
 * KEIN `openid-client` (v1 kommt mit `jose` + globalem `fetch` ohne
 * zusätzliche Dependency aus, ADR-Vorzug).
 */
@Injectable()
export class KeycloakOidcAdapter implements KeycloakOidcPort {
  constructor(
    private readonly config: AuthConfigService,
    @Inject(JWT_KEY_RESOLVER) private readonly keyResolver: JwtKeyResolver,
  ) {}

  buildAuthorizationUrl(params: AuthorizationRequestParams): string {
    const url = new URL(this.config.authorizationEndpoint);
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid');
    url.searchParams.set('redirect_uri', this.config.redirectUri);
    url.searchParams.set('state', params.state);
    url.searchParams.set('nonce', params.nonce);
    url.searchParams.set('code_challenge', params.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');

    return url.toString();
  }

  async exchangeAuthorizationCode(code: string, codeVerifier: string): Promise<TokenExchangeResult> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.redirectUri,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      code_verifier: codeVerifier,
    });

    return this.requestToken(body);
  }

  async refreshAccessToken(refreshToken: string): Promise<TokenExchangeResult> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });

    return this.requestToken(body);
  }

  async endSession(refreshToken: string): Promise<void> {
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      refresh_token: refreshToken,
    });

    const response = await this.postForm(this.config.logoutEndpoint, body);

    // Idempotenz (ADR-0002 §12, POST /auth/logout bleibt 204): ein bereits
    // ungültiges/abgelaufenes Refresh-Token gilt als "bereits abgemeldet",
    // kein harter Fehler. NUR 5xx (Keycloak selbst kaputt) wird eskaliert.
    if (!response.ok && response.status >= 500) {
      throw new OidcProviderUnavailableError(`Keycloak-Logout-Endpoint antwortete mit ${String(response.status)}.`);
    }
  }

  private async requestToken(body: URLSearchParams): Promise<TokenExchangeResult> {
    const response = await this.postForm(this.config.tokenEndpoint, body);

    if (!response.ok) {
      throw new OidcExchangeError(`Keycloak-Token-Endpoint antwortete mit ${String(response.status)}.`);
    }

    const json = (await response.json()) as KeycloakTokenResponse;

    if (
      typeof json.access_token !== 'string' ||
      typeof json.refresh_token !== 'string' ||
      typeof json.expires_in !== 'number'
    ) {
      throw new OidcExchangeError('Keycloak-Token-Antwort unvollstaendig (access_token/refresh_token/expires_in).');
    }

    const idTokenClaims: KeycloakIdTokenClaims =
      typeof json.id_token === 'string' ? await this.verifyIdToken(json.id_token) : {};

    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      idTokenClaims,
      expiresIn: json.expires_in,
    };
  }

  private async postForm(url: string, body: URLSearchParams): Promise<Response> {
    try {
      return await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
    } catch {
      throw new OidcProviderUnavailableError(`Keycloak-Endpoint nicht erreichbar: ${url}`);
    }
  }

  private async verifyIdToken(idToken: string): Promise<KeycloakIdTokenClaims> {
    const jose = await loadJose();

    try {
      const { payload } = await jose.jwtVerify(idToken, this.keyResolver, {
        issuer: this.config.issuerUrl,
        audience: this.config.clientId,
        algorithms: TOKEN_ALGORITHMS,
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
        requiredClaims: ['exp', 'sub'],
      });

      return payload;
    } catch {
      throw new OidcExchangeError('ID-Token-Validierung fehlgeschlagen (Signatur/iss/aud/exp).');
    }
  }
}
