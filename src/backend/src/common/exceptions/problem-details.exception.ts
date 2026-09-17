import { HttpException, HttpStatus } from '@nestjs/common';

export interface ProblemDetailsOptions {
  status: HttpStatus;
  title: string;
  type?: string;
  detail?: string;
}

/**
 * Fehler mit explizitem RFC-9457-Problem-Kontext (`type`/`title`/`detail`).
 *
 * Wird vom globalen `ProblemDetailsExceptionFilter` unverändert in
 * `application/problem+json` übersetzt (.claude/rules/api-contracts.md).
 * Für Fälle, in denen ein Endpoint einen spezifischeren `type` als
 * `about:blank` braucht (z. B. `/health/ready`, siehe
 * schemas/openapi/health.openapi.yaml).
 */
export class ProblemDetailsException extends HttpException {
  public readonly problemType: string;
  public readonly problemTitle: string;
  public readonly problemDetail: string | undefined;

  constructor(options: ProblemDetailsOptions) {
    super(options.title, options.status);
    this.problemType = options.type ?? 'about:blank';
    this.problemTitle = options.title;
    this.problemDetail = options.detail;
  }
}
