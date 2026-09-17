import { Injectable } from '@nestjs/common';
import { BlindIndexService } from '../../common/crypto/blind-index.service';
import { DecoderRegistry } from '../decoder/decoder-registry';
import type { DecodedMesswert, GeraetetypDecoder } from '../decoder/geraetetyp-decoder.types';
import { DeviceForwardLookupRepository } from '../persistence/device-forward-lookup.repository';
import { EnergyStammdatenLookupRepository } from '../persistence/energy-stammdaten-lookup.repository';
import { HerkunftAbgleichRepository } from '../persistence/herkunft-abgleich.repository';
import { MesswertSchreibpfadRepository } from '../persistence/messwert-schreibpfad.repository';
import { IngestQuarantaeneRepository } from '../persistence/ingest-quarantaene.repository';
import type { QuarantaenePayload } from '../persistence/ingest-quarantaene.repository';
import { ConsentGateRepository } from '../persistence/consent-gate.repository';
import { VerwurfAggregatRepository } from '../persistence/verwurf-aggregat.repository';
import { ConsentEnforcementConfig } from '../config/consent-enforcement.config';
import { EnvelopeParseError, parseUplinkEnvelope } from './envelope-parser.util';
import type { ChirpStackUplinkEnvelope } from './envelope.types';
import { loadIngestQuelleCode } from '../config/ingest-quelle.config';
import { hashRohpayload, redigiereEnvelopeFuerQuarantaene } from './quarantaene-redaction.util';
import { herkunftCode } from './messwert-codes';
import type { IngestHerkunft } from './messwert-codes';
import { QUALITAET_GEMESSEN } from './messwert-codes';
import { istMonotonPlausibel, istWertebereichPlausibel, resolveZeitstempel } from './plausibilitaet.util';
import { istSkalensprungVerdacht, SKALENSPRUNG_HISTORIE_WERTE } from './skalensprung.util';
import { IngestLoggerService } from './ingest-logger.service';
import { IngestMetricsService } from './ingest-metrics.service';
import type { IngestReasonCode } from './reason-code';

export interface UplinkVerarbeitenInput {
  /** Bereits redigiert (RL-2) — s. `mqtt/mqtt-topic-redaction.util.ts`. */
  readonly topicRedacted: string;
  readonly payload: Buffer;
  /** ADR-0005 §21 (D9) — Default `ingest_live` (Live-MQTT-Pfad). */
  readonly herkunft?: IngestHerkunft;
}

interface MesswertKontext {
  readonly zaehlerId: string;
  readonly decoder: GeraetetypDecoder;
  readonly envelope: ChirpStackUplinkEnvelope;
  readonly topicRedacted: string;
  readonly deveuiBlindIndex: Buffer;
  readonly herkunft: IngestHerkunft;
  readonly empfangenAt: Date;
}

/**
 * ADR-0005 §20 (D8) — die Ingest-Flow-Pipeline: Envelope-Parse → Blind-Index
 * → Korrelation → Decode → (je Messwert) Kanal-Aufloesung → Plausibilitaet →
 * Zeitstempel-Wahl → idempotenter Upsert → Freshness. JEDER Fehlerpfad
 * schreibt Dead-Letter statt zu werfen — "nie crashen" (§23): diese Methode
 * wirft NUR bei einem echten INFRASTRUKTUR-Fehler (z. B. DB-Verbindung
 * verloren waehrend eines Repository-Aufrufs) weiter nach oben — der
 * `MqttSubscriberAdapter` faengt das ab und sendet KEIN Ack (Redelivery,
 * §15/M3). Business-/Validierungsfehler werden HIER selbst behandelt
 * (Quarantaene + `return`), OHNE zu werfen.
 */
