export interface SyntheticPublisherMqttOptions {
  readonly url: string;
  readonly clientId: string;
  readonly username?: string;
  readonly password?: string;
}

const DEFAULT_CLIENT_ID = 'edms-synthetic-publisher';

/**
 * ADR-0005 §17 (D5) — "Der synthetische Publisher hat einen SEPARATEN
 * Broker-Account mit nur Publish-Recht auf denselben Uplink-Topic-Praefix."
 * Teilt sich per Default die Broker-Adresse mit dem Worker
 * (`EDMS_INGEST_MQTT_URL`, dieselbe Dev-/Test-Broker-Instanz), nutzt aber
 * EIGENE Client-ID/Credentials (`EDMS_SYNTHETIC_PUBLISHER_MQTT_*`) — NIE die
 * Worker-Credentials wiederverwendet (separate Broker-ACL, §17).
 */
export function loadSyntheticPublisherMqttOptions(): SyntheticPublisherMqttOptions {
  const url = process.env['EDMS_SYNTHETIC_PUBLISHER_MQTT_URL'] ?? process.env['EDMS_INGEST_MQTT_URL'];
  if (url === undefined || url.length === 0) {
    throw new Error(
      'EDMS_SYNTHETIC_PUBLISHER_MQTT_URL/EDMS_INGEST_MQTT_URL ist nicht gesetzt — der synthetische Publisher ' +
        'braucht eine MQTT-Broker-Adresse. Fail-closed.',
    );
  }

  const clientId = process.env['EDMS_SYNTHETIC_PUBLISHER_MQTT_CLIENT_ID'] ?? DEFAULT_CLIENT_ID;
  const username = process.env['EDMS_SYNTHETIC_PUBLISHER_MQTT_USERNAME'];
  const password = process.env['EDMS_SYNTHETIC_PUBLISHER_MQTT_PASSWORD'];

  return {
    url,
    clientId,
    ...(username !== undefined && username.length > 0 ? { username } : {}),
    ...(password !== undefined && password.length > 0 ? { password } : {}),
  };
}
