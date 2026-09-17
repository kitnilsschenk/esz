import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import type { DependencyCheck, LivenessResult, ReadinessResult } from './health.types';

// TODO(AP4/AP5): mit package.json/OpenAPI-info.version synchron halten, bis es
// eine gemeinsame Versionsquelle gibt (siehe schemas/openapi/health.openapi.yaml).
const SERVICE_VERSION = '0.1.0';

/**
 * HealthService (ADR-0001 §10.7, backend-lead-Votum 3).
 *
 * Der DB-Check läuft ausschließlich hier — NICHT im Controller. Rohe
 * DB-/Netzwerk-Fehler (die Connection-Strings oder Netzwerktopologie
 * preisgeben könnten) werden NIEMALS an den Aufrufer durchgereicht; nach
 * außen gibt es nur die generischen Tokens `ready`/`not_ready`
 * (backend-lead-Finding "hoch", Topologie-/PII-Leak-Schutz). Die Rohdiagnose
 * landet ausschließlich im internen Log.
 */
@Injectable()
export class HealthService implements OnModuleDestroy {
  private readonly logger = new Logger(HealthService.name);
  private pool: Pool | undefined;

  getLiveness(): LivenessResult {
    return {
      status: 'ok',
      version: SERVICE_VERSION,
      uptimeSeconds: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  async checkReadiness(): Promise<ReadinessResult> {
    const database = await this.checkDatabase();

    return {
      status: database.status === 'up' ? 'ok' : 'error',
      checks: { database },
      timestamp: new Date().toISOString(),
    };
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }

  private async checkDatabase(): Promise<DependencyCheck> {
    try {
      await this.getPool().query('SELECT 1');
      return { status: 'up', detail: 'ready' };
    } catch (error) {
      // Interne Diagnose ausschließlich ins Log — die API-Antwort bleibt
      // generisch (kein Connection-String/keine Netzwerktopologie nach außen).
      this.logger.error(
        `Database readiness check failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return { status: 'down', detail: 'not_ready' };
    }
  }

  /**
   * Lazy-initialisierter Pool — verbindet ausschließlich über `DATABASE_URL`
   * (ENV), keine Verbindungs-Details im Code. Kleiner
   * `connectionTimeoutMillis`, damit ein Down-DB-Fall die Readiness-Antwort
   * nicht unnötig lange blockiert (M1-Budget, ADR-0001).
   */
  private getPool(): Pool {
    if (!this.pool) {
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 1,
        connectionTimeoutMillis: 2_000,
        idleTimeoutMillis: 10_000,
      });

      // Verhindert einen unbehandelten 'error'-Event-Crash bei Idle-Client-
      // Fehlern zwischen Requests; der nächste checkReadiness()-Aufruf
      // spiegelt den aktuellen DB-Zustand ohnehin neu wider.
      this.pool.on('error', (error: Error) => {
        this.logger.error(`Idle database connection error: ${error.message}`);
      });
    }

    return this.pool;
  }
}
