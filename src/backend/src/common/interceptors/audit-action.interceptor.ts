import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Observable } from 'rxjs';
import { firstValueFrom, from } from 'rxjs';
import type { AuditActionMetadata, AuditExtractionContext, AuditKontextValue } from '../decorators/audit-action.decorator';
import { AUDIT_ACTION_KEY } from '../decorators/audit-action.decorator';
import type { AuthenticatedRequest } from '../security/authenticated-request';
import type { AuditErgebnis } from '../security/audit-ergebnis';
import { AuditService } from '../../audit/audit.service';
import { AUTH_EVENT_CODES } from '../../audit/audit-event-codes';

/**
 * Zweit-äußerster globaler Interceptor (ADR-0002 Teil B §15). Liegt
 * ZWISCHEN `TransactionInterceptor` (außen) und `PolicyInterceptor`
 * (innen) — genau das macht Konflikt A lösbar: eine `ForbiddenException`
 * aus dem `PolicyInterceptor` (RBAC/ABAC-Denial) läuft durch `next.handle()`
 * dieses Interceptors und wird HIER gefangen (`catch`), NICHT irgendwo
 * unsichtbar für die Audit-Kette.
 *
 * Routen OHNE `@AuditAction(...)` werden nicht mehr blind durchgereicht:
 * eine `ForbiddenException` (PolicyInterceptor-Denial) wird über den
 * generischen Katalog-Fallback-Code `authz.zugriff.verweigert` auditiert
 * (M2-Lücke aus V0004-Migrationskopf geschlossen — reine Lese-Routen ohne
 * `@AuditAction` hätten sonst KEINEN Emit-Pfad für ihre 403en). Erfolgsfälle
 * bleiben auf nicht-dekorierten Routen weiterhin UNAUDITIERT (kein
 * Objekt-/Ereignis-Bezug ohne `@AuditAction` — das bleibt bewusst dem
 * Decorator vorbehalten, `.claude/rules/backend-nestjs.md`: Decorator nur
 * auf state-ändernden Methoden Pflicht).
 *
 * Login/Callback/Refresh/Logout bleiben die dokumentierte Ausnahme
 * (`AuthService` ruft `AuditService.append()` dort direkt auf,
 * `backend-lead`-Votum F2) — sie sind `@Public()` und erreichen den
 * `PolicyInterceptor` (und damit dieses Fallback-Risiko) gar nicht erst.
 */
