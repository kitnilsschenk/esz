import { Injectable } from '@nestjs/common';
import type {
  DecodedMesswert,
  ErwarteterMesskanal,
  GeraetetypDecoder,
  MessgroesseArt,
  UplinkFrame,
} from './geraetetyp-decoder.types';

/** `energy.zaehler.geraetetyp`-Wert dieses Referenz-Gerätetyps (ADR-0005 §23). */
export const SYNTHETISCH_REFERENZ_V1_GERAETETYP = 'synthetisch-referenz-v1';

/**
 * SA-2/PE-11 (Phase-5-Security-/Performance-Review) — Obergrenze der
 * Eintragsanzahl je Uplink-Array. JEDER decodierte Eintrag durchlaeuft in
 * `IngestFlowService.verarbeiteMesswert` mehrere SEQUENZIELLE DB-Anfragen
 * (Kanal-Aufloesung, ggf. Monotonie-Vorleser, Upsert) — ein unbegrenzt
 * grosses Array wuerde einen einzelnen Uplink zu beliebig vielen
 * DB-Roundtrips aufblasen und (kombiniert mit "Ack nach Commit" + strikt
 * sequenzieller Verarbeitung, §15/§20 Schritt 12) den gesamten Worker fuer
 * die gesamte Bearbeitungszeit blockieren. Ein reales Mehrkanal-Geraet
 * dieses Referenztyps hat praktisch nie mehr als eine Handvoll Kanaele
 * (z. B. Wirk-/Blindarbeit-Register eines Mehrtarif-Zaehlers) — 64 ist
 * grosszuegig bemessen und liegt weit oberhalb jedes plausiblen realen
 * Mehrkanal-Uplinks, bindet aber ein pathologisch/mutwillig grosses Array.
 * Verstoss => regulaerer Decoder-Fehler (`decode_fehler`, §23 — der
 * Aufrufer unterscheidet nicht nach Fehlerart).
 */
export const MAX_EINTRAEGE_JE_UPLINK = 64;

function istMessgroesseArt(value: unknown): value is MessgroesseArt {
  return value === 'kumulativ_zaehlerstand' || value === 'intervall_verbrauch';
}

/**
 * ADR-0005 §23 — v1 = EIN synthetischer Referenz-Gerätetyp. Payload ist
 * **JSON** (kein Bit-gepacktes Binärformat — spart eine Codec-Bibliothek für
 * v1). `rohframe.data` ist bereits die base64-dekodierten Rohbytes des
 * `data`-Felds aus dem ChirpStack-Envelope (Dekodierung passiert im
 * Ingest-Flow, s. `envelope-parser.util.ts`).
 *
 * Erwartete Payload-Form (UTF-8-JSON): EIN Objekt ODER ein Array von
 * Objekten (mehrere Messwerte/Kanäle in einem Uplink), je Objekt:
 *
 * ```json
 * {
 *   "messgroesse": "wirkarbeit",
 *   "obisKennzahl": "1.8.0",
 *   "wertRoh": 12345.678,
 *   "einheit": "kWh",
 *   "art": "kumulativ_zaehlerstand",
 *   "deviceTimestampIso": "2026-07-17T12:00:00Z"
 * }
 * ```
 *
 * `zeitstempelQuelle='geraet'` — jeder decodierte Messwert MUSS
 * `deviceTimestampIso` tragen (TD-2); fehlt es, entscheidet der Ingest-Flow
 * (nicht dieser Decoder) über `zeitstempel_fehlt` (statischer Vertrag, kein
 * Laufzeit-Fallback).
 *
 * Wirft bei JEDEM strukturellen Problem (kein `Error`-Subtyp nötig — der
 * Aufrufer unterscheidet nicht nach Fehlerart, jede Exception wird
 * `decode_fehler`, §23).
 *
 * **QA-6 (Phase-5-QA-Review) — Praezisierung, ATOMAR je Aufruf/Uplink:**
 * dies gilt AUCH bei einem Array-Payload fuer den GESAMTEN `decode()`-
 * Aufruf — bereits EIN strukturell fehlerhafter Eintrag im Array laesst
 * `decode()` werfen, wodurch AUCH die uebrigen, an sich validen Eintraege
 * DESSELBEN Uplinks verworfen werden (kein Teilerfolg, kein "valide
 * Eintraege durchlassen, kaputte einzeln quarantaenisieren" fuer diese
 * Decoder-Stufe). Das ist eine BEWUSSTE v1-Vereinfachung des ADR-0005-§23-
 * Vertrags (`GeraetetypDecoder.decode()` liefert entweder EIN vollstaendiges
 * Array oder wirft) — NICHT im Widerspruch zum "ein fehlerhafter Kanal
 * blockiert nicht die anderen"-Kommentar in `ingest-flow.service.ts`: jener
 * Kommentar beschreibt die Unabhaengigkeits-Garantie AB der Kanal-Aufloesung
 * (Schritt 7), also ERST NACHDEM `decode()` bereits erfolgreich ein
 * vollstaendiges Array zurueckgegeben hat. Eine echte Per-Eintrag-
 * Fehlertoleranz INNERHALB von `decode()` waere eine Aenderung des
 * `GeraetetypDecoder`-Schnittstellenvertrags selbst (Rueckgabeform muesste
 * erfolgreiche UND fehlerhafte Eintraege gemischt transportieren koennen)
 * und ist als moeglicher Phase-4-Ausbau bewusst NICHT Teil dieses Fixes.
 */
