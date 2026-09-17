import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ProblemDetailsException } from '../exceptions/problem-details.exception';

interface ProblemDetailsBody {
  type: string;
  title: string;
  status: number;
  detail?: string;
}

const DEFAULT_TITLES: Readonly<Record<number, string>> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

/**
 * Globaler Exception-Filter: übersetzt JEDEN Fehler nach RFC 9457
 * (`application/problem+json`, .claude/rules/api-contracts.md,
 * schemas/openapi/health.openapi.yaml `Problem`-Schema).
 *
 * Gibt NIEMALS Stacktraces oder interne Fehlertexte/Connection-Details nach
 * außen; unerwartete (nicht als `HttpException` modellierte) Fehler werden
 * generisch als 500 gemeldet. Rohdiagnose landet ausschließlich im internen
 * Log (kein PII, .claude/rules/backend-nestjs.md).
 */
@Catch()
export class ProblemDetailsExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const body = this.toProblemDetails(exception);

    if (body.status >= 500) {
      this.logger.error(
        `Unhandled error on ${request.method} ${request.url}: ${this.describe(exception)}`,
      );
    }

    response.status(body.status).type('application/problem+json').send(body);
  }

  private toProblemDetails(exception: unknown): ProblemDetailsBody {
    if (exception instanceof ProblemDetailsException) {
      return {
        type: exception.problemType,
        title: exception.problemTitle,
        status: exception.getStatus(),
        ...(exception.problemDetail !== undefined ? { detail: exception.problemDetail } : {}),
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const detail = this.extractDetail(exception.getResponse()) ?? exception.message;

      return {
        type: 'about:blank',
        title: DEFAULT_TITLES[status] ?? 'Error',
        status,
        detail,
      };
    }

    return {
      type: 'about:blank',
      title: DEFAULT_TITLES[HttpStatus.INTERNAL_SERVER_ERROR] ?? 'Error',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: 'An unexpected error occurred.',
    };
  }

  private extractDetail(response: string | object): string | undefined {
    if (typeof response === 'string') {
      return response;
    }

    if (typeof response === 'object' && response !== null && 'message' in response) {
      const { message } = response;

      if (typeof message === 'string') {
        return message;
      }

      if (Array.isArray(message)) {
        // class-validator (ValidationPipe) liefert ein Array von Fehlermeldungen.
        return message.filter((entry): entry is string => typeof entry === 'string').join('; ');
      }
    }

    return undefined;
  }

  private describe(exception: unknown): string {
    return exception instanceof Error ? exception.message : 'unknown error';
  }
}
