import type { MessgroesseArt } from '../decoder/geraetetyp-decoder.types';
import { SYNTHETISCH_REFERENZ_V1_GERAETETYP } from '../decoder/synthetisch-referenz-v1.decoder';

/**
 * ADR-0005 §16 (D4) — versionierte Fixture (Vertrauensanker-Prinzip, F3):
 * Aenderungen am ChirpStack-Envelope-Format erfordern eine BEWUSSTE
 * Fixture-Aktualisierung (Versionsnummer erhoehen), kein impliziter Drift.
 */
export const SYNTHETIC_UPLINK_FIXTURE_VERSION = 1;

export interface SyntheticUplinkInput {
  /** Platzhalter-DevEUI (offensichtlich synthetisch, z. B. "AA-AA-AA-AA-AA-AA-AA-01"). */
  readonly devEui: string;
  readonly applicationId?: string;
  readonly messgroesse?: string;
  readonly obisKennzahl?: string;
  readonly wertRoh: number;
  readonly einheit?: string;
  readonly art?: MessgroesseArt;
  /** UTC-ISO-8601, Pflicht (der Referenz-Decoder ist `zeitstempelQuelle='geraet'`). */
  readonly deviceTimestampIso: string;
  readonly fPort?: number;
}

export interface SyntheticUplink {
  readonly topic: string;
  readonly payload: Buffer;
}

const DEFAULT_APPLICATION_ID = '1';
const DEFAULT_FPORT = 10;
const DEFAULT_MESSGROESSE = 'wirkarbeit';
const DEFAULT_EINHEIT = 'kWh';
const DEFAULT_ART: MessgroesseArt = 'kumulativ_zaehlerstand';

/**
 * Baut Topic + Payload EXAKT im Format, das `SynthetischReferenzV1Decoder`
 * (`geraetetyp='synthetisch-referenz-v1'`) und der Ingest-Flow (§20)
 * erwarten — geteilte Quelle der Wahrheit zwischen Publisher und Worker
 * (kein unabhaengig gepflegtes zweites Fixture-Format).
 */
export function buildSyntheticUplink(input: SyntheticUplinkInput): SyntheticUplink {
  const applicationId = input.applicationId ?? DEFAULT_APPLICATION_ID;
  const fPort = input.fPort ?? DEFAULT_FPORT;
  const nowIso = new Date().toISOString();

  const messwertPayload = {
    messgroesse: input.messgroesse ?? DEFAULT_MESSGROESSE,
    ...(input.obisKennzahl !== undefined ? { obisKennzahl: input.obisKennzahl } : {}),
    wertRoh: input.wertRoh,
    einheit: input.einheit ?? DEFAULT_EINHEIT,
    art: input.art ?? DEFAULT_ART,
    deviceTimestampIso: input.deviceTimestampIso,
  };

  const envelope = {
    deviceInfo: { devEui: input.devEui },
    fPort,
    data: Buffer.from(JSON.stringify(messwertPayload), 'utf8').toString('base64'),
    time: nowIso,
    rxInfo: [{ time: nowIso }],
  };

  return {
    topic: `application/${applicationId}/device/${input.devEui}/event/up`,
    payload: Buffer.from(JSON.stringify(envelope), 'utf8'),
  };
}

/** Referenz auf den Geraetetyp, fuer den dieses Fixture-Format gilt (Dokumentationszweck/Tests). */
export const SYNTHETIC_UPLINK_GERAETETYP = SYNTHETISCH_REFERENZ_V1_GERAETETYP;
