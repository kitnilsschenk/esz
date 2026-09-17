import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ProblemDetailsException } from '../common/exceptions/problem-details.exception';
import { HealthController } from './health.controller';
import type { HealthService } from './health.service';
import type { LivenessResult, ReadinessResult } from './health.types';

function createHealthServiceMock() {
  return {
    getLiveness: vi.fn(),
    checkReadiness: vi.fn(),
  };
}

function createController(mock: ReturnType<typeof createHealthServiceMock>): HealthController {
  return new HealthController(mock as unknown as HealthService);
}

describe('HealthController (Service gemockt, .claude/rules/backend-nestjs.md: "Controller dünn")', () => {
  describe('getLiveness', () => {
    it('gibt das Liveness-Ergebnis des Service unverändert zurück', () => {
      const mock = createHealthServiceMock();
      const liveness: LivenessResult = {
        status: 'ok',
        version: '0.1.0',
        uptimeSeconds: 12.3,
        timestamp: '2026-07-09T10:00:00.000Z',
      };
      mock.getLiveness.mockReturnValue(liveness);

      const result = createController(mock).getLiveness();

      expect(result).toBe(liveness);
      expect(mock.getLiveness).toHaveBeenCalledOnce();
    });
  });

  describe('getReadiness', () => {
    it('gibt das Readiness-Ergebnis zurück, wenn die Datenbank bereit ist (ready-Fall)', async () => {
      const mock = createHealthServiceMock();
      const readiness: ReadinessResult = {
        status: 'ok',
        checks: { database: { status: 'up', detail: 'ready' } },
        timestamp: '2026-07-09T10:00:00.000Z',
      };
      mock.checkReadiness.mockResolvedValue(readiness);

      await expect(createController(mock).getReadiness()).resolves.toBe(readiness);
    });

    it('wirft eine 503-ProblemDetailsException mit generischem Detail, wenn die Datenbank nicht bereit ist (not_ready-Fall)', async () => {
      const mock = createHealthServiceMock();
      const readiness: ReadinessResult = {
        status: 'error',
        checks: { database: { status: 'down', detail: 'not_ready' } },
        timestamp: '2026-07-09T10:00:00.000Z',
      };
      mock.checkReadiness.mockResolvedValue(readiness);
      const controller = createController(mock);

      await expect(controller.getReadiness()).rejects.toMatchObject({
        problemType: 'https://edms.example/problems/dependency-unavailable',
        problemTitle: 'Service Unavailable',
        problemDetail: 'A required dependency is not ready.',
      });

      // Zusätzlicher Instanz-/Statuscode-Check (toMatchObject prüft nur Felder,
      // keine Klassen-Identität) — Regressions-Guard gegen einen künftig
      // versehentlich generischen 500er statt des spezifischen 503ers.
      try {
        await controller.getReadiness();
        expect.unreachable('getReadiness() hätte werfen müssen');
      } catch (error) {
        expect(error).toBeInstanceOf(ProblemDetailsException);
        expect((error as ProblemDetailsException).getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      }
    });
  });
});
