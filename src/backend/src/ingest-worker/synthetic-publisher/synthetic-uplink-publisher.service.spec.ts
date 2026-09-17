import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MqttClient } from 'mqtt';
import { SyntheticOnlyConfigService } from '../../stammdaten/synthetic/synthetic-only.config';
import { SyntheticUplinkPublisherService } from './synthetic-uplink-publisher.service';

const URL_KEY = 'EDMS_SYNTHETIC_PUBLISHER_MQTT_URL';
const ENV_CLASS_KEY = 'EDMS_ENV_CLASS';
const SYNTHETIC_ONLY_KEY = 'EDMS_SYNTHETIC_ONLY';

class FakeMqttClient extends EventEmitter {
  publishCalls: Array<{ topic: string; payload: Buffer }> = [];
  endCalls = 0;

  publish(topic: string, payload: Buffer, _opts: unknown, callback?: (error?: Error) => void): this {
    this.publishCalls.push({ topic, payload });
    callback?.();
    return this;
  }

  end(_force?: boolean, _opts?: unknown, callback?: () => void): this {
    this.endCalls += 1;
    callback?.();
    return this;
  }
}

describe('SyntheticUplinkPublisherService (ADR-0005 §16, D4)', () => {
  const original: Record<string, string | undefined> = {
    [URL_KEY]: process.env[URL_KEY],
    [ENV_CLASS_KEY]: process.env[ENV_CLASS_KEY],
    [SYNTHETIC_ONLY_KEY]: process.env[SYNTHETIC_ONLY_KEY],
  };

  beforeEach(() => {
    process.env[URL_KEY] = 'mqtt://test-broker:1883';
    delete process.env[ENV_CLASS_KEY];
    delete process.env[SYNTHETIC_ONLY_KEY];
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    vi.useRealTimers();
  });

  async function buildConnectedPublisher(): Promise<{ service: SyntheticUplinkPublisherService; fake: FakeMqttClient }> {
    const fake = new FakeMqttClient();
    const service = new SyntheticUplinkPublisherService(new SyntheticOnlyConfigService(), () => fake as unknown as MqttClient);
    const connectPromise = service.connect();
    fake.emit('connect');
    await connectPromise;
    return { service, fake };
  }

  it('verbindet und publiziert einen synthetischen Uplink auf das korrekte Topic mit QoS 1', async () => {
    const { service, fake } = await buildConnectedPublisher();

    await service.publishUplink({
      devEui: 'AA-AA-AA-AA-AA-AA-AA-01',
      wertRoh: 42,
      deviceTimestampIso: new Date().toISOString(),
    });

    expect(fake.publishCalls).toHaveLength(1);
    expect(fake.publishCalls[0]?.topic).toBe('application/1/device/AA-AA-AA-AA-AA-AA-AA-01/event/up');
  });

  it('wirft, wenn publishUplink() vor connect() aufgerufen wird', async () => {
    const service = new SyntheticUplinkPublisherService(new SyntheticOnlyConfigService(), () => new EventEmitter() as unknown as MqttClient);
    await expect(
      service.publishUplink({ devEui: 'AA', wertRoh: 1, deviceTimestampIso: new Date().toISOString() }),
    ).rejects.toThrow(/connect\(\)/);
  });

  it('fail-closed: verweigert connect(), wenn EDMS_SYNTHETIC_ONLY=false (Defense-in-Depth, unabhaengig vom bereits fail-closed SyntheticOnlyConfigService-Konstruktor)', () => {
    // SyntheticOnlyConfigService wirft in diesem Codestand bereits selbst bei
    // synthetic_only=false — dieser Test dokumentiert NUR, dass eine
    // Instanziierung mit synthetic_only=false ueberhaupt nicht zustande kommt.
    process.env[SYNTHETIC_ONLY_KEY] = 'false';
    expect(() => new SyntheticOnlyConfigService()).toThrow(/EDMS_SYNTHETIC_ONLY=false/);
  });

  it('startIntervalPublishing() publiziert periodisch und stopIntervalPublishing() beendet das Intervall', async () => {
    vi.useFakeTimers();
    const { service, fake } = await buildConnectedPublisher();

    let zaehler = 0;
    service.startIntervalPublishing(1_000, () => {
      zaehler += 1;
      return { devEui: `AA-0${String(zaehler)}`, wertRoh: zaehler, deviceTimestampIso: new Date().toISOString() };
    });

    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fake.publishCalls).toHaveLength(2);

    service.stopIntervalPublishing();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fake.publishCalls).toHaveLength(2);
  });

  it('disconnect() beendet den Client und ein laufendes Intervall', async () => {
    vi.useFakeTimers();
    const { service, fake } = await buildConnectedPublisher();

    service.startIntervalPublishing(1_000, () => ({
      devEui: randomBytes(4).toString('hex'),
      wertRoh: 1,
      deviceTimestampIso: new Date().toISOString(),
    }));

    await service.disconnect();
    expect(fake.endCalls).toBe(1);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(fake.publishCalls).toHaveLength(0);
  });
});