@Injectable()
export class IngestFlowService {
  constructor(
    private readonly blindIndexService: BlindIndexService,
    private readonly forwardLookupRepository: DeviceForwardLookupRepository,
    private readonly energyRepository: EnergyStammdatenLookupRepository,
    private readonly herkunftAbgleichRepository: HerkunftAbgleichRepository,
    private readonly decoderRegistry: DecoderRegistry,
    private readonly schreibpfadRepository: MesswertSchreibpfadRepository,
    private readonly quarantaeneRepository: IngestQuarantaeneRepository,
    private readonly logger: IngestLoggerService,
    private readonly metrics: IngestMetricsService,
    // ADR-0012 E5/Stufe C — MECHANISMUS, standardmaessig AUS
    // (`ConsentEnforcementConfig.enforced === false`, s. dortiger
    // Kommentar). Beide Abhaengigkeiten sind bewusst am ENDE der
    // Parameterliste ergaenzt, nicht dazwischengeschoben — bestehende
    // Konstruktor-Aufrufe (Tests, DI) bleiben an den vorderen Positionen
    // unveraendert gueltig.
    private readonly consentGateRepository: ConsentGateRepository,
    private readonly verwurfAggregat: VerwurfAggregatRepository,
    private readonly consentEnforcementConfig: ConsentEnforcementConfig,
  ) {}

  /**
   * Kennung des Netzservers, den DIESER Prozess bedient (ADR-0011 D8).
   * Einmal beim Start gelesen — sie aendert sich zur Laufzeit nicht, und ein
   * Fehlschlag soll beim Start auffallen, nicht beim ersten Uplink.
   */
  private readonly quelleCode = loadIngestQuelleCode();