@Injectable()
export class SynthetischReferenzV1Decoder implements GeraetetypDecoder {
  readonly geraetetyp = SYNTHETISCH_REFERENZ_V1_GERAETETYP;
  readonly version = 1;
  /**
   * LEER, und das ist keine Auslassung: Dieser Decoder liest Messgroesse,
   * Einheit und Art AUS DEM PAYLOAD — er legt sie nicht fest. Welche Kanaele
   * ein synthetisches Geraet befuellt, entscheidet der Erzeuger des Uplinks,
   * nicht der Decoder. Eine Vorlage waere hier eine Behauptung.
   */
  readonly erwarteteKanaele: readonly ErwarteterMesskanal[] = [];

  readonly zeitstempelQuelle = 'geraet' as const;

  decode(rohframe: UplinkFrame): DecodedMesswert[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rohframe.data.toString('utf8'));
    } catch {
      throw new Error('SynthetischReferenzV1Decoder: Payload ist kein gueltiges JSON.');
    }

    const eintraege = Array.isArray(parsed) ? parsed : [parsed];
    if (eintraege.length === 0) {
      throw new Error('SynthetischReferenzV1Decoder: Payload enthaelt keinen Messwert-Eintrag.');
    }
    if (eintraege.length > MAX_EINTRAEGE_JE_UPLINK) {
      throw new Error(
        `SynthetischReferenzV1Decoder: Payload enthaelt ${eintraege.length} Eintraege, mehr als die Obergrenze ` +
          `von ${MAX_EINTRAEGE_JE_UPLINK} je Uplink (SA-2/PE-11).`,
      );
    }

    return eintraege.map((eintrag) => this.parseEintrag(eintrag));
  }

  private parseEintrag(eintrag: unknown): DecodedMesswert {
    if (typeof eintrag !== 'object' || eintrag === null) {
      throw new Error('SynthetischReferenzV1Decoder: Messwert-Eintrag ist kein Objekt.');
    }

    const obj = eintrag as Record<string, unknown>;
    const messgroesse = obj['messgroesse'];
    const wertRoh = obj['wertRoh'];
    const einheit = obj['einheit'];
    const art = obj['art'];
    const obisKennzahl = obj['obisKennzahl'];
    const deviceTimestampIso = obj['deviceTimestampIso'];

    if (typeof messgroesse !== 'string' || messgroesse.length === 0) {
      throw new Error('SynthetischReferenzV1Decoder: "messgroesse" fehlt oder ist kein nicht-leerer String.');
    }
    if (typeof wertRoh !== 'number' || !Number.isFinite(wertRoh)) {
      throw new Error('SynthetischReferenzV1Decoder: "wertRoh" fehlt oder ist keine endliche Zahl.');
    }
    if (typeof einheit !== 'string' || einheit.length === 0) {
      throw new Error('SynthetischReferenzV1Decoder: "einheit" fehlt oder ist kein nicht-leerer String.');
    }
    if (!istMessgroesseArt(art)) {
      throw new Error(
        'SynthetischReferenzV1Decoder: "art" fehlt oder ist kein gueltiger Wert (kumulativ_zaehlerstand|intervall_verbrauch).',
      );
    }

    return {
      messgroesse,
      wertRoh,
      einheit,
      art,
      ...(typeof obisKennzahl === 'string' ? { obisKennzahl } : {}),
      ...(typeof deviceTimestampIso === 'string' ? { deviceTimestampIso } : {}),
    };
  }
}
