import { describe, expect, it } from 'vitest';
import {
  istMonotonPlausibel,
  istWertebereichPlausibel,
  resolveZeitstempel,
  ZEITSTEMPEL_PLAUSIBEL_FENSTER_MS,
} from './plausibilitaet.util';
import type { DecodedMesswert } from '../decoder/geraetetyp-decoder.types';
import type { ChirpStackUplinkEnvelope } from './envelope.types';

const BASIS_MESSWERT: DecodedMesswert = {
  messgroesse: 'wirkarbeit',
  wertRoh: 1,
  einheit: 'kWh',
  art: 'kumulativ_zaehlerstand',
};

const BASIS_ENVELOPE: ChirpStackUplinkEnvelope = {
  deviceInfo: { devEui: 'AA' },
  fPort: 1,
  data: 'x',
};

describe('resolveZeitstempel (ADR-0005 §20 Schritt 9, TD-2)', () => {
  const empfangenAt = new Date('2026-07-17T12:00:00.000Z');

  it('geraet-Quelle: nutzt deviceTimestampIso, wenn plausibel', () => {
    const ts = resolveZeitstempel(
      'geraet',
      { ...BASIS_MESSWERT, deviceTimestampIso: '2026-07-17T11:59:00.000Z' },
      BASIS_ENVELOPE,
      empfangenAt,
    );
    expect(ts).toBe('2026-07-17T11:59:00.000Z');
  });

  it('geraet-Quelle: undefined (zeitstempel_fehlt), wenn deviceTimestampIso fehlt — KEIN Fallback auf Serverzeit', () => {
    const ts = resolveZeitstempel(
      'geraet',
      BASIS_MESSWERT,
      { ...BASIS_ENVELOPE, time: '2026-07-17T12:00:00.000Z' },
      empfangenAt,
    );
    expect(ts).toBeUndefined();
  });

  it('geraet-Quelle: undefined, wenn deviceTimestampIso kein gueltiges Datum ist', () => {
    const ts = resolveZeitstempel('geraet', { ...BASIS_MESSWERT, deviceTimestampIso: 'kaputt' }, BASIS_ENVELOPE, empfangenAt);
    expect(ts).toBeUndefined();
  });

  it('geraet-Quelle: undefined, wenn deviceTimestampIso ausserhalb des Plausibilitaetsfensters liegt', () => {
    const zuAlt = new Date(empfangenAt.getTime() - ZEITSTEMPEL_PLAUSIBEL_FENSTER_MS - 1).toISOString();
    const ts = resolveZeitstempel('geraet', { ...BASIS_MESSWERT, deviceTimestampIso: zuAlt }, BASIS_ENVELOPE, empfangenAt);
    expect(ts).toBeUndefined();
  });

  it('geraet-Quelle: am Rand des Fensters (genau am Limit) noch plausibel', () => {
    const amLimit = new Date(empfangenAt.getTime() - ZEITSTEMPEL_PLAUSIBEL_FENSTER_MS).toISOString();
    const ts = resolveZeitstempel('geraet', { ...BASIS_MESSWERT, deviceTimestampIso: amLimit }, BASIS_ENVELOPE, empfangenAt);
    expect(ts).toBe(amLimit);
  });

  it('gateway_server-Quelle: nutzt rxInfo[0].time, ignoriert ein evtl. vorhandenes deviceTimestampIso', () => {
    const ts = resolveZeitstempel(
      'gateway_server',
      { ...BASIS_MESSWERT, deviceTimestampIso: '2000-01-01T00:00:00.000Z' },
      { ...BASIS_ENVELOPE, rxInfo: [{ time: '2026-07-17T12:00:00.000Z' }] },
      empfangenAt,
    );
    expect(ts).toBe('2026-07-17T12:00:00.000Z');
  });

  it('gateway_server-Quelle: faellt auf envelope.time zurueck, wenn rxInfo fehlt', () => {
    const ts = resolveZeitstempel('gateway_server', BASIS_MESSWERT, { ...BASIS_ENVELOPE, time: '2026-07-17T12:00:00.000Z' }, empfangenAt);
    expect(ts).toBe('2026-07-17T12:00:00.000Z');
  });

  it('gateway_server-Quelle: undefined, wenn weder rxInfo noch time vorhanden sind', () => {
    const ts = resolveZeitstempel('gateway_server', BASIS_MESSWERT, BASIS_ENVELOPE, empfangenAt);
    expect(ts).toBeUndefined();
  });
});

describe('resolveZeitstempel — Nachlauf (herkunft=backfill)', () => {
  const empfangenAt = new Date('2026-07-17T12:00:00.000Z');

  it('nimmt einen Monate alten Zeitstempel an — genau dafuer ist der Nachlauf da', () => {
    // Gemessen am Empfangszeitpunkt fiel bis hierher JEDER Nachlauf aelter als
    // 48 Stunden in die Quarantaene. Die Herkunft `backfill` existierte damit
    // im Code, war aber nicht verwendbar.
    const ts = resolveZeitstempel(
      'geraet',
      { ...BASIS_MESSWERT, deviceTimestampIso: '2026-04-02T03:00:00.000Z' },
      BASIS_ENVELOPE,
      empfangenAt,
      'backfill',
    );
    expect(ts).toBe('2026-04-02T03:00:00.000Z');
  });

  it('lehnt einen Zeitstempel in der Zukunft weiterhin ab — auch im Nachlauf', () => {
    // Nach vorn bleibt die Grenze: ein kuenftiger Messwert wuerde einen Monat
    // mit Verbrauch fuellen, den es noch nicht gab.
    const ts = resolveZeitstempel(
      'geraet',
      { ...BASIS_MESSWERT, deviceTimestampIso: '2026-07-20T12:00:00.000Z' },
      BASIS_ENVELOPE,
      empfangenAt,
      'backfill',
    );
    expect(ts).toBeUndefined();
  });

  it('der Live-Betrieb bleibt beidseitig eng — eine falsche Geraeteuhr wird weiter erkannt', () => {
    const ts = resolveZeitstempel(
      'geraet',
      { ...BASIS_MESSWERT, deviceTimestampIso: '2026-04-02T03:00:00.000Z' },
      BASIS_ENVELOPE,
      empfangenAt,
      'ingest_live',
    );
    expect(ts).toBeUndefined();
  });
});

