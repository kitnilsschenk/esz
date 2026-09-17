import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { IPublishPacket, MqttClient } from 'mqtt';
import { MqttSubscriberAdapter } from './mqtt-subscriber.adapter';
import type { MqttUplinkMessage, UplinkHandler } from './mqtt-subscriber.port';
import { IngestLoggerService } from '../ingest-flow/ingest-logger.service';

const ENV_URL_KEY = 'EDMS_INGEST_MQTT_URL';
const ENV_DEBUG_KEY = 'DEBUG';

/** Minimaler Fake — nur die vom Adapter tatsaechlich genutzten Mitglieder. */
class FakeMqttClient extends EventEmitter {
  subscribeCalls: Array<{ topic: string; opts: unknown }> = [];
  endCalls = 0;
  reconnectCalls = 0;
  handleMessage: (packet: IPublishPacket, callback: (error?: Error) => void) => void = () => undefined;

  subscribe(topic: string, opts: unknown, callback: (err: Error | null) => void): this {
    this.subscribeCalls.push({ topic, opts });
    callback(null);
    return this;
  }

  end(_force?: boolean, _opts?: unknown, callback?: () => void): this {
    this.endCalls += 1;
    callback?.();
    return this;
  }

  reconnect(): this {
    this.reconnectCalls += 1;
    return this;
  }
}

function buildPacket(topic: string, payload: Buffer): IPublishPacket {
  return { cmd: 'publish', topic, payload, qos: 1, dup: false, retain: false, messageId: 1 };
}

function buildFakeIngestLogger(): IngestLoggerService & { infraFehler: Mock } {
  return {
    quarantaene: vi.fn(),
    messwertGeschrieben: vi.fn(),
    infraFehler: vi.fn(),
  } as unknown as IngestLoggerService & { infraFehler: Mock };
}

