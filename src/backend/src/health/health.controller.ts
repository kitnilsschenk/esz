import { Controller, Get, HttpStatus } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { SkipTransaction } from '../common/decorators/skip-transaction.decorator';
import { ProblemDetailsException } from '../common/exceptions/problem-details.exception';
import { HealthService } from './health.service';
import type { LivenessResult, ReadinessResult } from './health.types';

/**
 * HealthController (ADR-0001 §10.7). Dünner Controller — ruft ausschließlich
 * den `HealthService`, keine eigene DB-/Fachlogik (.claude/rules/backend-nestjs.md).
 * Response-Shapes exakt nach schemas/openapi/health.openapi.yaml.
 *
 * `@SkipTransaction()` (ADR-0002 Teil B §15, Regression-Fix AP-BCD): die
 * Liveness-/Readiness-Antwort hängt AUSSCHLIESSLICH vom eigenen, separaten
 * `pg.Pool` in `HealthService` ab — der global geöffnete
 * `TransactionInterceptor` würde bei toter DB bereits am `BEGIN` scheitern
 * (roher 500) und `HealthService`s kontrollierte 503-Antwort nie erreichen.
 */
@Controller('health')
@SkipTransaction()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  getLiveness(): LivenessResult {
    return this.healthService.getLiveness();
  }

  @Public()
  @Get('ready')
  async getReadiness(): Promise<ReadinessResult> {
    const result = await this.healthService.checkReadiness();

    if (result.status !== 'ok') {
      // Wortlaut identisch zum `dbDown`-Beispiel in health.openapi.yaml.
      throw new ProblemDetailsException({
        status: HttpStatus.SERVICE_UNAVAILABLE,
        type: 'https://edms.example/problems/dependency-unavailable',
        title: 'Service Unavailable',
        detail: 'A required dependency is not ready.',
      });
    }

    return result;
  }
}
