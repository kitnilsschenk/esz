import { HttpStatus } from '@nestjs/common';
import { ProblemDetailsException } from '../common/exceptions/problem-details.exception';
import type { BerechnungFehlerCode } from './audit/berechnung-audit-events';

/**
 * `ProblemDetailsException`-Subtyp, der ZUSÄTZLICH den whitelisted,
 * PII-freien `fehlerCode` (`BERECHNUNG_FEHLER_CODES`) trägt — der einzige
 * Zweck ist, dem `catch`-Block in `BerechnungslaufService.starten()` einen
 * STRUKTURIERTEN Code für `kontext.fehler_code` des
 * `berechnungslauf.bereinigung.fehlgeschlagen`-Audit-Events zu liefern,
 * OHNE `error.message` (Freitext, rote Linie 2) in den Audit-Kontext
 * durchsickern zu lassen.
 */
export class BerechnungFehlerException extends ProblemDetailsException {
  constructor(
    public readonly fehlerCode: BerechnungFehlerCode,
    status: HttpStatus,
    detail: string,
  ) {
    super({ status, title: status === HttpStatus.CONFLICT ? 'Conflict' : 'Bad Request', detail });
  }
}
