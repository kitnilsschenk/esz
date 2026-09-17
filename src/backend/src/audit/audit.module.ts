import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

/**
 * Global, damit `AuditService` ohne Re-Export in jedem Fach-Modul verfügbar
 * ist (analog zu `PersistenceModule`s `ClsModule`) — der einzige
 * App-Schreibpfad auf `audit.event` soll überall friktionslos injizierbar
 * sein (ADR-0003 §17.1).
 */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
