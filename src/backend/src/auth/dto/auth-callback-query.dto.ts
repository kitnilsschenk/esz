import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Query-DTO für `GET /auth/callback` (`schemas/openapi/auth.openapi.yaml`).
 *
 * ABWEICHUNG vom Contract (dokumentiert, s. finale Antwort dieses
 * Arbeitspakets, Abschnitt "Abweichungen/offene Punkte"): Die OpenAPI
 * markiert `code` als `required: true` — ein echter Keycloak-Fehler-
 * Rücksprung (z. B. abgebrochene MFA) sendet jedoch typischerweise
 * `error=...&state=...` OHNE `code`. Eine strikte `required`-Validierung
 * würde diesen Fall als 400 "code fehlt" statt (wie im Contract für den
 * 401-Fall dokumentiert) als "OIDC-Fehler von Keycloak" behandeln. `code`
 * ist daher hier bewusst OPTIONAL; `AuthService.handleCallback()`
 * unterscheidet 400 vs. 401 anhand von `error`/`code`/`state`.
 */
export class AuthCallbackQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  code?: string;

  @IsString()
  @MaxLength(512)
  state!: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  error?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  error_description?: string;

  /**
   * Keycloak/OIDC senden beim Rücksprung zusätzliche Parameter, die die
   * globale `ValidationPipe` (`forbidNonWhitelisted: true`) sonst mit 400
   * ablehnt (gefunden im Live-Login gegen echtes Keycloak 26.7):
   * - `session_state`: Keycloak-Session-Referenz (informativ).
   * - `iss` (RFC 9207 "Authorization Server Issuer Identification"):
   *   Mixup-Schutz. TODO(security-lead, Phase-5-Feinschliff): in
   *   `AuthService.handleCallback()` gegen den erwarteten Issuer
   *   (`KEYCLOAK_ISSUER_URL`) prüfen und bei Abweichung als `denied`
   *   ablehnen — hier zunächst nur akzeptiert, damit der Flow nicht bricht.
   */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  session_state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  iss?: string;
}