describe('istWertebereichPlausibel (ADR-0005 §20 Schritt 8)', () => {
  it('akzeptiert positive endliche Werte', () => {
    expect(istWertebereichPlausibel(1)).toBe(true);
    expect(istWertebereichPlausibel(0)).toBe(true);
  });

  it('lehnt negative Werte ab', () => {
    expect(istWertebereichPlausibel(-0.001)).toBe(false);
  });

  it('lehnt NaN/Infinity ab', () => {
    expect(istWertebereichPlausibel(Number.NaN)).toBe(false);
    expect(istWertebereichPlausibel(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('istMonotonPlausibel (ADR-0005 §20 Schritt 8, nur kumulativ_zaehlerstand)', () => {
  it('akzeptiert, wenn es keine Nachbarn gibt (erster Messwert des Kanals)', () => {
    expect(istMonotonPlausibel(5, undefined, undefined)).toBe(true);
  });

  it('akzeptiert einen gleich hohen oder hoeheren Wert als den Vorgaenger', () => {
    expect(istMonotonPlausibel(5, 5, undefined)).toBe(true);
    expect(istMonotonPlausibel(6, 5, undefined)).toBe(true);
  });

  it('lehnt einen niedrigeren Wert als den Vorgaenger ab', () => {
    expect(istMonotonPlausibel(4, 5, undefined)).toBe(false);
  });

  it('akzeptiert einen Wert ZWISCHEN Vorgaenger und Nachfolger — der Nachlauf-Fall', () => {
    // Der nachgereichte Stand vom 1. Januar liegt zwischen dem Stand davor
    // und dem bereits gespeicherten vom 31. Januar. Vor dem 2026-09-09 fiel
    // genau dieser Wert als "Monotonie verletzt" in die Quarantaene, weil
    // nur gegen den JUENGSTEN Wert des Kanals verglichen wurde.
    expect(istMonotonPlausibel(500, 100, 900)).toBe(true);
  });

  it('lehnt einen Wert ueber dem Nachfolger ab — der Stand waere danach gefallen', () => {
    expect(istMonotonPlausibel(1000, 100, 900)).toBe(false);
  });

  it('akzeptiert Gleichstand mit dem Nachfolger (Stillstand des Zaehlers)', () => {
    expect(istMonotonPlausibel(900, 100, 900)).toBe(true);
  });
});

describe('resolveZeitstempel — Gateway-Zeitstempel (ADR-0011 O4)', () => {
  const empfangenAt = new Date('2026-08-28T14:35:00.000Z');
  const messwert: DecodedMesswert = {
    messgroesse: 'wirkarbeit',
    wertRoh: 1,
    einheit: 'kWh',
    art: 'kumulativ_zaehlerstand',
  };

  it('nimmt `rxInfo[0].gwTime` — das Feld, das ChirpStack v4 tatsächlich führt', () => {
    const ts = resolveZeitstempel(
      'gateway_server',
      messwert,
      {
        ...BASIS_ENVELOPE,
        time: '2026-08-28T14:30:00.000Z',
        rxInfo: [{ gwTime: '2026-08-28T14:32:03.594Z' }],
      },
      empfangenAt,
    );

    expect(ts).toBe('2026-08-28T14:32:03.594Z');
  });

  it('fällt auf `time` im rxInfo zurück (ältere Fassungen)', () => {
    const ts = resolveZeitstempel(
      'gateway_server',
      messwert,
      { ...BASIS_ENVELOPE, time: '2026-08-28T14:30:00.000Z', rxInfo: [{ time: '2026-08-28T14:31:00.000Z' }] },
      empfangenAt,
    );

    expect(ts).toBe('2026-08-28T14:31:00.000Z');
  });

  it('fällt auf den Envelope-Zeitpunkt zurück, wenn kein rxInfo dabei ist', () => {
    const ts = resolveZeitstempel(
      'gateway_server',
      messwert,
      { ...BASIS_ENVELOPE, time: '2026-08-28T14:30:00.000Z' },
      empfangenAt,
    );

    expect(ts).toBe('2026-08-28T14:30:00.000Z');
  });

  it('bevorzugt gwTime auch dann, wenn beide Felder da sind', () => {
    // Vor der Korrektur lief der rxInfo-Zweig immer ins Leere und griff auf
    // den Envelope-Zeitpunkt zurück — bei einem Backfill liegen die beiden
    // weit auseinander.
    const ts = resolveZeitstempel(
      'gateway_server',
      messwert,
      {
        ...BASIS_ENVELOPE,
        time: '2026-08-28T14:30:00.000Z',
        rxInfo: [{ gwTime: '2026-08-28T14:32:03.594Z', time: '2026-08-28T14:31:00.000Z' }],
      },
      empfangenAt,
    );

    expect(ts).toBe('2026-08-28T14:32:03.594Z');
  });
});

