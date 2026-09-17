import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Markiert eine Route (oder einen ganzen Controller) als öffentlich, d. h.
 * ohne AuthN/AuthZ-Prüfung erreichbar.
 *
 * ACHTUNG (ADR-0001 §10.7): Der global registrierte `DenyByDefaultGuard` ist
 * ein reiner Deny-by-default-STUB, KEIN echtes AuthN/AuthZ. Er lässt nur
 * Routen mit diesem Decorator durch (aktuell ausschließlich `/health` und
 * `/health/ready`). Die echte OIDC-Token-Validierung sowie RBAC/ABAC-Policies
 * (access-control-engineer) folgen mit ADR-0002 und ersetzen den Guard
 * vollständig — `@Public()` bleibt danach nur für tatsächlich öffentliche
 * Endpunkte (Liveness/Readiness-artig) vorgesehen, nicht als genereller Bypass.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
