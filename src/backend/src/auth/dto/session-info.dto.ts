import type { ActorTyp } from '../../common/security/actor-typ';
import type { AppRole } from '../../common/security/app-role';

/**
 * Response-DTO für `GET /auth/session` (`SessionInfo` in `auth.openapi.yaml`).
 * Ausschließlich aus dem validierten `SecurityContext` befüllt — kein
 * Entity-Leak, keine Klartext-PII (`name` bleibt in v1 unbefüllt,
 * Datensparsamkeit Art. 5(1)(c)).
 */
export class SessionInfoDto {
  readonly sub: string;
  readonly actorTyp: ActorTyp;
  readonly roles: readonly AppRole[];
  readonly name?: string;

  constructor(input: { sub: string; actorTyp: ActorTyp; roles: readonly AppRole[]; name?: string }) {
    this.sub = input.sub;
    this.actorTyp = input.actorTyp;
    this.roles = input.roles;
    if (input.name !== undefined) {
      this.name = input.name;
    }
  }
}
