import { Injectable, Logger } from '@nestjs/common';
import type { AlertPort, GeraetReverseAlertPayload } from './geraet-reverse-alert.port';

/**
 * Dev-Adapter für `AlertPort` (ADR-0005 §26.4 SEC-5 (e)) — analog
 * `SecurityLoggerService` (strukturiertes `Logger.warn`, kein `pino` als
 * neue Dependency). Prod-Adapter (später, NICHT Teil dieses Pakets): reales
 * Alerting-/SIEM-System.
 *
 * RL-2: gibt AUSSCHLIESSLICH die whitelisted `GeraetReverseAlertPayload`-
 * Felder aus — niemals DevEUI/Blind-Index/Chiffrat.
 */
@Injectable()
export class LogGeraetReverseAlertAdapter implements AlertPort {
  private readonly logger = new Logger('GeraetReverseAlert');

  // Arrow-Klassenfeld statt Methode — vermeidet `@typescript-eslint/
  // unbound-method` beim Mocken in Tests (analog `AuditService.append`).
  emit = (payload: GeraetReverseAlertPayload): void => {
    const entry: Record<string, unknown> = {
      alert: 'geraet_zuordnung.reverse_aufgeloest.permit',
      actorSub: payload.actorSub,
      zaehlerId: payload.zaehlerId,
      zweck: payload.zweck,
      ticketRef: payload.ticketRef,
      zeitpunkt: payload.zeitpunkt,
    };

    this.logger.warn(JSON.stringify(entry));
  };
}
