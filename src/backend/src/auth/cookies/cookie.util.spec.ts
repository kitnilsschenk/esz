import { describe, expect, it } from 'vitest';
import { buildDeleteHostCookie, buildHostCookie, parseCookieHeader } from './cookie.util';

describe('buildHostCookie', () => {
  it('setzt Path=/, HttpOnly, Secure und den angegebenen SameSite-Wert', () => {
    const cookie = buildHostCookie('__Host-edms_rt', 'token-wert', { maxAgeSeconds: 28_800, sameSite: 'Strict' });

    expect(cookie).toBe('__Host-edms_rt=token-wert; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800');
  });

  it('unterstützt SameSite=Lax für den Vor-Auth-Cookie', () => {
    const cookie = buildHostCookie('__Host-edms_auth_tx', 'x', { maxAgeSeconds: 600, sameSite: 'Lax' });
    expect(cookie).toContain('SameSite=Lax');
  });
});

describe('buildDeleteHostCookie', () => {
  it('setzt Max-Age=0 mit denselben Sicherheits-Attributen', () => {
    const cookie = buildDeleteHostCookie('__Host-edms_rt');
    expect(cookie).toBe('__Host-edms_rt=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
  });
});

describe('parseCookieHeader', () => {
  it('parst mehrere Cookies aus einem `Cookie`-Header', () => {
    const cookies = parseCookieHeader('a=1; b=2; __Host-edms_rt=abc');
    expect(cookies).toEqual({ a: '1', b: '2', '__Host-edms_rt': 'abc' });
  });

  it('liefert ein leeres Objekt für undefined/leeren Header', () => {
    expect(parseCookieHeader(undefined)).toEqual({});
    expect(parseCookieHeader('')).toEqual({});
  });

  it('dekodiert URI-kodierte Werte', () => {
    expect(parseCookieHeader('x=a%20b')).toEqual({ x: 'a b' });
  });

  it('ignoriert fehlerhafte Segmente ohne "="', () => {
    expect(parseCookieHeader('kaputt; a=1')).toEqual({ a: '1' });
  });
});