  async verarbeiteUplink(input: UplinkVerarbeitenInput): Promise<void> {
    const herkunft: IngestHerkunft = input.herkunft ?? 'ingest_live';

    // EIN "jetzt"-Wert fuer die gesamte Uplink-Verarbeitung, hier am
    // Pipeline-Eintritt eingefroren — dient als `empfangenAt` (Zeitstempel-
    // Fallback, Schritt 8c).
    //
    // Er wird NICHT mehr an das Consent-Gate (Schritt 4b) durchgereicht
    // (Auflage C-2/B-1, `compliance-director`-Votum zu ADR-0012 E5/Stufe C):
    // Die urspruengliche Fassung uebergab diesen Zeitpunkt als Parameter an
    // `consent.ingest_rechtsgrundlage_wirksam(...)` — das war KEIN
    // Stilproblem, sondern machte aus dem Boolean-Orakel ein Historien-
    // Orakel. `edms_ingest_worker` haelt `SELECT` auf die volle Zeile von
    // `energy.zaehler` (V0010), kann also jede Zaehler-ID aufzaehlen; mit
    // einem frei waehlbaren Zeitpunkt-Parameter waere der exakte
    // Widerrufszeitpunkt jedes Anschlussnutzers per Binaersuche auf die
    // Sekunde rekonstruierbar gewesen. Die Funktion bildet `now()` jetzt
    // SELBST (Migration V0084) — A12-12 ("bewertet gegen den
    // Verarbeitungszeitpunkt, nicht gegen `ts`") ist damit eine
    // Schema-Eigenschaft, keine Zusicherung in einem TypeScript-Kommentar.
    const verarbeitungszeitpunkt = new Date();

    // Schritt 1/2 — Envelope-Parse (SEC-1: bei Parse-Fehler KEINE
    // Rohpayload, nur Laenge+Hash — es existiert noch kein geparstes Objekt).
    let envelope: ChirpStackUplinkEnvelope;
    try {
      envelope = parseUplinkEnvelope(input.payload);
    } catch (error: unknown) {
      if (error instanceof EnvelopeParseError) {
        await this.quarantaeneSecOne(input.payload, input.topicRedacted);
        return;
      }
      throw error;
    }

    // Schritt 3 — DevEUI (lokale, funktionsgebundene Variable, §26.6) →
    // Blind-Index. Ein Format-Fehler HIER zaehlt ADR-0005 §26.6 Punkt 6
    // zufolge ebenfalls als envelope_parse_fehler (SEC-1-Sonderform, s. o.).
    let blindIndex: Buffer;
    try {
      const berechnet = await this.blindIndexService.berechne(envelope.deviceInfo.devEui);
      blindIndex = berechnet.blindIndex;
    } catch {
      await this.quarantaeneSecOne(input.payload, input.topicRedacted);
      return;
    }
    // Ab hier verlaesst devEui den Geltungsbereich (§26.6 Punkt 4) — die
    // Variable wird nie wieder referenziert (auch nicht in einem Log/Fehler).

    // Schritt 4 — Korrelation (Forward-Lookup, §26.3/§26.6).
    const zaehlerId = await this.forwardLookupRepository.findAktivenZaehler(blindIndex);
    if (zaehlerId === undefined) {
      this.metrics.lookupDevEuiUnbekannt();
      await this.quarantaeneRedacted('devEUI_unbekannt', envelope, input.topicRedacted, { deveuiBlindIndex: blindIndex });
      return;
    }
    this.metrics.lookupErfolg();

    // Schritt 4a — Herkunfts-Abgleich (ADR-0011 B3/D4). Bewusst HIER, direkt
    // nach der Korrelation und VOR jedem Decode-Aufwand: Ein Uplink, der beim
    // falschen Endkunden landen wuerde, soll gar nicht erst dekodiert werden.
    //
    // Der Abgleich laeuft nur, wenn der Uplink ueberhaupt eine Mandanten-
    // Kennung traegt — aeltere ChirpStack-Fassungen und andere Netzserver
    // senden sie nicht, und aus einer fehlenden Angabe laesst sich kein
    // Widerspruch ableiten.
    //
    // AUSDRUECKLICH BENANNTE AUSNAHME VON A12-13 (Auflage C-4b): Dieser Zweig
    // schreibt bei einem Widerspruch eine Quarantaene-Zeile MIT `zaehlerId`
    // (`quarantaeneRedacted(...)` unten) — UND DAS, BEVOR das Consent-Gate
    // (Schritt 4b) ueberhaupt gelaufen ist. Ein Endkunde/Anschlussnutzer ohne
    // wirksame Rechtsgrundlage koennte also durchaus noch eine
    // Quarantaene-Zeile bekommen, wenn zusaetzlich ein Herkunfts-Widerspruch
    // vorliegt. Das ist vertretbar (der Herkunfts-Abgleich dient einem
    // ANDEREN Schutzziel — Fehlzuordnung zwischen Endkunden, ADR-0011 D4 —
    // und muss laut jenem ADR fail-closed VOR jedem weiteren Schritt greifen,
    // auch vor dem Consent-Gate), aber es IST eine bewusste Ausnahme von
    // A12-13 und wird hier als solche benannt, nicht stillschweigend
    // hingenommen.
    if (envelope.deviceInfo.tenantId !== undefined) {
      const abgleich = await this.herkunftAbgleichRepository.pruefe(zaehlerId, envelope.deviceInfo.tenantId);
      if (abgleich.art === 'widerspruch') {
        this.logger.herkunftWiderspruch({
          zaehlerId,
          erwarteterEndkundeId: abgleich.erwarteterEndkundeId,
          tatsaechlicherEndkundeId: abgleich.tatsaechlicherEndkundeId,
        });
        await this.quarantaeneRedacted('herkunft_widerspruechlich', envelope, input.topicRedacted, {
          zaehlerId,
          deveuiBlindIndex: blindIndex,
        });
        return;
      }
    }

    // Schritt 4b — Rechtsgrundlagen-Gate (ADR-0012 E5, Stufe C). Der
    // Schalter ist standardmaessig AUS (`ConsentEnforcementConfig`, s.
    // dortiger Kommentar fuer die Freigabe-Voraussetzungen) — im Aus-Zustand
    // ist dieser Block ein reines no-op, und der Pfad bleibt BYTE-IDENTISCH
    // zum bisherigen Verhalten (kein DB-Aufruf, kein Verhaltensunterschied).
    //
    // Bewusst HIER platziert: NACH dem Herkunfts-Abgleich (derselbe
    // "billig zuerst"-Grundsatz wie dort, s. aber auch den Kommentar zu
    // Schritt 4a — bewusste Ausnahme von A12-13 fuer den Widerspruchsfall),
    // aber VOR Schritt 5/6 (Decoder-Aufloesung/Decode) — eine Person ohne
    // Rechtsgrundlage bekommt nicht einmal den Decode-Aufwand.
    //
    // KEIN Zeitpunkt-Argument mehr (Auflage C-2): `messdatenVerarbeitungErlaubt`
    // nimmt seit Migration V0084 nur noch `zaehlerId` entgegen — die Funktion
    // bildet `now()` selbst, s. Kommentar an `verarbeitungszeitpunkt` oben und
    // an `ConsentGateRepository`.
    if (this.consentEnforcementConfig.enforced) {
      const rechtsgrundlageWirksam = await this.consentGateRepository.messdatenVerarbeitungErlaubt(zaehlerId);
      if (!rechtsgrundlageWirksam) {
        // A12-13: VERWORFEN, NICHT quarantaeniert — eine Zeile mit offener
        // Loeschfrist wuerde die Wirkung eines Widerrufs umkehren. A12-14:
        // trotzdem zaehlbar ueber Metrik + Log OHNE PII.
        //
        // KEIN `audit.event` (Auflage C-4c, geschaerfte Begruendung): Das
        // tragende Argument ist nicht "ein Ereignis mehr waere zu viel
        // Korrelation", sondern dass die Rechenschaft gar nicht am VERWURF
        // haengt, sondern an seinen EINGANGSGROESSEN. Das Gate ist eine reine
        // Funktion ueber `consent.einwilligung`, `consent.zweck_subjekt` und
        // `energy.nutzungsverhaeltnis`; Erteilung und Widerruf einer
        // Einwilligung sind bereits eigenstaendig audit-pflichtig (A2,
        // `migrations/V0045__audit_einwilligung_events.sql`,
        // `consent-audit-events.ts`). Jede einzelne Gate-Entscheidung ist
        // damit fuer JEDEN vergangenen Zeitpunkt deterministisch aus dem
        // bereits vorhandenen, manipulationsfesten Audit-Log rekonstruierbar
        // — ohne dass diese Stelle selbst noch einen Eintrag je Uplink
        // erzeugen muss. Ein Zusatz-Ereignis haette nur denselben Sachverhalt
        // (der bereits belegt ist) ein zweites Mal, subjektkorreliert und
        // dauerhaft, festgehalten.
        this.metrics.consentVerworfen();
        this.logger.consentVerworfen();
        // Auflage C-6: zusaetzlich DAUERHAFT zaehlen. Der Zaehler oben lebt
        // im Prozess und ist nach einem Neustart weg — damit waere ein
        // stiller Totalausfall des Gates nicht von "niemand hat
        // eingewilligt" zu unterscheiden. Subjektfrei und tagesgenau (V0085),
        // also kein Widerspruch zu A12-13: Die Zeile traegt keine Kennung,
        // nur "wie viele an Tag X aus Grund Y".
        //
        // Bewusst NICHT im selben `await` wie die Entscheidung: Der Uplink
        // ist an dieser Stelle bereits verworfen. Scheitert die Zaehlung
        // (Datenbank kurz weg), darf das den Verwurf nicht in einen Fehler
        // verwandeln und schon gar nicht dazu fuehren, dass der Wert doch
        // geschrieben wird.
        try {
          await this.verwurfAggregat.zaehle('rechtsgrundlage_fehlt');
        } catch (fehler) {
          // `infraFehler` traegt Kontext und Fehlermeldung, kein Subjekt —
          // dieselbe Linie wie die Verwurf-Zeile darueber.
          this.logger.infraFehler('verwurf_tagesaggregat', fehler);
        }
        return;
      }
    }

    // Schritt 5/6 — Geraetetyp auflösen + Decoder-Registry.
    const geraetetyp = await this.energyRepository.findGeraetetyp(zaehlerId);
    const decoder = geraetetyp === undefined ? undefined : this.decoderRegistry.resolve(geraetetyp);
    if (decoder === undefined) {
      await this.quarantaeneRedacted('unbekannter_geraetetyp', envelope, input.topicRedacted, {
        zaehlerId,
        deveuiBlindIndex: blindIndex,
      });
      return;
    }

    let decodedMesswerte: DecodedMesswert[];
    try {
      const rohdaten = Buffer.from(envelope.data, 'base64');
      decodedMesswerte = decoder.decode({
        data: rohdaten,
        fPort: envelope.fPort,
        ...(envelope.objekt !== undefined ? { objekt: envelope.objekt } : {}),
      });
    } catch {
      await this.quarantaeneRedacted('decode_fehler', envelope, input.topicRedacted, {
        zaehlerId,
        deveuiBlindIndex: blindIndex,
      });
      return;
    }

    const kontext: MesswertKontext = {
      zaehlerId,
      decoder,
      envelope,
      topicRedacted: input.topicRedacted,
      deveuiBlindIndex: blindIndex,
      herkunft,
      empfangenAt: verarbeitungszeitpunkt,
    };

    // Ein Uplink kann mehrere Messwerte/Kanaele tragen (Mehrkanal-Zaehler) —
    // jeder wird UNABHAENGIG verarbeitet (ein fehlerhafter Kanal blockiert
    // nicht die anderen im selben Uplink, Entscheidung s. Auslieferungsbericht).
    //
    // QA-6 (Phase-5-QA-Review) — PRAEZISIERUNG des Geltungsbereichs: diese
    // Unabhaengigkeits-Garantie gilt ERST AB HIER, also fuer die Verarbeitung
    // eines bereits erfolgreich decodierten Arrays (Kanal-Aufloesung,
    // Plausibilitaet, Schreibpfad je einzelnem `messwert`). Sie gilt NICHT
    // fuer den `decoder.decode(...)`-Aufruf weiter oben: dieser ist ATOMAR
    // je Uplink — bereits EIN strukturell fehlerhafter Eintrag im
    // Mehrwert-Array laesst `decode()` fuer den GESAMTEN Uplink werfen (=>
    // EIN `decode_fehler`-Dead-Letter, KEIN Teilerfolg fuer die uebrigen,
    // an sich validen Eintraege desselben Uplinks), s. Decoder-Vertrag in
    // `geraetetyp-decoder.types.ts`/`synthetisch-referenz-v1.decoder.ts`.
    for (const messwert of decodedMesswerte) {
      await this.verarbeiteMesswert(kontext, messwert);
    }
  }

