import { describe, expect, it } from 'vitest';
import { classifyAction } from './classify-action';
import type { PolicyAction } from './policy-decision-port';

/**
 * PDP-Blocker 1 (ADR-0008 §14/§30) — Regressionstest für die
 * Kategorie-Klassifikation. Belegt, dass ALLE additiven Fachaktionen korrekt
 * kategorisiert werden (kein Literalvergleich, `startsWith`-Präfix-Logik).
 */
describe('classifyAction (ADR-0008 §14, PDP-Blocker 1)', () => {
  it.each<[PolicyAction, ReturnType<typeof classifyAction>]>([
    ['read', 'read'],
    ['read:stammdaten', 'read'],
    ['read:monitoring', 'read'],
    ['read:verbrauch_detail', 'read'],
    ['read:verbrauch_aggregat', 'read'],
    ['write', 'write'],
    ['create:endkunde', 'write'],
    ['create:system', 'write'],
    ['create:zaehler', 'write'],
    ['create:messkanal', 'write'],
    ['create:messkonzept_version', 'write'],
    ['create:anschlussnutzer', 'write'],
    ['create:nutzungsverhaeltnis', 'write'],
    ['update:endkunde', 'write'],
    ['update:system', 'write'],
    ['update:zaehler', 'write'],
    ['update:messkanal', 'write'],
    ['update:nutzungsverhaeltnis', 'write'],
    ['delete', 'delete'],
    // ADR-0007 C8: die Art.-18-Sperre heisst nicht mehr `delete:endkunde`.
    // `sperren:*` faellt in den Default-Zweig und damit auf `write` (vorher
    // `delete`). Beide Kategorien sind NICHT-`read` — die DS-01-Regel in
    // `InCodePolicyAdapter` entscheidet daher unveraendert (dort getestet).
    ['sperren:endkunde', 'write'],
    ['delete:zaehler', 'delete'],
    ['delete:messkanal', 'delete'],
    ['shred:endkunde', 'shred'],
    ['shred:anschlussnutzer', 'shred'],
  ])('klassifiziert %s als %s', (action, expected) => {
    expect(classifyAction(action)).toBe(expected);
  });
});
