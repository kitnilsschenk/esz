import { describe, expect, it } from 'vitest';
import { standortRoutes } from './standortRoutes';

describe('standortRoutes', () => {
  it('registriert weiterhin die Sub-Ressourcen-Route EINES Endkunden — der Deep-Link aus `EndkundeDetailAnsicht`s „Standorte anzeigen"-Link bleibt gültig', () => {
    expect(standortRoutes.some((route) => route.path === '/stammdaten/endkunden/:endkundeId/standorte')).toBe(true);
  });

  it('registriert zusätzlich den neuen globalen Einstiegspunkt (Auffindbarkeits-Nachtrag)', () => {
    expect(standortRoutes.some((route) => route.path === '/stammdaten/standorte')).toBe(true);
  });
});
