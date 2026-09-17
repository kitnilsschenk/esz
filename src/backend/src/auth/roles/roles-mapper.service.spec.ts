import { beforeEach, describe, expect, it } from 'vitest';
import { RolesMapperService } from './roles-mapper.service';
import { AuthConfigService } from '../auth.config';

function setRequiredEnv(): void {
  process.env['KEYCLOAK_ISSUER_URL'] = 'http://localhost:8080/realms/edms';
  process.env['OIDC_CLIENT_ID'] = 'edms-bff';
  process.env['EDMS_BFF_CLIENT_SECRET'] = 'test-secret';
  process.env['OIDC_REDIRECT_URI'] = 'http://localhost:3000/auth/callback';
}

describe('RolesMapperService', () => {
  let mapper: RolesMapperService;

  beforeEach(() => {
    setRequiredEnv();
    mapper = new RolesMapperService(new AuthConfigService());
  });

  it('mappt realm_access.roles auf das interne Vokabular', () => {
    const roles = mapper.map({ realm_access: { roles: ['betrieb', 'admin'] } });
    expect(roles).toEqual(['betrieb', 'admin']);
  });

  it('mappt resource_access[<bff-client>].roles zusätzlich zu realm_access', () => {
    const roles = mapper.map({
      realm_access: { roles: ['betrieb'] },
      resource_access: { 'edms-bff': { roles: ['compliance-auditor'] } },
    });
    expect(roles).toEqual(expect.arrayContaining(['betrieb', 'compliance-auditor']));
    expect(roles).toHaveLength(2);
  });

  it('verwirft unbekannte Realm-Rollen statt sie durchzureichen (DS-01-Grundlage)', () => {
    const roles = mapper.map({ realm_access: { roles: ['betrieb', 'offline_access', 'uma_authorization'] } });
    expect(roles).toEqual(['betrieb']);
  });

  it('ignoriert resource_access-Einträge anderer Clients', () => {
    const roles = mapper.map({
      resource_access: { 'anderer-client': { roles: ['admin'] } },
    });
    expect(roles).toEqual([]);
  });

  it('liefert eine leere Liste ohne realm_access/resource_access', () => {
    expect(mapper.map({})).toEqual([]);
  });

  it('depliziert Rollen nicht, wenn dieselbe Rolle in beiden Quellen vorkommt', () => {
    const roles = mapper.map({
      realm_access: { roles: ['betrieb'] },
      resource_access: { 'edms-bff': { roles: ['betrieb'] } },
    });
    expect(roles).toEqual(['betrieb']);
  });
});
