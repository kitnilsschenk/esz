import { describe, expect, it } from 'vitest';
import { PiiProjektionsPolicy } from './pii-projektions.policy';
import type { SecurityContext } from '../../common/security/security-context';

function subject(overrides: Partial<SecurityContext> = {}): SecurityContext {
  return { sub: 'sub-1', actorTyp: 'benutzer', roles: ['betrieb'], azp: 'edms-bff', ...overrides };
}

describe('PiiProjektionsPolicy (ADR-0008 §18, D6 — fail-closed)', () => {
  const policy = new PiiProjektionsPolicy();

  it('betrieb bei aktivem Subjekt -> darf PII sehen', () => {
    expect(policy.darfPiiSehen(subject({ roles: ['betrieb'] }), { verarbeitungsStatus: 'aktiv' })).toBe(true);
  });

  it('betrieb bei gesperrtem Subjekt -> maskiert (fail-closed)', () => {
    expect(policy.darfPiiSehen(subject({ roles: ['betrieb'] }), { verarbeitungsStatus: 'gesperrt' })).toBe(false);
  });

  it('betrieb bei geloeschtem/geschreddertem Subjekt -> maskiert (fail-closed)', () => {
    expect(policy.darfPiiSehen(subject({ roles: ['betrieb'] }), { verarbeitungsStatus: 'geloescht' })).toBe(false);
  });

  it('compliance-auditor -> IMMER maskiert, auch bei aktivem Subjekt (Nachweissicht ohne Klartext-PII)', () => {
    expect(
      policy.darfPiiSehen(subject({ roles: ['compliance-auditor'] }), { verarbeitungsStatus: 'aktiv' }),
    ).toBe(false);
  });

  it('admin -> maskiert (admin ist KEINE Stammdaten-Rolle, DS-01/Least-Privilege)', () => {
    expect(policy.darfPiiSehen(subject({ roles: ['admin'] }), { verarbeitungsStatus: 'aktiv' })).toBe(false);
  });

  it('unbekannte/leere Rollen -> maskiert (Default-Fail-Closed)', () => {
    expect(policy.darfPiiSehen(subject({ roles: [] }), { verarbeitungsStatus: 'aktiv' })).toBe(false);
  });

  it('defensiver Rollen-Mix (betrieb + compliance-auditor gleichzeitig, sollte laut DS-01 nicht vorkommen) -> maskiert', () => {
    expect(
      policy.darfPiiSehen(subject({ roles: ['betrieb', 'compliance-auditor'] }), { verarbeitungsStatus: 'aktiv' }),
    ).toBe(false);
  });
});
