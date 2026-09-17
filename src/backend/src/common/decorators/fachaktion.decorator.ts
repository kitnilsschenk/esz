import { SetMetadata } from '@nestjs/common';
import type { PolicyAction } from '../../auth/policy/policy-decision-port';

export const FACHAKTION_KEY = 'fachaktion';

/**
 * ADR-0008 Teil B §14 (D2, Entscheidung (a)): Route-Decorator, den der
 * `PolicyInterceptor` via `Reflector.getAllAndOverride([handler, class])`
 * ausliest — konsistent zu `ROLES_KEY`/`AUDIT_ACTION_KEY`/`IS_PUBLIC_KEY`/
 * `SKIP_TRANSACTION_KEY` (`backend-lead`-Votum 8, ADR-0008 §30 A6), damit ein
 * Class-Default von einer Methode überschreibbar bleibt.
 *
 * Ersetzt für die dekorierte Route die grobe Methoden-Ableitung
 * (`METHOD_ACTION_MAP`) im `PolicyInterceptor` durch die feingranulare
 * Fach-Aktion (ADR-0008 §14 Taxonomie: `read:stammdaten`, `create:endkunde`,
 * `shred:endkunde`, ...). Routen OHNE `@Fachaktion(...)` (insbesondere die
 * bestehenden Auth-Routen, ADR-0002) bleiben UNVERÄNDERT auf der
 * Methoden-Ableitung — additive, rückwärtskompatible Erweiterung.
 */
export const Fachaktion = (action: PolicyAction): MethodDecorator & ClassDecorator =>
  SetMetadata(FACHAKTION_KEY, action);
