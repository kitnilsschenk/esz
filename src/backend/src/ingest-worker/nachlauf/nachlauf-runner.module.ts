import { Module } from '@nestjs/common';
import { IngestFlowModule } from '../ingest-flow/ingest-flow.module';
import { NachlaufService } from './nachlauf.service';

/**
 * Der Modulschnitt des Nachlauf-Runners (`nachlauf-main.ts`).
 *
 * **Bewusst OHNE `IngestMqttModule`.** Der Nachlauf liest aus einer Datei;
 * eine Broker-Verbindung ist nicht nur überflüssig, sie wäre schädlich —
 * ein Nacharbeitslauf würde nebenbei Live-Nachrichten annehmen und
 * verarbeiten, ohne dass jemand das angeordnet hätte. Derselbe Zuschnitt
 * wie beim `RetentionRunnerModule`: ein schmaler Prozesskontext je
 * Betriebsaufgabe.
 *
 * `IngestFlowModule` bringt den Schreibpfad samt der least-privilege
 * DB-Rolle `edms_ingest_worker` mit (`IngestPersistenceModule`) — der
 * Nachlauf schreibt damit über genau denselben Weg und mit denselben
 * Rechten wie der Live-Ingest. Ein eigener Schreibpfad wäre die zweite
 * Wahrheit, die irgendwann abweicht.
 */
@Module({
  imports: [IngestFlowModule],
  providers: [NachlaufService],
  exports: [NachlaufService],
})
export class NachlaufRunnerModule {}