describe('MqttSubscriberAdapter (ADR-0005 §14/§15/§20 Schritt 12 — Ack nach Commit)', () => {
  const originalUrl = process.env[ENV_URL_KEY];
  const originalDebug = process.env[ENV_DEBUG_KEY];

  beforeEach(() => {
    process.env[ENV_URL_KEY] = 'mqtt://test-broker:1883';
    delete process.env[ENV_DEBUG_KEY];
  });

  afterEach(() => {
    if (originalUrl === undefined) {
      delete process.env[ENV_URL_KEY];
    } else {
      process.env[ENV_URL_KEY] = originalUrl;
    }
    if (originalDebug === undefined) {
      delete process.env[ENV_DEBUG_KEY];
    } else {
      process.env[ENV_DEBUG_KEY] = originalDebug;
    }
    vi.useRealTimers();
  });

  async function startAdapterWithFake(
    handler: UplinkHandler,
    ingestLogger?: IngestLoggerService,
  ): Promise<{
    adapter: MqttSubscriberAdapter;
    fake: FakeMqttClient;
  }> {
    const fake = new FakeMqttClient();
    const adapter = new MqttSubscriberAdapter(() => fake as unknown as MqttClient, ingestLogger);
    const startPromise = adapter.start(handler);
    fake.emit('connect');
    await startPromise;
    return { adapter, fake };
  }

  it('abonniert das Uplink-Topic mit QoS 1 nach erfolgreichem Connect', async () => {
    const { fake } = await startAdapterWithFake(() => Promise.resolve());
    expect(fake.subscribeCalls).toHaveLength(1);
    expect(fake.subscribeCalls[0]?.topic).toBe('application/+/device/+/event/up');
    expect(fake.subscribeCalls[0]?.opts).toEqual({ qos: 1 });
  });

  it('ruft den Handler mit redigiertem Topic + Rohpayload auf und acked (callback ohne Fehler) NACH Handler-Resolve', async () => {
    let ackAufgerufen = false;
    let handlerAufgerufenVorAck = false;
    const empfangen: MqttUplinkMessage[] = [];

    const handler: UplinkHandler = async (message) => {
      empfangen.push(message);
      await Promise.resolve();
    };

    const { fake } = await startAdapterWithFake(handler);

    const packet = buildPacket('application/1/device/AABBCCDDEEFF0011/event/up', Buffer.from('payload'));
    await new Promise<void>((resolve) => {
      fake.handleMessage(packet, (error) => {
        ackAufgerufen = true;
        handlerAufgerufenVorAck = empfangen.length === 1;
        expect(error).toBeUndefined();
        resolve();
      });
    });

    expect(ackAufgerufen).toBe(true);
    expect(handlerAufgerufenVorAck).toBe(true);
    expect(empfangen[0]?.topicRedacted).toBe('application/1/device/***/event/up');
    expect(empfangen[0]?.payload.toString('utf8')).toBe('payload');
  });

  it('DevEUI steht NIE im redigierten Topic (RL-2)', async () => {
    const empfangen: MqttUplinkMessage[] = [];
    const { fake } = await startAdapterWithFake((message) => {
      empfangen.push(message);
      return Promise.resolve();
    });

    fake.handleMessage(buildPacket('application/1/device/DEADBEEFCAFE0001/event/up', Buffer.alloc(0)), () => undefined);
    expect(empfangen[0]?.topicRedacted).not.toContain('DEADBEEFCAFE0001');
  });

  it('sendet KEIN Ack (callback mit Error) wenn der Handler wirft — Nachricht bleibt fuer Redelivery', async () => {
    const { fake } = await startAdapterWithFake(() => Promise.reject(new Error('DB nicht erreichbar')));

    const empfangenerFehler = await new Promise<Error | undefined>((resolve) => {
      fake.handleMessage(buildPacket('application/1/device/X/event/up', Buffer.alloc(0)), (error) => resolve(error));
    });

    expect(empfangenerFehler).toBeInstanceOf(Error);
  });

  it('QA-3: ein Handler-Fehler wird ueber IngestLoggerService.infraFehler() geloggt (PII-sichere Feld-Whitelist, nicht der rohe Logger)', async () => {
    const fakeLogger = buildFakeIngestLogger();
    const { fake } = await startAdapterWithFake(() => Promise.reject(new Error('DB nicht erreichbar')), fakeLogger);

    await new Promise<void>((resolve) => {
      fake.handleMessage(buildPacket('application/1/device/X/event/up', Buffer.alloc(0)), () => resolve());
    });

    expect(fakeLogger.infraFehler).toHaveBeenCalledTimes(1);
    expect(fakeLogger.infraFehler).toHaveBeenCalledWith('mqtt_uplink_verarbeitung_fehlgeschlagen', expect.any(Error));
  });

  it('plant nach "close" einen Reconnect mit dem initialen Backoff (1s)', async () => {
    vi.useFakeTimers();
    const { fake } = await startAdapterWithFake(() => Promise.resolve());

    fake.emit('close');
    expect(fake.reconnectCalls).toBe(0);
    vi.advanceTimersByTime(999);
    expect(fake.reconnectCalls).toBe(0);
    vi.advanceTimersByTime(1);
    expect(fake.reconnectCalls).toBe(1);
  });

  it('stop() beendet den Client und verhindert einen weiteren Reconnect-Versuch', async () => {
    vi.useFakeTimers();
    const { adapter, fake } = await startAdapterWithFake(() => Promise.resolve());

    await adapter.stop();
    expect(fake.endCalls).toBe(1);

    fake.emit('close');
    vi.advanceTimersByTime(60_000);
    expect(fake.reconnectCalls).toBe(0);
  });

  it('SA-4: der Konstruktor bricht fail-closed ab, wenn DEBUG ein mqtt*-Risiko traegt (kein Verbindungsaufbau)', () => {
    process.env[ENV_DEBUG_KEY] = 'mqtt*';

    expect(() => new MqttSubscriberAdapter(() => new FakeMqttClient() as unknown as MqttClient)).toThrow(
      /mqtt\*-Namespace-Muster/,
    );
  });

  it('SA-4: der Konstruktor startet unveraendert, wenn DEBUG unbesetzt/unrelated ist', () => {
    expect(() => new MqttSubscriberAdapter(() => new FakeMqttClient() as unknown as MqttClient)).not.toThrow();

    process.env[ENV_DEBUG_KEY] = 'express:router';
    expect(() => new MqttSubscriberAdapter(() => new FakeMqttClient() as unknown as MqttClient)).not.toThrow();
  });
});
