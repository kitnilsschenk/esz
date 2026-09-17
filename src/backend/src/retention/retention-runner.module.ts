import { Module } from '@nestjs/common';
import { PersistenceModule } from '../common/persistence/persistence.module';
import { AuditModule } from '../audit/audit.module';
import { RetentionModule } from './retention.module';

/**
 * Der Modulschnitt des Retention-Runners (`retention-main.ts`).
 *
 * **Bewusst NICHT `AppModule`.** Der Runner braucht Datenbank, CLS-Transaktion
 * und Audit — er braucht keinen HTTP-Server, keine Keycloak-Konfiguration und
 * keine Auth-Kette. Baute er auf `AppModule`, verlangte ein Löschlauf beim
 * Start gültige OIDC-Umgebungsvariablen, und ein fehlender Keycloak brächte
 * die Retention zum Stehen — eine Abhängigkeit, die fachlich nicht besteht.
 *
 * Derselbe Zuschnitt wie beim Ingest-Worker (`IngestWorkerModule`,
 * ADR-0011 C3): ein eigener, schmaler Prozesskontext je Betriebsaufgabe.
 */
@Module({
  imports: [PersistenceModule, AuditModule, RetentionModule],
})
export class RetentionRunnerModule {}
