import { HttpStatus } from '@nestjs/common';
import { ProblemDetailsException } from '../../common/exceptions/problem-details.exception';

/** RFC 9457 `problem+json` — PII-frei, kein Stacktrace (DS-10, api-contracts.md). */
export function nichtGefunden(entitaet: string): ProblemDetailsException {
  return new ProblemDetailsException({
    status: HttpStatus.NOT_FOUND,
    title: 'Not Found',
    detail: `${entitaet} wurde nicht gefunden.`,
  });
}

export function konflikt(detail: string): ProblemDetailsException {
  return new ProblemDetailsException({ status: HttpStatus.CONFLICT, title: 'Conflict', detail });
}

export function ungueltigeEingabe(detail: string): ProblemDetailsException {
  return new ProblemDetailsException({ status: HttpStatus.BAD_REQUEST, title: 'Bad Request', detail });
}
