import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashRohpayload, redigiereEnvelopeFuerQuarantaene } from './quarantaene-redaction.util';
import type { ChirpStackUplinkEnvelope } from './envelope.types';

describe('redigiereEnvelopeFuerQuarantaene (ADR-0005 §25, SEC-1/RL-2)', () => {
  it('entfernt devEui vollstaendig, behaelt aber den Rest der Nutzlast', () => {
    const envelope: ChirpStackUplinkEnvelope = {
      deviceInfo: { devEui: 'AABBCCDDEEFF0011' },
      fPort: 5,
      data: 'eyJ4IjoxfQ==',
      time: '2026-07-17T12:00:00Z',
      rxInfo: [{ time: '2026-07-17T12:00:00Z' }],
      fCnt: 3,
    };

    const redigiert = redigiereEnvelopeFuerQuarantaene(envelope);
    const serialisiert = JSON.stringify(redigiert);

    expect(serialisiert).not.toContain('AABBCCDDEEFF0011');
    expect(redigiert['data']).toBe('eyJ4IjoxfQ==');
    expect(redigiert['fPort']).toBe(5);
    expect(redigiert['fCnt']).toBe(3);
  });

  it('laesst optionale Felder weg, wenn im Envelope nicht vorhanden', () => {
    const envelope: ChirpStackUplinkEnvelope = { deviceInfo: { devEui: 'AA' }, fPort: 1, data: 'x' };
    const redigiert = redigiereEnvelopeFuerQuarantaene(envelope);

    expect('time' in redigiert).toBe(false);
    expect('rxInfo' in redigiert).toBe(false);
    expect('fCnt' in redigiert).toBe(false);
  });
});

describe('hashRohpayload (ADR-0005 §25, SEC-1 Sonderfall envelope_parse_fehler)', () => {
  it('liefert den SHA-256-Hash der Rohbytes', () => {
    const payload = Buffer.from('kaputtes json', 'utf8');
    const erwartet = createHash('sha256').update(payload).digest();

    expect(hashRohpayload(payload)).toEqual(erwartet);
  });

  it('ist deterministisch fuer identischen Input', () => {
    const payload = Buffer.from('gleicher input', 'utf8');
    expect(hashRohpayload(payload)).toEqual(hashRohpayload(payload));
  });
});
