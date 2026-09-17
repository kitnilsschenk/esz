import { Module } from '@nestjs/common';
import { IngestPgModule } from './persistence/ingest-pg.module';
import { ConsentVorflugService } from './consent-vorflug.service';

/**
 * Der Modulschnitt des Ingest-Gate-Vorflugs (`consent-vorflug-main.ts`).
 *
 * **So schmal wie möglich** — derselbe Zuschnitt wie bei den übrigen
 * Betriebsläufen: Datenbank ja, HTTP-Server und Keycloak nein. Ein
 * Trockenlauf, der ohne erreichbaren Keycloak nicht startet, hätte eine
 * Abhängigkeit, die fachlich nicht besteht.
 *
 * **Nur `IngestPgModule`, also GENAU die Verbindung des Workers.** Das ist
 * der Punkt: Der Vorflug soll sehen, was der Worker später sehen wird — nicht
 * mehr. Liefe er über die App-Verbindung, könnte er Zähler prüfen, die der
 * Worker gar nicht erreicht, und das Ergebnis wäre eine Auskunft über eine
 * andere Anwendung als die, um die es geht.
 *
 * Kein `AuditModule`: Der Lauf liest nur und ändert nichts. Ein
 * Audit-Ereignis für eine Frage wäre eine Spur ohne Vorgang.
 */
@Module({
  imports: [IngestPgModule],
  providers: [ConsentVorflugService],
})
export class ConsentVorflugRunnerModule {}
