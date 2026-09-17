import { describe, expect, it } from 'vitest';
import { SynthetischReferenzV1Decoder } from '../decoder/synthetisch-referenz-v1.decoder';
import { parseUplinkEnvelope } from '../ingest-flow/envelope-parser.util';
import { buildSyntheticUplink } from './synthetic-uplink-fixture';

describe('buildSyntheticUplink (ADR-0005 §16, D4 — versionierte Fixture)', () => {
  it('erzeugt ein Topic im ChirpStack-Muster mit der DevEUI im device-Segment', () => {
    const uplink = buildSyntheticUplink({
      devEui: 'AA-AA-AA-AA-AA-AA-AA-01',
      wertRoh: 100,
      deviceTimestampIso: new Date().toISOString(),
    });

    expect(uplink.topic).toBe('application/1/device/AA-AA-AA-AA-AA-AA-AA-01/event/up');
  });

  it('erzeugt einen Payload, den parseUplinkEnvelope + SynthetischReferenzV1Decoder Ende-zu-Ende verarbeiten koennen', () => {
    const deviceTimestampIso = new Date().toISOString();
    const uplink = buildSyntheticUplink({
      devEui: 'AA-AA-AA-AA-AA-AA-AA-02',
      messgroesse: 'wirkarbeit',
      obisKennzahl: '1.8.0',
      wertRoh: 12345.678,
      einheit: 'kWh',
      art: 'kumulativ_zaehlerstand',
      deviceTimestampIso,
    });

    const envelope = parseUplinkEnvelope(uplink.payload);
    expect(envelope.deviceInfo.devEui).toBe('AA-AA-AA-AA-AA-AA-AA-02');

    const decoder = new SynthetischReferenzV1Decoder();
    const decoded = decoder.decode({ data: Buffer.from(envelope.data, 'base64'), fPort: envelope.fPort });

    expect(decoded).toEqual([
      {
        messgroesse: 'wirkarbeit',
        obisKennzahl: '1.8.0',
        wertRoh: 12345.678,
        einheit: 'kWh',
        art: 'kumulativ_zaehlerstand',
        deviceTimestampIso,
      },
    ]);
  });

  it('nutzt Defaults, wenn optionale Felder fehlen', () => {
    const uplink = buildSyntheticUplink({ devEui: 'AA-AA-AA-AA-AA-AA-AA-03', wertRoh: 1, deviceTimestampIso: new Date().toISOString() });
    const envelope = parseUplinkEnvelope(uplink.payload);
    const decoded = new SynthetischReferenzV1Decoder().decode({ data: Buffer.from(envelope.data, 'base64'), fPort: envelope.fPort });

    expect(decoded[0]?.messgroesse).toBe('wirkarbeit');
    expect(decoded[0]?.einheit).toBe('kWh');
    expect(decoded[0]?.art).toBe('kumulativ_zaehlerstand');
    expect('obisKennzahl' in (decoded[0] ?? {})).toBe(false);
  });
});