  private async verarbeiteMesswert(kontext: MesswertKontext, messwert: DecodedMesswert): Promise<void> {
    // Schritt 7 — Kanal-Aufloesung (S3c).
    const kanal = await this.energyRepository.findAktivenMesskanal(
      kontext.zaehlerId,
      messwert.messgroesse,
      messwert.obisKennzahl,
    );
    if (kanal === undefined) {
      await this.quarantaeneRedacted('kanal_unbekannt', kontext.envelope, kontext.topicRedacted, {
        zaehlerId: kontext.zaehlerId,
        deveuiBlindIndex: kontext.deveuiBlindIndex,
      });
      return;
    }

    // Schritt 8a — Einheiten-Konsistenz.
    if (messwert.einheit !== kanal.einheit) {
      await this.quarantaeneRedacted('einheit_inkonsistent', kontext.envelope, kontext.topicRedacted, {
        zaehlerId: kontext.zaehlerId,
        messkanalKey: kanal.kanalKey,
        deveuiBlindIndex: kontext.deveuiBlindIndex,
      });
      return;
    }

    // Schritt 8b — Wertebereich (auf unplausibel_monotonie_verletzt
    // abgebildet, s. plausibilitaet.util.ts-Kommentar — DB kennt keinen
    // eigenen Reason-Code fuer "Wertebereich").
    if (!istWertebereichPlausibel(messwert.wertRoh)) {
      await this.quarantaeneRedacted('unplausibel_monotonie_verletzt', kontext.envelope, kontext.topicRedacted, {
        zaehlerId: kontext.zaehlerId,
        messkanalKey: kanal.kanalKey,
        deveuiBlindIndex: kontext.deveuiBlindIndex,
      });
      return;
    }

    // Schritt 8c — Zeitstempel-Wahl (TD-2, statisch je Decoder).
    //
    // REIHENFOLGE GEAENDERT (2026-09-09): Der Zeitstempel wird VOR der
    // Monotonie-/Skalensprung-Pruefung aufgeloest, frueher war es umgekehrt.
    // Grund: Beide Pruefungen brauchen die zeitliche NACHBARSCHAFT des neuen
    // Wertes, und ohne `ts` gibt es keine — der alte Code verglich deshalb
    // gegen den juengsten Wert des Kanals und warf bei jedem Nachlauf
    // falsch-positive Monotonie-Verstoesse (s. `findNachbarwerte`). Ein Wert
    // ohne lesbaren Zeitstempel ist ohnehin nicht beurteilbar; er bekommt
    // jetzt `zeitstempel_fehlt` statt eines Monotonie-Grundes, und das ist
    // die genauere Auskunft.
    const ts = resolveZeitstempel(
      kontext.decoder.zeitstempelQuelle,
      messwert,
      kontext.envelope,
      kontext.empfangenAt,
      kontext.herkunft,
    );
    if (ts === undefined) {
      await this.quarantaeneRedacted('zeitstempel_fehlt', kontext.envelope, kontext.topicRedacted, {
        zaehlerId: kontext.zaehlerId,
        messkanalKey: kanal.kanalKey,
        deveuiBlindIndex: kontext.deveuiBlindIndex,
      });
      return;
    }

    // Schritt 8d — Skalensprung und Monotonie (nur kumulativ_zaehlerstand),
    // beide aus EINER Abfrage der zeitlichen Nachbarn.
    if (messwert.art === 'kumulativ_zaehlerstand') {
      const nachbarn = await this.schreibpfadRepository.findNachbarwerte(
        kanal.kanalKey,
        ts,
        SKALENSPRUNG_HISTORIE_WERTE,
      );

      // Der SPEZIFISCHE Grund vor dem unspezifischen: Ein Skalensprung nach
      // oben ist monoton plausibel — der Stand steigt ja — und liefe an der
      // Monotonie-Pruefung vorbei. Er muss deshalb VOR ihr geprueft werden,
      // sonst faengt ihn niemand (ADR-0011 O3 Punkt 3). Die Differenzreihe
      // bilden die Werte VOR diesem Zeitpunkt.
      if (istSkalensprungVerdacht({ wertNeu: messwert.wertRoh, letzteWerte: nachbarn.vorherige })) {
        await this.quarantaeneRedacted('skalensprung_verdacht', kontext.envelope, kontext.topicRedacted, {
          zaehlerId: kontext.zaehlerId,
          messkanalKey: kanal.kanalKey,
          deveuiBlindIndex: kontext.deveuiBlindIndex,
        });
        return;
      }

      if (!istMonotonPlausibel(messwert.wertRoh, nachbarn.vorherige[0], nachbarn.naechster)) {
        await this.quarantaeneRedacted('unplausibel_monotonie_verletzt', kontext.envelope, kontext.topicRedacted, {
          zaehlerId: kontext.zaehlerId,
          messkanalKey: kanal.kanalKey,
          deveuiBlindIndex: kontext.deveuiBlindIndex,
        });
        return;
      }
    }

    // Schritt 10/11 — idempotenter Upsert + Freshness (EINE Transaktion).
    const ergebnis = await this.schreibpfadRepository.upsertMesswertUndFreshness({
      messkanalKey: kanal.kanalKey,
      ts,
      wert: messwert.wertRoh,
      qualitaet: QUALITAET_GEMESSEN,
      herkunft: herkunftCode(kontext.herkunft),
    });

    this.metrics.messwertGeschrieben();
    this.logger.messwertGeschrieben({ messkanalKey: kanal.kanalKey, geschrieben: ergebnis.geschrieben });
  }

