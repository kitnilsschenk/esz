import { describe, expect, it } from 'vitest';
import { EnvelopeParseError, MAX_ENVELOPE_PAYLOAD_BYTES, parseUplinkEnvelope } from './envelope-parser.util';

function buf(obj: unknown): Buffer {
  return Buffer.from(JSON.stringify(obj), 'utf8');
}

describe('parseUplinkEnvelope (ADR-0005 §20 Schritt 2, SEC-1/TD-7)', () => {
  it('parst ein gueltiges ChirpStack-Envelope', () => {
    const envelope = parseUplinkEnvelope(
      buf({
        deviceInfo: { devEui: 'AA-AA-AA-AA-AA-AA-AA-01' },
        fPort: 10,
        data: 'eyJ4IjoxfQ==',
        time: '2026-07-17T12:00:00Z',
        rxInfo: [{ time: '2026-07-17T12:00:00Z' }],
        fCnt: 5,
      }),
    );

    expect(envelope.deviceInfo.devEui).toBe('AA-AA-AA-AA-AA-AA-AA-01');
    expect(envelope.fPort).toBe(10);
    expect(envelope.data).toBe('eyJ4IjoxfQ==');
    expect(envelope.time).toBe('2026-07-17T12:00:00Z');
    expect(envelope.rxInfo).toEqual([{ time: '2026-07-17T12:00:00Z' }]);
    expect(envelope.fCnt).toBe(5);
  });

  it('parst ein minimales Envelope ohne optionale Felder', () => {
    const envelope = parseUplinkEnvelope(buf({ deviceInfo: { devEui: 'AA' }, fPort: 1, data: 'eyJ4IjoxfQ==' }));
    expect('time' in envelope).toBe(false);
    expect('rxInfo' in envelope).toBe(false);
    expect('fCnt' in envelope).toBe(false);
  });

  it('wirft EnvelopeParseError bei kaputtem JSON', () => {
    expect(() => parseUplinkEnvelope(Buffer.from('{kaputt', 'utf8'))).toThrow(EnvelopeParseError);
  });

  it('wirft EnvelopeParseError, wenn deviceInfo.devEui fehlt', () => {
    expect(() => parseUplinkEnvelope(buf({ deviceInfo: {}, fPort: 1, data: 'x' }))).toThrow(EnvelopeParseError);
  });

  it('wirft EnvelopeParseError, wenn deviceInfo komplett fehlt', () => {
    expect(() => parseUplinkEnvelope(buf({ fPort: 1, data: 'x' }))).toThrow(EnvelopeParseError);
  });

  it('wirft EnvelopeParseError bei falschem fPort-Typ', () => {
    expect(() => parseUplinkEnvelope(buf({ deviceInfo: { devEui: 'AA' }, fPort: '1', data: 'x' }))).toThrow(
      EnvelopeParseError,
    );
  });

  it('wirft EnvelopeParseError, wenn data fehlt', () => {
    expect(() => parseUplinkEnvelope(buf({ deviceInfo: { devEui: 'AA' }, fPort: 1 }))).toThrow(EnvelopeParseError);
  });

  it('die Fehlermeldung enthaelt NIE ein Payload-Fragment (RL-2/§20 Schritt 6)', () => {
    try {
      parseUplinkEnvelope(Buffer.from('{"geheim":"MEIN-DEVEUI-9999"}', 'utf8'));
      expect.unreachable('haette werfen muessen');
    } catch (error) {
      expect(error).toBeInstanceOf(EnvelopeParseError);
      expect((error as Error).message).not.toContain('MEIN-DEVEUI-9999');
    }
  });

  it('wirft EnvelopeParseError bei einem JSON-Array statt Objekt', () => {
    expect(() => parseUplinkEnvelope(Buffer.from('[1,2,3]', 'utf8'))).toThrow(EnvelopeParseError);
  });

  it('SA-2/PE-11: akzeptiert einen Payload GENAU an der Obergrenze (kein Off-by-one)', () => {
    const basis = { deviceInfo: { devEui: 'AA' }, fPort: 1, data: 'eyJ4IjoxfQ==', fuellstoff: '' };
    const basisLaenge = Buffer.byteLength(JSON.stringify(basis), 'utf8');
    const fuellstoffLaenge = MAX_ENVELOPE_PAYLOAD_BYTES - basisLaenge;
    const raw = Buffer.from(JSON.stringify({ ...basis, fuellstoff: 'x'.repeat(fuellstoffLaenge) }), 'utf8');

    expect(raw.length).toBe(MAX_ENVELOPE_PAYLOAD_BYTES);
    expect(() => parseUplinkEnvelope(raw)).not.toThrow();
  });

  it('SA-2/PE-11: wirft EnvelopeParseError VOR jedem JSON.parse, wenn der Rohpayload die Byte-Obergrenze ueberschreitet (kein Payload-Fragment noetig)', () => {
    const ueberdimensioniert = Buffer.alloc(MAX_ENVELOPE_PAYLOAD_BYTES + 1, 'a');
    expect(() => parseUplinkEnvelope(ueberdimensioniert)).toThrow(EnvelopeParseError);
  });
});

