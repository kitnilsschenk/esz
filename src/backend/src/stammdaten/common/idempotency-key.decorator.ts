import { HttpStatus, createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { ProblemDetailsException } from '../../common/exceptions/problem-details.exception';

const MIN_LENGTH = 8;
const MAX_LENGTH = 200;

/**
 * api-contracts.md: "Alle schreibenden Operationen unterstützen einen
 * `Idempotency-Key`-Header" (Pflicht-Header, `stammdaten.openapi.yaml`
 * `#/components/parameters/IdempotencyKey`). Diese Implementierung deckt
 * PRÄSENZ + FORMAT (8-200 Zeichen) ab — 400 `problem+json` bei
 * fehlendem/ungültigem Header.
 *
 * OFFENER PUNKT (an `backend-lead`/`qa-lead` zur Review, s. finale Antwort
 * dieses Arbeitspakets): eine ECHTE Replay-Deduplizierung (derselbe Key
 * liefert exakt dieselbe vorherige Antwort, ohne den Effekt zu duplizieren)
 * braucht einen persistenten Idempotency-Store (eigene Tabelle/Migration) —
 * das ist NICHT Teil dieses Pakets (kein Schreibzugriff auf `migrations/**`
 * in diesem Arbeitspaket). Die Referenzkonsistenz-/EXCLUDE-/UNIQUE-basierten
 * Konflikt-Antworten (409) der jeweiligen Ressourcen mindern das Risiko
 * unbeabsichtigter Doppel-Anlage bereits strukturell.
 */
export const IdempotencyKey = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<Request>();
  const header = request.headers['idempotency-key'];
  const value = Array.isArray(header) ? header[0] : header;

  if (value === undefined || value.length < MIN_LENGTH || value.length > MAX_LENGTH) {
    throw new ProblemDetailsException({
      status: HttpStatus.BAD_REQUEST,
      title: 'Bad Request',
      detail: 'Der Idempotency-Key-Header fehlt oder hat ein ungueltiges Format (8-200 Zeichen erforderlich).',
    });
  }

  return value;
});
