import { Injectable, Logger, Optional } from '@nestjs/common';
import mqtt from 'mqtt';
import type { IClientOptions, MqttClient } from 'mqtt';
import { SyntheticOnlyConfigService } from '../../stammdaten/synthetic/synthetic-only.config';
import { loadSyntheticPublisherMqttOptions } from './synthetic-publisher-mqtt.config';
import { buildSyntheticUplink } from './synthetic-uplink-fixture';
import type { SyntheticUplinkInput } from './synthetic-uplink-fixture';

export type MqttConnectFn = (url: string, options: IClientOptions) => MqttClient;

/**
 * ADR-0005 §16 (D4) — eigenstaendiger, synthetic-only Uplink-Publisher: für
 * den End-to-End-Test UND den spaeteren Dev-Betrieb (periodisches
 * Publizieren synthetischer Uplinks). Teilt den `SyntheticOnlyConfigService`
 * -Guard mit dem Worker (Injektion allein genuegt — die Klasse wirft bereits
 * beim Konstruieren bei einer widerspruechlichen ENV-Kombination, ADR-0005
 * §16 "Defense-in-Depth, auch wenn der Publisher ohnehin nie in ein
 * Prod-Deployment-Manifest gehoert").
 */
@Injectable()
export class SyntheticUplinkPublisherService {
  private readonly logger = new Logger('SyntheticUplinkPublisher');
  private readonly connectFn: MqttConnectFn;
  private client: MqttClient | undefined;
  private intervalTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    // Guard (ADR-0005 §16) — Injektion allein reicht: SyntheticOnlyConfigService
    // wirft bereits beim eigenen Konstruieren bei einer widerspruechlichen
    // EDMS_ENV_CLASS/EDMS_SYNTHETIC_ONLY-Kombination.
    private readonly syntheticOnlyConfig: SyntheticOnlyConfigService,
    @Optional() connectFn?: MqttConnectFn,
  ) {
    this.connectFn = connectFn ?? mqtt.connect;
  }

  async connect(): Promise<void> {
    // Defense-in-Depth (ADR-0005 §16, analog SyntheticOnlyInterceptor): in
    // diesem Codestand wirft SyntheticOnlyConfigService bereits beim
    // Konstruieren bei synthetic_only=false — dieser Laufzeit-Check greift
    // zusaetzlich, falls diese Invariante kuenftig gelockert wird.
    if (!this.syntheticOnlyConfig.syntheticOnly) {
      throw new Error(
        'SyntheticUplinkPublisherService: synthetic_only_gate_geschlossen — der Publisher darf nur bei ' +
          'EDMS_SYNTHETIC_ONLY=true laufen (ADR-0005 §16).',
      );
    }

    const options = loadSyntheticPublisherMqttOptions();

    await new Promise<void>((resolve, reject) => {
      const client = this.connectFn(options.url, {
        clientId: options.clientId,
        clean: true,
        reconnectPeriod: 0,
        ...(options.username !== undefined ? { username: options.username } : {}),
        ...(options.password !== undefined ? { password: options.password } : {}),
      });
      this.client = client;
      client.once('connect', () => resolve());
      client.once('error', (error) => reject(error));
    });
  }

  async publishUplink(input: SyntheticUplinkInput): Promise<void> {
    const client = this.client;
    if (client === undefined) {
      throw new Error('SyntheticUplinkPublisherService: connect() muss vor publishUplink() aufgerufen werden.');
    }

    const uplink = buildSyntheticUplink(input);
    await new Promise<void>((resolve, reject) => {
      client.publish(uplink.topic, uplink.payload, { qos: 1 }, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  /**
   * Dev-Betrieb (§16): periodisches Publizieren. `erzeugeNaechstenUplink`
   * liefert je Aufruf einen NEUEN, monoton fortgeschriebenen synthetischen
   * Zaehlerstand (Aufrufer-Verantwortung — reine Timer-Orchestrierung hier).
   */
  startIntervalPublishing(intervalMs: number, erzeugeNaechstenUplink: () => SyntheticUplinkInput): void {
    this.stopIntervalPublishing();
    this.intervalTimer = setInterval(() => {
      this.publishUplink(erzeugeNaechstenUplink()).catch((error: unknown) => {
        this.logger.error(
          `Synthetischer Uplink-Publish fehlgeschlagen: ${error instanceof Error ? error.message : 'unbekannter Fehler'}`,
        );
      });
    }, intervalMs);
  }

  stopIntervalPublishing(): void {
    if (this.intervalTimer !== undefined) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = undefined;
    }
  }

  async disconnect(): Promise<void> {
    this.stopIntervalPublishing();
    const client = this.client;
    if (client === undefined) {
      return;
    }
    await new Promise<void>((resolve) => {
      client.end(false, {}, () => resolve());
    });
  }
}
