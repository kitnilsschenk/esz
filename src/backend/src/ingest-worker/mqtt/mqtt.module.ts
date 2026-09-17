import { Module } from '@nestjs/common';
import { CryptoModule } from '../../common/crypto/crypto.module';
import { IngestPersistenceModule } from '../persistence/ingest-persistence.module';
import { IngestQuelleKonfigService } from './ingest-quelle-konfig.service';
import { MqttSubscriberAdapter } from './mqtt-subscriber.adapter';
import { MQTT_SUBSCRIBER_PORT } from './mqtt-subscriber.port';

/**
 * `IngestPersistenceModule`-Import (QA-3-Nacharbeit, Phase-5-Review): stellt
 * `IngestLoggerService` fuer `MqttSubscriberAdapter` bereit (PII-sicheres
 * `infraFehler()`-Logging des Handler-Fehlerpfads, s. dortiger Kommentar).
 *
 * `CryptoModule`-Import (V0059): Bis hierher hielt dieses Modul die
 * Krypto-Importkette AUSDRUECKLICH draussen — das war richtig, solange die
 * Broker-Zugangsdaten aus Umgebungsvariablen kamen und niemand sie
 * entschluesseln musste. Seit die Konfiguration in `ingest.quelle` gepflegt
 * wird, liegen Passwort und privater Schluessel als Chiffrat in der Datenbank:
 * Der Verbindungsaufbau kann sie nicht mehr benutzen, ohne sie zu
 * entschluesseln. Die frueher vermiedene Abhaengigkeit ist damit keine
 * Bequemlichkeit mehr, sondern Voraussetzung.
 */
@Module({
  imports: [IngestPersistenceModule, CryptoModule],
  providers: [IngestQuelleKonfigService, { provide: MQTT_SUBSCRIBER_PORT, useClass: MqttSubscriberAdapter }],
  exports: [MQTT_SUBSCRIBER_PORT, IngestQuelleKonfigService],
})
export class IngestMqttModule {}
