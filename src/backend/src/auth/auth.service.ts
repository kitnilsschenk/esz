import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AUTH_EVENT_CODES } from '../audit/audit-event-codes';
import type { AuditErgebnis } from '../common/security/audit-ergebnis';
import { AuthConfigService } from './auth.config';
import { KEYCLOAK_OIDC_PORT } from './adapters/keycloak-oidc.port';
import type { KeycloakOidcPort } from './adapters/keycloak-oidc.port';
import { OidcProviderUnavailableError } from './adapters/keycloak-oidc.port';
import { deriveCodeChallengeS256, generateCodeVerifier, generateNonce, generateState } from './pkce/pkce.util';
import { decryptAuthTx, encryptAuthTx } from './cookies/auth-tx-cookie.util';
import {
  AUTH_TX_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  buildDeleteHostCookie,
  buildHostCookie,
  parseCookieHeader,
} from './cookies/cookie.util';
import { AccessTokenResponseDto } from './dto/access-token-response.dto';
import { AccessTokenVerifierService } from './jwt/access-token-verifier.service';

/** TTL des Vor-Auth-Cookies (10 min, s. `auth-tx-cookie.util.ts`). */
const AUTH_TX_COOKIE_MAX_AGE_SECONDS = 600;
/** A4: absolute Session 8 h — Umsetzungsort des Refresh-Cookies. */
const REFRESH_COOKIE_MAX_AGE_SECONDS = 8 * 60 * 60;

export interface LoginRedirect {
  readonly location: string;
  readonly authTxCookie: string;
}

export interface CallbackOutcome {
  readonly location: string;
  readonly refreshCookie: string;
  readonly clearAuthTxCookie: string;
}

export interface RefreshOutcome {
  readonly accessToken: AccessTokenResponseDto;
  readonly refreshCookie: string;
}

interface CallbackQuery {
  readonly code?: string;
  readonly state: string;
  readonly error?: string;
}