@Injectable()
export class AuditActionInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const metadata = this.reflector.getAllAndOverride<AuditActionMetadata | undefined>(AUDIT_ACTION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (metadata !== undefined) {
      return from(this.runWithAudit(context, next, metadata));
    }

    return from(this.runWithForbiddenFallback(context, next));
  }

  /**
   * M2-Fallback für Routen OHNE `@AuditAction(...)`: eine `ForbiddenException`
   * (aus `PolicyInterceptor`, Konflikt A) wird über den reservierten
   * Katalog-Code `authz.zugriff.verweigert` (V0004, `objekt_typ=
   * authz_entscheidung`, `rolle_erfassen=true`) auditiert, bevor sie
   * weitergeworfen wird. Jeder andere Fehler (kein AuthZ-Entscheid) läuft
   * unverändert durch — dieser Fallback deckt AUSSCHLIESSLICH die M2-Lücke
   * ("jede abgelehnte AuthZ-Entscheidung ist auditiert"), nicht beliebige
   * Fehler auf nicht-instrumentierten Routen.
   */
  private async runWithForbiddenFallback(context: ExecutionContext, next: CallHandler): Promise<unknown> {
    try {
      return await firstValueFrom(next.handle());
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
        await this.emitGenericAuthzDenial(request);
      }
      throw error;
    }
  }

  /**
   * `grund` ist bewusst ein FESTER, whitelisted Code — NICHT `error.message`:
   * `ForbiddenException` kann grundsätzlich von JEDEM künftigen Code mit
   * beliebigem Freitext geworfen werden (nicht nur vom kontrollierten
   * `PolicyInterceptor`), ein direktes Übernehmen der Exception-Message in
   * `kontext.grund` wäre daher ein potenzielles PII-/Freitext-Einfallstor
   * (rote Linie 2). `route_muster` ist die Express-ROUTENVORLAGE
   * (`request.route.path`, z. B. `/stammdaten/kunde/:id`) — NIEMALS die
   * interpolierte, ggf. personenbeziehbare reale URL.
   */
  private async emitGenericAuthzDenial(request: AuthenticatedRequest): Promise<void> {
    const securityContext = request.securityContext;

    if (securityContext === undefined) {
      // Rote Linie 1: ohne validierten SecurityContext KEIN Audit-Emit.
      return;
    }

    await this.auditService.append({
      eventTyp: AUTH_EVENT_CODES.ZUGRIFF_VERWEIGERT,
      actorTyp: securityContext.actorTyp,
      actorSub: securityContext.sub,
      ergebnis: 'denied',
      // `rolle_erfassen=true` für diesen Code (V0004) — bei mehreren
      // gemappten Rollen werden alle kommagetrennt erfasst (kontrolliertes
      // Vokabular je Segment, kein Freitext).
      ...(securityContext.roles.length > 0 ? { actorRolle: securityContext.roles.join(',') } : {}),
      kontext: {
        grund: 'policy_ablehnung_ausserhalb_auditaction',
        route_muster: this.extractRoutePattern(request),
      },
      ...(request.korrelationsId !== undefined ? { korrelationsId: request.korrelationsId } : {}),
    });
  }

  private extractRoutePattern(request: AuthenticatedRequest): string {
    const candidate: unknown = (request as unknown as { route?: unknown }).route;
    if (typeof candidate === 'object' && candidate !== null && 'path' in candidate) {
      // TS engt `candidate` durch den `in`-Check bereits auf einen Typ mit
      // `path: unknown` ein — kein zusätzlicher Cast nötig.
      const { path } = candidate;
      if (typeof path === 'string') {
        return path;
      }
    }

    return 'unbekannt';
  }

  private async runWithAudit(
    context: ExecutionContext,
    next: CallHandler,
    metadata: AuditActionMetadata,
  ): Promise<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    try {
      // `CallHandler.handle()` ist Nest-seitig `Observable<any>` (generischer
      // Handler-Rückgabewert) — explizit auf `unknown` typisiert, damit
      // `any` nicht in den Audit-Extraktionskontext/Rückgabewert
      // durchsickert (keine Suppression, echte Typisierung).
      const result: unknown = await firstValueFrom(next.handle());
      await this.emit(metadata, 'ok', request, { request, result, error: undefined });
      return result;
    } catch (error: unknown) {
      const ergebnis = this.resolveErgebnis(error, metadata);
      await this.emit(metadata, ergebnis, request, { request, result: undefined, error });
      throw error;
    }
  }

  private resolveErgebnis(error: unknown, metadata: AuditActionMetadata): AuditErgebnis {
    if (metadata.ergebnisMapping !== undefined) {
      return metadata.ergebnisMapping(error);
    }

    return error instanceof ForbiddenException ? 'denied' : 'error';
  }

  private async emit(
    metadata: AuditActionMetadata,
    ergebnis: AuditErgebnis,
    request: AuthenticatedRequest,
    extractionCtx: AuditExtractionContext,
  ): Promise<void> {
    const securityContext = request.securityContext;

    if (securityContext === undefined) {
      // Rote Linie 1: ohne validierten SecurityContext KEIN Audit-Emit.
      // Strukturell sollte dies nie eintreten (JwtAuthGuard läuft vorher
      // und liefert für jede nicht-@Public-Route entweder 401 oder einen
      // SecurityContext) — fail-closed heißt hier: kein Emit statt eines
      // Emits mit erfundenem Akteur.
      return;
    }

    const objektRef = metadata.objektRefExtractor?.(extractionCtx);
    const kontext = this.buildKontext(metadata, extractionCtx);

    await this.auditService.append({
      eventTyp: metadata.eventTyp,
      actorTyp: securityContext.actorTyp,
      actorSub: securityContext.sub,
      ergebnis,
      ...(objektRef !== undefined ? { objektRef } : {}),
      ...(kontext !== undefined ? { kontext } : {}),
      ...(request.korrelationsId !== undefined ? { korrelationsId: request.korrelationsId } : {}),
    });
  }

  private buildKontext(
    metadata: AuditActionMetadata,
    extractionCtx: AuditExtractionContext,
  ): Record<string, AuditKontextValue> | undefined {
    if (metadata.kontextExtractors === undefined) {
      return undefined;
    }

    const kontext: Record<string, AuditKontextValue> = {};
    for (const [key, extractor] of Object.entries(metadata.kontextExtractors)) {
      const value = extractor(extractionCtx);
      if (value !== undefined) {
        kontext[key] = value;
      }
    }

    return kontext;
  }
}