describe('parseUplinkEnvelope — dekodiertes `object` (ADR-0011 D2)', () => {
  /** Gekürzter, aber unveränderter Ausschnitt eines realen fPort-30-Uplinks (2026-08-28). */
  const REALER_UPLINK = JSON.stringify({
    deduplicationId: 'b4b9e6b7-275f-47da-a728-b30d067c473f',
    time: '2026-08-28T14:32:03.594+00:00',
    deviceInfo: {
      tenantId: '36755464-acd4-4746-b8eb-e339a84e6ed8',
      tenantName: 'Volksbank Rhein-Lahn-Limburg eG',
      applicationId: '7b0c677e-e837-43d8-aa28-3f309e604538',
      applicationName: 'GS Lahnstein',
      deviceProfileName: 'DeZem Harvey 2',
      deviceName: 'UV-EG-46Q1-LUEFTUNG',
      devEui: '0080e115057112cd',
      tags: { consumerName: 'Lüftung EG' },
    },
    fCnt: 9731,
    fPort: 30,
    data: 'AwMDuZ/1AF2LAwDTOuaEAgAAOdofAwAfOg==',
    object: { in1_kWh: 2322.85, sum_in123_kWh: 6021.41, in_ctr_time_elapse: '[D:186|H:7|M:26|S:49]' },
    rxInfo: [{ gatewayId: '24e124fffefdd138', gwTime: '2026-08-28T14:32:03.594676+00:00', rssi: -105 }],
    regionConfigId: 'eu868',
  });

  it('übernimmt das dekodierte `object` unverändert', () => {
    const envelope = parseUplinkEnvelope(Buffer.from(REALER_UPLINK, 'utf8'));

    expect(envelope.objekt).toEqual({
      in1_kWh: 2322.85,
      sum_in123_kWh: 6021.41,
      in_ctr_time_elapse: '[D:186|H:7|M:26|S:49]',
    });
  });

  it('übernimmt `gwTime` aus dem rxInfo-Eintrag', () => {
    const envelope = parseUplinkEnvelope(Buffer.from(REALER_UPLINK, 'utf8'));

    expect(envelope.rxInfo?.[0]?.gwTime).toBe('2026-08-28T14:32:03.594676+00:00');
  });

  it('kommt ohne `object` zurecht — nicht jedes Geräteprofil hat einen Codec', () => {
    const ohneObject = JSON.parse(REALER_UPLINK) as Record<string, unknown>;
    delete ohneObject['object'];

    const envelope = parseUplinkEnvelope(Buffer.from(JSON.stringify(ohneObject), 'utf8'));

    expect(envelope.objekt).toBeUndefined();
    expect(envelope.fPort).toBe(30);
  });

  it('ignoriert ein `object`, das kein Objekt ist, statt daran zu scheitern', () => {
    const kaputt = JSON.parse(REALER_UPLINK) as Record<string, unknown>;
    kaputt['object'] = [1, 2, 3];

    expect(parseUplinkEnvelope(Buffer.from(JSON.stringify(kaputt), 'utf8')).objekt).toBeUndefined();
  });
});

