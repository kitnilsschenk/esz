import { HttpStatus } from '@nestjs/common';
import { ProblemDetailsException } from '../common/exceptions/problem-details.exception';
import type { NachweisFehlerCode } from './audit/nachweis-audit-events';

/**
 * `ProblemDetailsException`-Subtyp, der ZUSÄTZLICH den whitelisted,
 * PII-freien `fehlerCode` (`NACHWEIS_FEHLER_CODES`) trägt — Muster
 * `BerechnungFehlerException`: liefert dem `catch`-Block in
 * `EinsparlaufService.starten()` einen STRUKTURIERTEN Code für
 * `kontext.fehler_code` des `einsparlauf.nachweis.fehlgeschlagen`-Audit-
 * Events, OHNE `error.message` (Freitext) in den Audit-Kontext
 * durchsickern zu lassen.
 */
export class NachweisFehlerException extends ProblemDetailsException {
  constructor(
    public readonly fehlerCode: NachweisFehlerCode,
    status: HttpStatus,
    detail: string,
  ) {
    super({ status, title: status === HttpStatus.CONFLICT ? 'Conflict' : 'Bad Request', detail });
  }
}
