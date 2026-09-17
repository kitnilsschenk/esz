import { describe, expect, it } from 'vitest';
import { isActorTyp, isTokenActorTyp } from './actor-typ';

describe('isTokenActorTyp', () => {
  it('akzeptiert "benutzer" und "dienstkonto"', () => {
    expect(isTokenActorTyp('benutzer')).toBe(true);
    expect(isTokenActorTyp('dienstkonto')).toBe(true);
  });

  it('lehnt "system" ab (rote Linie 1 — kein gültiger Token-Claim-Wert)', () => {
    expect(isTokenActorTyp('system')).toBe(false);
  });

  it('lehnt fehlende/unbekannte Werte fail-closed ab', () => {
    expect(isTokenActorTyp(undefined)).toBe(false);
    expect(isTokenActorTyp('')).toBe(false);
    expect(isTokenActorTyp('admin')).toBe(false);
    expect(isTokenActorTyp(42)).toBe(false);
  });
});

describe('isActorTyp', () => {
  it('akzeptiert alle drei Envelope-Werte inkl. "system"', () => {
    expect(isActorTyp('benutzer')).toBe(true);
    expect(isActorTyp('dienstkonto')).toBe(true);
    expect(isActorTyp('system')).toBe(true);
  });

  it('lehnt unbekannte Werte ab', () => {
    expect(isActorTyp('unbekannt')).toBe(false);
  });
});