  private async quarantaeneSecOne(payload: Buffer, topicRedacted: string): Promise<void> {
    const grund: IngestReasonCode = 'envelope_parse_fehler';
    this.metrics.quarantaene(grund);
    this.logger.quarantaene({ grund });

    const quarantaenePayload: QuarantaenePayload = {
      art: 'secOne',
      payloadLaenge: payload.length,
      payloadHash: hashRohpayload(payload),
    };
    // Kein Envelope, also keine Netzserver-Kennungen — die Quelle ist
    // trotzdem bekannt: Sie haengt am Worker, nicht an der Nachricht.
    await this.quarantaeneRepository.insert({
      grund,
      topicRedacted,
      payload: quarantaenePayload,
      quelleCode: this.quelleCode,
    });
  }

  /**
   * Herkunft eines Uplinks fuer die Quarantaene (ADR-0011 D8/D1): welcher
   * Worker ihn empfangen hat, und aus welchem Mandanten/welcher Application
   * des Netzservers das Geraet stammt.
   *
   * Ohne diese Angaben ist eine `devEUI_unbekannt`-Zeile bei mehreren Netzen
   * praktisch nicht bearbeitbar — sie traegt sonst nur einen redigierten
   * Topic-String. NUR IDs, keine Namen (s. `DeviceInfo`).
   */
  private herkunft(envelope: ChirpStackUplinkEnvelope): {
    readonly quelleCode: string;
    readonly chirpstackTenantId?: string;
    readonly chirpstackApplicationId?: string;
  } {
    return {
      quelleCode: this.quelleCode,
      ...(envelope.deviceInfo.tenantId !== undefined ? { chirpstackTenantId: envelope.deviceInfo.tenantId } : {}),
      ...(envelope.deviceInfo.applicationId !== undefined
        ? { chirpstackApplicationId: envelope.deviceInfo.applicationId }
        : {}),
    };
  }