/**
 * `AuthService` (ADR-0002 Teil B §12, Schicht-Split `backend-lead`-Votum F1):
 * orchestriert PKCE/State/Nonce, Cookie-Handling und Audit-Trigger. Kennt
 * NUR den `KeycloakOidcPort` (nie `fetch`/Keycloak-URLs direkt) und ruft
 * `AuditService.append()` DIREKT auf (dokumentierte Ausnahme vom
 * `@AuditAction`-Decorator, `backend-lead`-Votum F2 — Login/Callback/
 * Refresh/Logout haben kein generisches Objekt-/RBAC-Muster).
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(KEYCLOAK_OIDC_PORT) private readonly oidc: KeycloakOidcPort,
    private readonly auditService: AuditService,
    private readonly config: AuthConfigService,
    private readonly tokenVerifier: AccessTokenVerifierService,
  ) {}

  async buildLoginRedirect(): Promise<LoginRedirect> {
    const state = generateState();
    const nonce = generateNonce();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = deriveCodeChallengeS256(codeVerifier);

    const location = this.oidc.buildAuthorizationUrl({ state, nonce, codeChallenge });
    const authTxToken = await encryptAuthTx({ state, nonce, codeVerifier }, this.config.clientSecret);
    const authTxCookie = buildHostCookie(AUTH_TX_COOKIE_NAME, authTxToken, {
      maxAgeSeconds: AUTH_TX_COOKIE_MAX_AGE_SECONDS,
      sameSite: 'Lax',
    });

    return { location, authTxCookie };
  }

  async handleCallback(query: CallbackQuery, cookieHeader: string | undefined): Promise<CallbackOutcome> {
    const cookies = parseCookieHeader(cookieHeader);
    const authTxToken = cookies[AUTH_TX_COOKIE_NAME];
    const clearAuthTxCookie = buildDeleteHostCookie(AUTH_TX_COOKIE_NAME, 'Lax');
    const authTx = authTxToken !== undefined ? await decryptAuthTx(authTxToken, this.config.clientSecret) : undefined;

    if (query.error !== undefined) {
      await this.emitLoginFailure('oidc_fehler_von_keycloak');
      throw new UnauthorizedException('oidc_fehler_von_keycloak');
    }

    if (authTx === undefined || authTx.state !== query.state) {
      await this.emitLoginFailure('state_ungueltig_oder_fehlend');
      throw new BadRequestException('state_ungueltig_oder_fehlend');
    }

    if (query.code === undefined) {
      await this.emitLoginFailure('code_fehlt');
      throw new BadRequestException('code_fehlt');
    }

    const exchange = await this.exchangeOrFail(query.code, authTx.codeVerifier);

    if (exchange.idTokenClaims.nonce !== authTx.nonce) {
      await this.emitLoginFailure('nonce_mismatch');
      throw new BadRequestException('nonce_mismatch');
    }

    const sub = exchange.idTokenClaims.sub;
    if (typeof sub !== 'string' || sub.length === 0) {
      await this.emitLoginFailure('id_token_ohne_sub');
      throw new BadRequestException('id_token_ohne_sub');
    }

    await this.auditService.append({
      eventTyp: AUTH_EVENT_CODES.ANMELDUNG_ERFOLG,
      actorTyp: 'benutzer',
      actorSub: sub,
      ergebnis: 'ok',
    });

    return {
      location: this.config.spaPostLoginPath,
      refreshCookie: buildHostCookie(REFRESH_COOKIE_NAME, exchange.refreshToken, {
        maxAgeSeconds: REFRESH_COOKIE_MAX_AGE_SECONDS,
        sameSite: 'Strict',
      }),
      clearAuthTxCookie,
    };
  }

  async refresh(cookieHeader: string | undefined): Promise<RefreshOutcome> {
    const cookies = parseCookieHeader(cookieHeader);
    const refreshToken = cookies[REFRESH_COOKIE_NAME];

    if (refreshToken === undefined) {
      throw new UnauthorizedException('kein_refresh_token');
    }

    let exchange;
    try {
      exchange = await this.oidc.refreshAccessToken(refreshToken);
    } catch (error: unknown) {
      if (error instanceof OidcProviderUnavailableError) {
        throw new ServiceUnavailableException('identity_provider_nicht_erreichbar');
      }
      throw new UnauthorizedException('refresh_fehlgeschlagen');
    }

    // Best-effort `sub`-Attribution für die (optionale, Datensparsamkeit
    // prüfen, ADR-0002 §15) `auth.token.erneuert`-Zeile: das frisch von
    // Keycloak ausgestellte Access-Token wird — wie im JwtAuthGuard —
    // gegen dieselbe JWKS verifiziert. Schlägt das fehl, wird die
    // Audit-Zeile bewusst übersprungen statt mit einem unvalidierten `sub`
    // geschrieben zu werden (rote Linie 1).
    await this.tryEmitRefreshSuccess(exchange.accessToken);

    return {
      accessToken: new AccessTokenResponseDto(exchange.accessToken, exchange.expiresIn),
      refreshCookie: buildHostCookie(REFRESH_COOKIE_NAME, exchange.refreshToken, {
        maxAgeSeconds: REFRESH_COOKIE_MAX_AGE_SECONDS,
        sameSite: 'Strict',
      }),
    };
  }

  async logout(cookieHeader: string | undefined): Promise<string> {
    const cookies = parseCookieHeader(cookieHeader);
    const refreshToken = cookies[REFRESH_COOKIE_NAME];

    if (refreshToken !== undefined) {
      try {
        await this.oidc.endSession(refreshToken);
      } catch (error: unknown) {
        if (error instanceof OidcProviderUnavailableError) {
          // Idempotenz bleibt gewahrt (Logout bleibt 204, Cookie wird in
          // jedem Fall gelöscht) — ein wirklich nicht erreichbarer IdP wird
          // NUR intern geloggt, kein harter Fehler an die SPA.
          this.logger.warn('Keycloak-Logout-Endpoint nicht erreichbar — Cookie wird dennoch geloescht.');
        }
      }

      await this.auditService.append({
        eventTyp: AUTH_EVENT_CODES.ABMELDUNG_ERFOLG,
        actorTyp: 'system',
        ergebnis: 'ok',
      });
    }

    return buildDeleteHostCookie(REFRESH_COOKIE_NAME, 'Strict');
  }

  private async exchangeOrFail(
    code: string,
    codeVerifier: string,
  ): Promise<Awaited<ReturnType<KeycloakOidcPort['exchangeAuthorizationCode']>>> {
    try {
      return await this.oidc.exchangeAuthorizationCode(code, codeVerifier);
    } catch (error: unknown) {
      if (error instanceof OidcProviderUnavailableError) {
        // Infra-/Erreichbarkeitsfehler — keine Sicherheitsentscheidung wurde
        // getroffen, das System konnte den Vorgang nicht ABSCHLIESSEN
        // (anders als ein aktives "abgelehnt"). ADR-0002 §15: "denied/error".
        await this.emitLoginFailure('idp_nicht_erreichbar', 'error');
        throw new ServiceUnavailableException('identity_provider_nicht_erreichbar');
      }

      // `OidcExchangeError` (nicht-ok Token-Endpoint-Antwort, unvollständige
      // Antwort, ID-Token-Validierung fehlgeschlagen) UND jeder sonstige,
      // unerwartete Fehler werden ebenfalls als `error` gewertet: keiner
      // dieser Fälle ist eine ABSICHTLICHE Policy-Ablehnung eines
      // authentisierten/identifizierbaren Vorgangs (das wäre `denied`,
      // reserviert für state/nonce/code-Protokollverstöße oben sowie den
      // expliziten `error`-Query-Parameter von Keycloak selbst), sondern ein
      // technischer Fehlschlag des Austauschs.
      await this.emitLoginFailure('code_exchange_fehlgeschlagen', 'error');
      throw new BadRequestException('code_exchange_fehlgeschlagen');
    }
  }

  private async tryEmitRefreshSuccess(accessToken: string): Promise<void> {
    try {
      const claims = await this.tokenVerifier.verify(accessToken);
      if (typeof claims.sub === 'string' && claims.sub.length > 0) {
        await this.auditService.append({
          eventTyp: AUTH_EVENT_CODES.TOKEN_ERNEUERT,
          actorTyp: 'benutzer',
          actorSub: claims.sub,
          ergebnis: 'ok',
        });
      }
    } catch (error: unknown) {
      this.logger.warn(
        `auth.token.erneuert konnte nicht auditiert werden (sub-Extraktion fehlgeschlagen): ${
          error instanceof Error ? error.message : 'unbekannter Fehler'
        }`,
      );
    }
  }

  /**
   * `ergebnis` unterscheidet (ADR-0002 §15: "denied/error") zwei fachlich
   * verschiedene Fehlschlags-Arten: `denied` = eine ABSICHTLICHE
   * Protokoll-/Sicherheits-Ablehnung (state-/nonce-/code-Verstoß oder ein
   * expliziter `error`-Rücksprung von Keycloak selbst — ein Entscheid WURDE
   * getroffen); `error` = ein TECHNISCHER Fehlschlag des Austauschs
   * (IdP nicht erreichbar, Token-Endpoint-/ID-Token-Validierungsfehler —
   * KEIN Entscheid, der Vorgang konnte nicht abgeschlossen werden). Default
   * bleibt `denied` (der überwiegende, protokollnahe Fall).
   */
  private async emitLoginFailure(grundCode: string, ergebnis: AuditErgebnis = 'denied'): Promise<void> {
    // Kein validierter Prinzipal -> actor_sub=NULL, actor_typ='system'
    // (ADR-0002 §15). `grundCode` ist ein WHITELISTED, PII-freier Code.
    await this.auditService.append({
      eventTyp: AUTH_EVENT_CODES.ANMELDUNG_FEHLSCHLAG,
      actorTyp: 'system',
      ergebnis,
      kontext: { grund: grundCode },
    });
  }
}
