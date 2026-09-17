import { describe, expect, it } from 'vitest';
import { isAppRole } from './app-role';

describe('isAppRole', () => {
  it('akzeptiert die vier v1-Rollen (DS-01-getrennt + geraete-support, ADR-0005 §26.4 SEC-5)', () => {
    expect(isAppRole('betrieb')).toBe(true);
    expect(isAppRole('compliance-auditor')).toBe(true);
    expect(isAppRole('admin')).toBe(true);
    expect(isAppRole('geraete-support')).toBe(true);
  });

  it('verwirft unbekannte Realm-Rollen statt sie durchzureichen', () => {
    expect(isAppRole('sachbearbeiter')).toBe(false);
    expect(isAppRole('offline_access')).toBe(false);
    expect(isAppRole(undefined)).toBe(false);
  });
});
