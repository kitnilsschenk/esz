import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { map } from 'rxjs';
import type { AuthenticatedRequest } from '../../common/security/authenticated-request';
import { SyntheticOnlyConfigService } from './synthetic-only.config';

/**
 * ADR-0008 §22 (D10, `security-lead`-Votum 12 — PFLICHT, nicht optional).
 * Wird EXPLIZIT per `@UseInterceptors(SyntheticOnlyInterceptor)` auf jeder
 * PII-Schreibroute angewendet (Endkunde anlegen/ändern/sperren/
 * kryptoshredding, Anschlussnutzer anlegen) — bewusst NICHT global
 * (`APP_INTERCEPTOR`), um KEINE fragile, modulübergreifende Interceptor-
 * Reihenfolge (relativ zu `TransactionInterceptor`/`AuditActionInterceptor`/
 * `PolicyInterceptor` aus `AppModule`) vorauszusetzen: methodenlokale
 * `@UseInterceptors(...)` sind IMMER die innerste Schicht (direkt vor dem
 * Handler) — jede geworfene `ForbiddenException` durchläuft damit garantiert
 * den `AuditActionInterceptor` (→ `denied`, auditiert) und den
 * `TransactionInterceptor` (→ die Audit-Zeile committet trotz Deny).
 *
 * Zwei Aufgaben:
 *   1. Fail-closed sperren: ist `EDMS_SYNTHETIC_ONLY=false` (Real-PII-Betrieb
 *      ohne Gate-Freigabe — in diesem Codestand ohnehin bereits am
 *      `SyntheticOnlyConfigService`-Startup-Self-Check gescheitert, s. dort),
 *      wird der PII-Schreibpfad zusätzlich zur Laufzeit gesperrt (Defense-in-
 *      Depth).
 *   2. `kontext.synthetic=true` als PFLICHT-Audit-Tag setzen (ADR-0008 §22:
 *      "kontext.synthetic gehört zur erlaubte_kontext_keys-Whitelist der
 *      betroffenen Fach-Event-Typen") — über `request.synthetic`, das die
 *      jeweilige `@AuditAction`-`kontextExtractors`-Funktion ausliest.
 */
@Injectable()
export class SyntheticOnlyInterceptor implements NestInterceptor {
  constructor(private readonly config: SyntheticOnlyConfigService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.config.syntheticOnly) {
      throw new ForbiddenException('synthetic_only_gate_geschlossen');
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.synthetic = true;

    return next.handle().pipe(map((value: unknown) => value));
  }
}
