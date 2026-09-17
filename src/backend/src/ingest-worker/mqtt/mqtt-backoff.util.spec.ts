import { describe, expect, it } from 'vitest';
import { MQTT_BACKOFF_INITIAL_MS, MQTT_BACKOFF_MAX_MS, naechsteBackoffWartezeitMs } from './mqtt-backoff.util';

describe('naechsteBackoffWartezeitMs (ADR-0005 §15, D3 — exponentielles Backoff, 1s -> 30s Cap)', () => {
  it('verdoppelt die Wartezeit', () => {
    expect(naechsteBackoffWartezeitMs(1_000)).toBe(2_000);
    expect(naechsteBackoffWartezeitMs(2_000)).toBe(4_000);
    expect(naechsteBackoffWartezeitMs(4_000)).toBe(8_000);
  });

  it('deckelt bei 30s', () => {
    expect(naechsteBackoffWartezeitMs(20_000)).toBe(MQTT_BACKOFF_MAX_MS);
    expect(naechsteBackoffWartezeitMs(30_000)).toBe(MQTT_BACKOFF_MAX_MS);
    expect(naechsteBackoffWartezeitMs(1_000_000)).toBe(MQTT_BACKOFF_MAX_MS);
  });

  it('startet bei 1s (Konstante fuer den Adapter-Initialzustand)', () => {
    expect(MQTT_BACKOFF_INITIAL_MS).toBe(1_000);
  });

  it('konvergiert monoton gegen den Cap ueber wiederholte Aufrufe', () => {
    let wartezeit = MQTT_BACKOFF_INITIAL_MS;
    const verlauf: number[] = [wartezeit];
    for (let i = 0; i < 10; i += 1) {
      wartezeit = naechsteBackoffWartezeitMs(wartezeit);
      verlauf.push(wartezeit);
    }
    expect(verlauf.at(-1)).toBe(MQTT_BACKOFF_MAX_MS);
    expect(verlauf).toEqual([...verlauf].sort((a, b) => a - b));
  });
});
