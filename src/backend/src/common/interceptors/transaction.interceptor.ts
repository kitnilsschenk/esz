import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Propagation, TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import type { Observable } from 'rxjs';
import { catchError, firstValueFrom, from, map, of } from 'rxjs';
import { SKIP_TRANSACTION_KEY } from '../decorators/skip-transaction.decorator';

type Outcome<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: unknown };

/**
 * Äußerster globaler Interceptor (ADR-0002 Teil B §15, Konflikt B).
 * Öffnet für JEDEN Request OHNE `@SkipTransaction()` eine
 * `Propagation.Required`-Transaktion über `nestjs-cls`/
 * `@nestjs-cls/transactional` (TypeORM-Adapter) — der ambiente
 * `EntityManager` dieser Transaktion ist danach über `TransactionHost.tx`
 * für ALLE nachgelagerten Schichten sichtbar (u. a. `AuditService.append()`,
 * §17.1).
 *
 * Scoping-Kriterium (Regression-Fix, s. finale Antwort dieses Arbeitspakets):
 * Default bleibt "Transaktion öffnen" — NUR Routen mit explizitem
 * `@SkipTransaction()` (aktuell ausschließlich `HealthController`) werden
 * unverändert durchgereicht. BEWUSST NICHT an `@Public()` gekoppelt: die
 * BFF-Auth-Endpunkte (`/auth/login` u. a.) sind ebenfalls `@Public()`,
 * brauchen aber weiterhin die ambiente Transaktion für ihren direkten
 * `AuditService.append()`-Aufruf (`backend-lead`-Votum F2). Der "Default
 * öffnen"-Ansatz ist zusätzlich robust gegen den `AuditActionInterceptor`-
 * M2-Fallback (`authz.zugriff.verweigert` auf nicht-`@AuditAction`-Routen):
 * dieser Fallback kann auf JEDER geschützten Route feuern, nicht nur auf
 * explizit markierten — ein "nur bei @AuditAction/@Roles öffnen"-Kriterium
 * hätte genau diesen Fall verpasst und die Audit-Zeile stumm verloren.
 *
 * Fehler aus der gesamten nachgelagerten Kette (`AuditActionInterceptor` ->
 * `PolicyInterceptor` -> Handler) werden HIER bewusst NICHT als Promise-
 * Rejection an `withTransaction()` durchgereicht — sonst würde
 * `@nestjs-cls/transactional` die GESAMTE äußere Transaktion zurückrollen
 * und damit die vom `AuditActionInterceptor` bereits geschriebene
 * `denied`/`error`-Audit-Zeile mit vernichten (exakt Konflikt B). Stattdessen
 * wird der Fehler in einen normalen `Outcome`-Wert verpackt (`catchError` VOR
 * `firstValueFrom`), sodass das `withTransaction()`-Promise reibungslos
 * AUFLÖST — die äußere Transaktion committet (Audit persistiert) — und der
 * Fehler ERST NACH dem Commit, außerhalb der Transaktion, erneut geworfen
 * wird (`map()`-Schritt nach `from(...)`). So erreicht der Fehler weiterhin
 * den globalen `ProblemDetailsExceptionFilter` (403/500), ohne den bereits
 * committeten Audit-Beweis zu gefährden.
 */
@Injectable()
export class TransactionInterceptor implements NestInterceptor {
  constructor(
    private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const skip = this.reflector.getAllAndOverride<boolean | undefined>(SKIP_TRANSACTION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skip === true) {
      // Liveness-/Readiness-Antworten dürfen NICHT vom erfolgreichen Öffnen
      // einer Transaktion abhängen — sonst würde eine tote DB bereits das
      // BEGIN scheitern lassen (roher 500 über den ProblemDetailsFilter),
      // BEVOR `HealthService` seine eigene, kontrollierte 503-Antwort
      // (separater `pg.Pool`, catch -> 503) überhaupt ausführen kann.
      return next.handle();
    }

    return from(
      this.txHost.withTransaction(Propagation.Required, () =>
        firstValueFrom(
          next.handle().pipe(
            map((value): Outcome<unknown> => ({ ok: true, value })),
            catchError((error: unknown) => of<Outcome<unknown>>({ ok: false, error })),
          ),
        ),
      ),
    ).pipe(
      map((outcome) => {
        if (!outcome.ok) {
          // Wird ausserhalb von withTransaction() geworfen -> KEIN Rollback
          // der bereits committeten äußeren Transaktion mehr möglich.
          throw outcome.error;
        }

        return outcome.value;
      }),
    );
  }
}
