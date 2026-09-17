/** QoS 1 (at-least-once) — s. ADR-0005 §15 (D3, M3). */
export const UPLINK_QOS = 1;

export interface MqttUplinkMessage {
  /** Bereits redigiert (RL-2) — s. `mqtt-topic-redaction.util.ts`. NIEMALS der Rohtopic mit Klartext-Geraetekennung. */
  readonly topicRedacted: string;
  readonly payload: Buffer;
}

export type UplinkHandler = (message: MqttUplinkMessage) => Promise<void>;

/**
 * Port (Ports & Adapters) — der Ingest-Flow/Worker-Bootstrap kennt nur
 * dieses Interface, nicht das `mqtt`-Paket direkt (Austauschbarkeit,
 * Testbarkeit ohne echten Broker fuer Unit-Tests).
 */
export interface MqttSubscriberPort {
  /**
   * Verbindet, abonniert das konfigurierte Uplink-Topic
   * (`IngestMqttOptions.topic`, Default in `ingest-mqtt.config.ts`) und ruft
   * `handler` fuer jeden
   * empfangenen Uplink auf. Der Handler wirft NIE (s. `IngestFlowService`,
   * "nie crashen") — sollte er dennoch werfen, ist das ein Adapter-interner
   * Programmfehler, kein Business-Fall.
   */
  start(handler: UplinkHandler): Promise<void>;
  /** Graceful Shutdown (§15) — beendet KEINE laufende Verarbeitung hart. */
  stop(): Promise<void>;
}

export const MQTT_SUBSCRIBER_PORT = Symbol('MQTT_SUBSCRIBER_PORT');
