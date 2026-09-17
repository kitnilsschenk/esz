import { describe, expect, it } from 'vitest';
import { redigiereMqttTopic } from './mqtt-topic-redaction.util';

describe('redigiereMqttTopic (ADR-0005 §14, RL-2)', () => {
  it('redigiert das DevEUI-Segment im ChirpStack-Uplink-Topic-Muster', () => {
    expect(redigiereMqttTopic('application/12/device/AABBCCDDEEFF0011/event/up')).toBe(
      'application/12/device/***/event/up',
    );
  });

  it('laesst ein Topic ohne "device"-Segment unveraendert', () => {
    expect(redigiereMqttTopic('application/12/event/up')).toBe('application/12/event/up');
  });

  it('redigiert auch bei mehreren "device"-Vorkommen (defensiv)', () => {
    expect(redigiereMqttTopic('a/device/X/b/device/Y')).toBe('a/device/***/b/device/***');
  });

  it('behandelt ein "device"-Segment am Topic-Ende ohne Folgeteil unveraendert (kein Off-by-one)', () => {
    expect(redigiereMqttTopic('application/12/device')).toBe('application/12/device');
  });
});

describe('redigiereMqttTopic — Form-Regel (ADR-0011 C1)', () => {
  it('redigiert eine DevEUI auch dort, wo kein `device`-Segment davorsteht', () => {
    // Seit das Topic frei konfigurierbar ist, bestimmen wir das Template
    // nicht mehr selbst. Ohne die Form-Regel stuende die Kennung hier
    // unredigiert im Log (RL-2).
    expect(redigiereMqttTopic('eu868/gw/0080e1150570e060/up')).toBe('eu868/gw/***/up');
  });

  it('greift auch bei Grossschreibung', () => {
    expect(redigiereMqttTopic('tenant/x/0080E1150570E060/rx')).toBe('tenant/x/***/rx');
  });

  it('laesst Segmente stehen, die nur zufaellig hexadezimal aussehen, aber die falsche Laenge haben', () => {
    expect(redigiereMqttTopic('application/abc123/event/up')).toBe('application/abc123/event/up');
    expect(redigiereMqttTopic('a/0080e1150570e06/b')).toBe('a/0080e1150570e06/b');
  });

  it('redigiert weiterhin nach Position, auch wenn das Segment keine DevEUI-Form hat', () => {
    expect(redigiereMqttTopic('application/1/device/mein-geraet/event/up')).toBe(
      'application/1/device/***/event/up',
    );
  });
});
