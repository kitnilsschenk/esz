import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_UPLINK_TOPIC, loadIngestMqttOptions } from './ingest-mqtt.config';

describe('loadIngestMqttOptions — Topic (ADR-0011 C1)', () => {
  const vorher = { ...process.env };

  afterEach(() => {
    process.env = { ...vorher };
  });

  it('verwendet ohne Angabe das ChirpStack-Standard-Template', () => {
    process.env['EDMS_INGEST_MQTT_URL'] = 'mqtt://localhost:1883';
    delete process.env['EDMS_INGEST_MQTT_TOPIC'];

    expect(loadIngestMqttOptions().topic).toBe('application/+/device/+/event/up');
    expect(DEFAULT_UPLINK_TOPIC).toBe('application/+/device/+/event/up');
  });

  it('übernimmt ein abweichendes Template — sonst käme von einem fremden ChirpStack stumm nichts an', () => {
    process.env['EDMS_INGEST_MQTT_URL'] = 'mqtt://localhost:1883';
    process.env['EDMS_INGEST_MQTT_TOPIC'] = 'eu868/application/+/device/+/event/up';

    expect(loadIngestMqttOptions().topic).toBe('eu868/application/+/device/+/event/up');
  });

  it('schneidet umgebende Leerzeichen ab', () => {
    process.env['EDMS_INGEST_MQTT_URL'] = 'mqtt://localhost:1883';
    process.env['EDMS_INGEST_MQTT_TOPIC'] = '  tenant/+/device/+/up  ';

    expect(loadIngestMqttOptions().topic).toBe('tenant/+/device/+/up');
  });

  it('scheitert bei leer gesetzter Variable, statt still auf den Default zurückzufallen', () => {
    // Sonst abonnierte der Worker etwas anderes, als in der Konfiguration
    // steht — und niemand könnte das der Konfiguration ansehen.
    process.env['EDMS_INGEST_MQTT_URL'] = 'mqtt://localhost:1883';
    process.env['EDMS_INGEST_MQTT_TOPIC'] = '   ';

    expect(() => loadIngestMqttOptions()).toThrow(/EDMS_INGEST_MQTT_TOPIC/);
  });
});
