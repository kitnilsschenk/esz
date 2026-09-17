import { Injectable } from '@nestjs/common';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`Umgebungsvariable ${name} ist nicht gesetzt (siehe .env.example).`);
  }
  return value;
}

/**
 * Zentrale, fail-fast validierte Auth-Konfiguration (ADR-0002 Teil B §12/§14
 * Realm-Fakten). Wirft beim Konstruieren (DI-Instanziierung), wenn eine
 * Pflicht-Variable fehlt — bewusst KEIN stiller Default für
 * sicherheitsrelevante Werte (Issuer/Client/Secret).
 *
 * NEUE Umgebungsvariable gegenüber dem Bestand (s. finale Antwort):
 * `AUTH_ALLOWED_ORIGINS` (CSV, Default `http://localhost:3000`) für die
 * CSRF-Origin-Allowlist auf `/auth/refresh` + `/auth/logout` (ADR-0002 §12,
 * `security-lead`-Votum 3) und den festen SPA-Post-Login-Redirect.
 */
@Injectable()
export class AuthConfigService {
  readonly issuerUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
  readonly allowedOrigins: readonly string[];
  readonly spaPostLoginPath: string;

  constructor() {
    this.issuerUrl = requireEnv('KEYCLOAK_ISSUER_URL');
    this.clientId = requireEnv('OIDC_CLIENT_ID');
    this.clientSecret = requireEnv('EDMS_BFF_CLIENT_SECRET');
    this.redirectUri = requireEnv('OIDC_REDIRECT_URI');
    this.allowedOrigins = (process.env['AUTH_ALLOWED_ORIGINS'] ?? 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);
    this.spaPostLoginPath = process.env['AUTH_SPA_POST_LOGIN_PATH'] ?? '/';
  }

  get authorizationEndpoint(): string {
    return `${this.issuerUrl}/protocol/openid-connect/auth`;
  }

  get tokenEndpoint(): string {
    return `${this.issuerUrl}/protocol/openid-connect/token`;
  }

  get jwksEndpoint(): string {
    return `${this.issuerUrl}/protocol/openid-connect/certs`;
  }

  get logoutEndpoint(): string {
    return `${this.issuerUrl}/protocol/openid-connect/logout`;
  }
}
