import { describe, expect, it, vi } from 'vitest';
import { SubstitutionErkennungService } from './substitution-erkennung';
import type { EnergyMesskonzeptRepository } from '../stammdaten/persistence/energy/energy-messkonzept.repository';

/**
 * Unit-Test (Repo-Fake) — belegt, dass `SubstitutionErkennungService`
 * AUSSCHLIESSLICH `EnergyMesskonzeptRepository.findAktuelleSubstitution()`
 * delegiert (die reale Fallunterscheidung/DB-Logik ist dort getestet, s.
 * `einsparlauf.integration.spec.ts` „ADR-0007 O-B3b"). Ersetzt den
 * vormaligen Stub-Test (immer `false`) — der Stub existiert nicht mehr.
 */
describe('SubstitutionErkennungService (ADR-0007 B13.4/B14/O-B3b)', () => {
  it('pruefen() delegiert 1:1 an EnergyMesskonzeptRepository.findAktuelleSubstitution()', async () => {
    const findAktuelleSubstitution = vi.fn(() => Promise.resolve(true));
    const messkonzeptRepo = { findAktuelleSubstitution } as unknown as EnergyMesskonzeptRepository;
    const service = new SubstitutionErkennungService(messkonzeptRepo);

    const ergebnis = await service.pruefen('endkunde-1', 'gas');

    expect(ergebnis).toBe(true);
    expect(findAktuelleSubstitution).toHaveBeenCalledWith('endkunde-1', 'gas');
  });

  it('pruefen() liefert false, wenn kein Merkmal bekannt ist (identische Fallback-Semantik wie der vormalige Stub)', async () => {
    const findAktuelleSubstitution = vi.fn(() => Promise.resolve(false));
    const messkonzeptRepo = { findAktuelleSubstitution } as unknown as EnergyMesskonzeptRepository;
    const service = new SubstitutionErkennungService(messkonzeptRepo);

    await expect(service.pruefen('endkunde-1', 'strom')).resolves.toBe(false);
  });
});
