import { Module } from '@nestjs/common';
import { CryptoModule } from '../../common/crypto/crypto.module';
import { IngestPersistenceModule } from '../persistence/ingest-persistence.module';
import { DECODER_REGISTRY_PROVIDER } from '../decoder/decoder-registry.provider';
import { ConsentEnforcementConfig } from '../config/consent-enforcement.config';
import { IngestFlowService } from './ingest-flow.service';
import { IngestMetricsService } from './ingest-metrics.service';

/**
 * ADR-0005 §18 (D6) — buendelt die Ingest-Flow-Pipeline: `CryptoModule`
 * (`BlindIndexService`, RL-1/§26.3 — wiederverwendet, NICHT dupliziert),
 * `IngestPersistenceModule` (die least-privilege Repositories, u. a.
 * `ConsentGateRepository`) sowie Decoder-Registry/Metriken.
 *
 * `ConsentEnforcementConfig` (ADR-0012 E5, Stufe C) wird HIER als normaler
 * Nest-Provider bereitgestellt — ANDERS als `SyntheticOnlyConfigService`/
 * `IngestBrokerModeConfig`, die `worker-main.ts` bewusst als Plain-JS-Objekte
 * VOR `NestFactory.createApplicationContext(...)` instanziiert (garantierte
 * Reihenfolge vor JEDER MQTT-/DB-Verbindung, s. dortiger Kommentar). Dieser
 * Schalter braucht diese Sonderbehandlung nicht: Er entscheidet nicht, OB
 * der Worker ueberhaupt verbindet, sondern nur eine EINZELNE Abzweigung
 * innerhalb der bereits laufenden Pipeline (Schritt 4b,
 * `ingest-flow.service.ts`). Nest instanziiert ihn dennoch VOR
 * `runner.start()` (Schritt 2 in `worker-main.ts`, Aufbau des gesamten
 * Objektgraphen laeuft VOR Schritt 3, dem tatsaechlichen MQTT-Connect) — der
 * Fail-closed-Konstruktor-Check (fehlende Freigabe-Referenz bei
 * `enforced=true`) greift damit ebenfalls VOR dem ersten Uplink, nur ohne
 * die zusaetzliche manuelle Instanziierung.
 *
 * `IngestLoggerService` wird NICHT mehr hier bereitgestellt (SA-5/QA-3-
 * Nacharbeit, Phase-5-Review) — der kanonische Provider/Export sitzt jetzt
 * in `IngestPersistenceModule` (s. dortiger Kommentar), das dieses Modul
 * bereits importiert; `IngestFlowService` kann den Logger daher weiterhin
 * unveraendert per Konstruktor-Injektion beziehen.
 */
@Module({
  imports: [CryptoModule, IngestPersistenceModule],
  providers: [DECODER_REGISTRY_PROVIDER, IngestFlowService, IngestMetricsService, ConsentEnforcementConfig],
  exports: [IngestFlowService, IngestMetricsService],
})
export class IngestFlowModule {}
