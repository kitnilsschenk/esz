export const AUTH_TX_COOKIE_NAME = '__Host-edms_auth_tx';
export const REFRESH_COOKIE_NAME = '__Host-edms_rt';

export interface HostCookieOptions {
  readonly maxAgeSeconds: number;
  readonly sameSite: 'Lax' | 'Strict';
}

/**
 * `__Host-`-Cookie-Bau (ADR-0002 Teil B §12): der `__Host-`-Präfix erzwingt
 * (browserseitig) Secure + Path=/ + KEINE `Domain`-Angabe (kein Subdomain-
 * Cookie-Injection). `HttpOnly` immer gesetzt (kein JS-Zugriff, M3).
 */
export function buildHostCookie(name: string, value: string, options: HostCookieOptions): string {
  return [
    `${name}=${value}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    `SameSite=${options.sameSite}`,
    `Max-Age=${options.maxAgeSeconds}`,
  ].join('; ');
}

/** Löscht ein `__Host-`-Cookie (`Max-Age=0`) — Attribute müssen zum Setzen passen. */
export function buildDeleteHostCookie(name: string, sameSite: 'Lax' | 'Strict' = 'Strict'): string {
  return [`${name}=`, 'Path=/', 'HttpOnly', 'Secure', `SameSite=${sameSite}`, 'Max-Age=0'].join('; ');
}

/**
 * Minimaler `Cookie`-Header-Parser — bewusst KEINE neue Dependency
 * (`cookie-parser`): das Format ist trivial und nur zwei Cookie-Namen
 * müssen gelesen werden (kleinste Dependency-Oberfläche, ADR-0002 §18).
 */
export function parseCookieHeader(header: string | undefined): Readonly<Record<string, string>> {
  if (header === undefined || header.length === 0) {
    return {};
  }

  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const name = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (name.length > 0) {
      result[name] = decodeURIComponent(value);
    }
  }

  return result;
}
