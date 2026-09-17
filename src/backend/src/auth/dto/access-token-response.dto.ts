/**
 * Response-DTO für `POST /auth/refresh` (`AccessTokenResponse` in
 * `auth.openapi.yaml`). Kein Entity-Leak: enthält NICHTS außer dem, was der
 * Contract vorsieht — insbesondere NIE das Refresh-Token (nur httpOnly-Cookie).
 */
export class AccessTokenResponseDto {
  readonly accessToken: string;
  readonly tokenType = 'Bearer' as const;
  readonly expiresIn: number;

  constructor(accessToken: string, expiresIn: number) {
    this.accessToken = accessToken;
    this.expiresIn = expiresIn;
  }
}