  private async quarantaeneRedacted(
    grund: IngestReasonCode,
    envelope: ChirpStackUplinkEnvelope,
    topicRedacted: string,
    korrelation: { readonly zaehlerId?: string; readonly messkanalKey?: number; readonly deveuiBlindIndex: Buffer },
  ): Promise<void> {
    this.metrics.quarantaene(grund);
    this.logger.quarantaene({
      grund,
      ...(korrelation.zaehlerId !== undefined ? { zaehlerId: korrelation.zaehlerId } : {}),
      ...(korrelation.messkanalKey !== undefined ? { messkanalKey: korrelation.messkanalKey } : {}),
    });

    const quarantaenePayload: QuarantaenePayload = {
      art: 'redacted',
      rohpayloadRedacted: redigiereEnvelopeFuerQuarantaene(envelope),
    };
    await this.quarantaeneRepository.insert({
      grund,
      topicRedacted,
      payload: quarantaenePayload,
      ...(korrelation.zaehlerId !== undefined ? { zaehlerId: korrelation.zaehlerId } : {}),
      ...(korrelation.messkanalKey !== undefined ? { messkanalKey: korrelation.messkanalKey } : {}),
      deveuiBlindIndex: korrelation.deveuiBlindIndex,
      ...this.herkunft(envelope),
    });
  }
}
