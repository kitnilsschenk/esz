import { Injectable } from '@nestjs/common';
import { APP_ROLES } from '../../common/security/app-role';
import type { AppRole } from '../../common/security/app-role';
import type { KeycloakAccessTokenClaims } from '../jwt/keycloak-claims';
import { AuthConfigService } from '../auth.config';

/**
 * Reine Mapping-Funktion Claims -> AppRole[] (ADR-0002 Teil B §11,
 * `backend-lead`-Votum 4): dediziert, NICHT im Guard/Decorator. Quelle:
 * `realm_access.roles` + `resource_access[<bff-client>].roles` -> internes
 * Vokabular `betrieb`/`compliance-auditor`/`admin`. Unbekannte Realm-Rollen
 * werden VERWORFEN (nicht durchgereicht) — `APP_ROLES.filter(...)` ist
 * dafür strukturell die richtige Richtung (Whitelist statt Blacklist).
 */
@Injectable()
export class RolesMapperService {
  constructor(private readonly config: AuthConfigService) {}

  // Arrow-Klassenfeld statt Methode — vermeidet `@typescript-eslint/
  // unbound-method` beim Mocken in Tests (`expect(rolesMapper.map)
  // .toHaveBeenCalled()`), ohne die Regel zu unterdrücken (`map` hat keine
  // `this`-Bindungsgefahr, s. `access-token-verifier.service.ts`).
  map = (claims: KeycloakAccessTokenClaims): AppRole[] => {
    const realmRoles = claims.realm_access?.roles ?? [];
    const clientRoles = claims.resource_access?.[this.config.clientId]?.roles ?? [];
    const combined = new Set<string>([...realmRoles, ...clientRoles]);

    return APP_ROLES.filter((role) => combined.has(role));
  };
}
