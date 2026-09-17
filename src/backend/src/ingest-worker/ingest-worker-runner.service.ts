import { Inject, Injectable, Logger } from '@nestjs/common';
import { MQTT_SUBSCRIBER_PORT } from './mqtt/mqtt-subscriber.port';
import type { MqttSubscriberPort } from './mqtt/mqtt-subscriber.port';
import { IngestFlowService } from './ingest-flow/ingest-flow.service';
import { QuelleHerzschlagService } from './quelle-herzschlag.service';

/**
 * ADR-0005 §18/§20 — verdrahtet den `MqttSubscriberPort` mit der
 * `IngestFlowService`-Pipeline. Bewusst als EIGENE, duenne Klasse (kein
 * Controller-Analogon im Worker) — `worker-main.ts` ruft nur `start()`/
 * `stop()`.
 */
@Injectable()
export class IngestWorkerRunnerService {
  private readonly logger = new Logger('IngestWorkerRunner');

  constructor(
    @Inject(MQTT_SUBSCRIBER_PORT) private readonly mqttSubscriber: MqttSubscriberPort,
    private readonly ingestFlowService: IngestFlowService,
    private readonly herzschlag: QuelleHerzschlagService,
  ) {}

  async start(): Promise<void> {
    await this.mqttSubscriber.start(async (message) => {
      await this.ingestFlowService.verarbeiteUplink({
        topicRedacted: message.topicRedacted,
        payload: message.payload,
      });
    });
    // Erst nach erfolgreichem Abo melden — vorher waere `verbunden=true`
    // eine Behauptung ueber etwas, das noch nicht feststeht.
    await this.herzschlag.start();
    this.logger.log('Ingest-Worker verbunden und abonniert.');
  }

  async stop(): Promise<void> {
    await this.mqttSubscriber.stop();
    await this.herzschlag.stop();
  }
}
