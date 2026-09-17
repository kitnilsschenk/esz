import { Injectable, Logger } from '@nestjs/common';
import { KlimaQuelleConfigService } from '../klima-quelle.config';
import type { KlimaAbruf, KlimaQuellePort, KlimaTagRohwert } from '../klima-quelle.port';
import { parseProduktKlimaTag } from './produkt-klima-tag.parser';
import { toDwdStationsId } from './dwd-stations-id.util';
import { leseZipEintrag } from '../../../common/zip/zip-eintrag.util';

/** Wandert nach `analytics.klima_tag.quelle` (s. Spaltenkommentar V0063). */
export const DWD_QUELLE_KENNUNG = 'dwd_cdc_kl_tag';
/** Wandert nach `analytics.klima_tag.lizenz_id` — Nutzungsbedingungen_German.pdf, Stand Mai 2024. */
export const DWD_LIZENZ_ID = 'CC-BY-4.0';

const PRODUKT_DATEI = /^produkt_klima_tag_\d{8}_\d{8}_\d{5}\.txt$/;

export class DwdAbrufFehler extends Error {}

/**
 * Realer Klima-Adapter: Tagesmitteltemperaturen aus dem Climate Data Center
 * des Deutschen Wetterdienstes (`opendata.dwd.de`, Datensatz
 * `observations_germany/climate/daily/kl`).
 *
 * **Bezugsweg — die Auflage bestimmt die Bauform.** `docs/datenquellen.md`
 * DQ-001 und `.claude/rules/dependencies.md` legen fest: Bulk-Download
 * öffentlicher Dateien, KEINE parametrisierte API, KEINE Übermittlung von
 * Endkunden-, Standort- oder Zähler-Identifikatoren (Auflage A-4). Genau so
 * ist der Adapter gebaut — er lädt zwei unveränderte, für jedermann gleiche
 * Archivdateien und wertet sie lokal aus. Ausgehend geht dabei nichts
 * mit als die öffentliche DWD-Stationsnummer, die im Dateinamen steht.
 * Insbesondere gibt es keinen Query-String, in den je ein Kundenbezug
 * geraten könnte.
 *
 * **Zwei Archive, weil DWD den Bestand zweiteilt.**
 *
 *   - `recent/tageswerte_KL_<id>_akt.zip` — die letzten ~500 Tage,
 *     VORLÄUFIG (kleines Qualitätsniveau QN_4).
 *   - `historical/tageswerte_KL_<id>_<von>_<bis>_hist.zip` — der geprüfte
 *     Bestand bis zum letzten Jahresende. Der Dateiname trägt den Zeitraum
 *     und ändert sich mit jeder Aktualisierung; er wird deshalb aus dem
 *     Verzeichnisindex aufgelöst statt geraten.
 *
 * `historical` wird nur geladen, wenn `recent` den angefragten Zeitraum
 * nicht abdeckt — ein Baseline-Jahr aus der Vergangenheit braucht es, ein
 * Nachlauf über den letzten Monat nicht. Wo sich beide überlappen, gewinnt
 * `historical`: derselbe Tag liegt dort in der geprüften Fassung vor.
 *
 * **Keine Zwischenspeicherung im Prozess.** Ein Lauf ruft die Quelle genau
 * einmal auf, und die Werte landen anschließend in `analytics.klima_tag`;
 * der zweite Lauf über denselben Zeitraum liest sie von dort und kommt hier
 * gar nicht mehr an. Ein zusätzlicher Prozess-Cache würde nur eine zweite,
 * unsichtbare Wahrheit einführen — mit der Frage, wann sie veraltet.
 */
@Injectable()
export class DwdKlimaQuelleAdapter implements KlimaQuellePort {
  private readonly logger = new Logger(DwdKlimaQuelleAdapter.name);

  constructor(private readonly config: KlimaQuelleConfigService) {}

  async holeTageswerte(stationRef: string, von: string, bis: string): Promise<KlimaAbruf> {
    const stationsId = toDwdStationsId(stationRef);
    const jeTag = new Map<string, KlimaTagRohwert>();
    const dateien: string[] = [];

    const recentDatei = `tageswerte_KL_${stationsId}_akt.zip`;
    const recent = await this.ladeProduktdatei(`recent/${recentDatei}`);
    if (recent !== null) {
      dateien.push(recentDatei);
      for (const wert of parseProduktKlimaTag(recent)) {
        jeTag.set(wert.tag, wert);
      }
    }

    if (this.brauchtHistorisch(jeTag, von)) {
      const historischDatei = await this.findeHistorischeDatei(stationsId);
      const historisch = historischDatei === null ? null : await this.ladeProduktdatei(`historical/${historischDatei}`);
      if (historisch !== null && historischDatei !== null) {
        dateien.push(historischDatei);
        // Überschreibt bewusst: derselbe Tag liegt hier geprüft vor.
        for (const wert of parseProduktKlimaTag(historisch)) {
          jeTag.set(wert.tag, wert);
        }
      }
    }

    if (dateien.length === 0) {
      throw new DwdAbrufFehler(
        `DWD-Station ${stationsId}: weder ein 'recent'- noch ein 'historical'-Archiv gefunden. ` +
          `Stationsnummer prüfen (KL_Tageswerte_Beschreibung_Stationen.txt im CDC-Verzeichnis).`,
      );
    }

    const werte = [...jeTag.values()]
      .filter((wert) => wert.tag >= von && wert.tag < bis)
      .sort((a, b) => a.tag.localeCompare(b.tag));

    this.logger.log(
      `DWD-Klimaabruf Station ${stationsId} [${von}, ${bis}): ${werte.length} Tageswerte aus ${dateien.join(' + ')}.`,
    );

    return {
      werte,
      herkunft: { quelle: DWD_QUELLE_KENNUNG, dateiVersion: dateien.join(' + '), lizenzId: DWD_LIZENZ_ID },
    };
  }

  /**
   * `recent` reicht nur, wenn es den Anfang des angefragten Zeitraums schon
   * enthält. Ist es leer oder beginnt es später als `von`, fehlt der Anfang
   * und das geprüfte Archiv muss dazu.
   */
  private brauchtHistorisch(jeTag: ReadonlyMap<string, KlimaTagRohwert>, von: string): boolean {
    let fruehester: string | null = null;
    for (const tag of jeTag.keys()) {
      if (fruehester === null || tag < fruehester) {
        fruehester = tag;
      }
    }
    return fruehester === null || von < fruehester;
  }

  /**
   * Der Dateiname im `historical`-Verzeichnis trägt den abgedeckten Zeitraum
   * und ist deshalb nicht vorhersagbar. Statt zu raten wird der
   * Verzeichnisindex gelesen — eine gewöhnliche, für alle gleiche
   * HTML-Auflistung, kein API-Aufruf.
   */
  private async findeHistorischeDatei(stationsId: string): Promise<string | null> {
    const index = await this.ladeText('historical/');
    if (index === null) {
      return null;
    }

    const muster = new RegExp(`tageswerte_KL_${stationsId}_\\d{8}_\\d{8}_hist\\.zip`, 'g');
    const treffer = [...new Set(index.match(muster) ?? [])].sort();
    // Bei mehreren Ständen gewinnt der jüngste (Name endet auf das Bis-Datum).
    return treffer.at(-1) ?? null;
  }

  /** `null`, wenn die Datei nicht existiert (404) — jeder andere Fehler wirft. */
  private async ladeProduktdatei(pfad: string): Promise<string | null> {
    const archiv = await this.ladeBinaer(pfad);
    if (archiv === null) {
      return null;
    }
    const eintrag = leseZipEintrag(archiv, (name) => PRODUKT_DATEI.test(name));
    // CDC-Dateien sind Latin-1 (deutsche Stationsnamen in den Metadaten);
    // die Produktdatei selbst ist reines ASCII, latin1 ist hier die
    // verlustfreie Lesart.
    return eintrag.inhalt.toString('latin1');
  }

  private async ladeText(pfad: string): Promise<string | null> {
    const rohdaten = await this.ladeBinaer(pfad);
    return rohdaten === null ? null : rohdaten.toString('latin1');
  }

  private async ladeBinaer(pfad: string): Promise<Buffer | null> {
    const url = `${this.config.dwdBasisUrl}/${pfad}`;
    let antwort: Response;

    try {
      antwort = await fetch(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(this.config.dwdTimeoutMs),
      });
    } catch (fehler) {
      throw new DwdAbrufFehler(
        `DWD-Abruf '${url}' fehlgeschlagen: ${fehler instanceof Error ? fehler.message : 'unbekannt'}.`,
      );
    }

    if (antwort.status === 404) {
      return null;
    }
    if (!antwort.ok) {
      throw new DwdAbrufFehler(`DWD-Abruf '${url}' beantwortet mit HTTP ${antwort.status}.`);
    }

    const angekuendigt = Number.parseInt(antwort.headers.get('content-length') ?? '', 10);
    if (Number.isFinite(angekuendigt) && angekuendigt > this.config.dwdMaxDownloadBytes) {
      throw new DwdAbrufFehler(
        `DWD-Abruf '${url}': ${angekuendigt} Bytes angekündigt, Grenze ist ${this.config.dwdMaxDownloadBytes} (EDMS_DWD_MAX_DOWNLOAD_BYTES).`,
      );
    }

    const rohdaten = Buffer.from(await antwort.arrayBuffer());
    if (rohdaten.byteLength > this.config.dwdMaxDownloadBytes) {
      // Ohne Content-Length erst hier feststellbar — die Grenze gilt trotzdem.
      throw new DwdAbrufFehler(
        `DWD-Abruf '${url}': ${rohdaten.byteLength} Bytes empfangen, Grenze ist ${this.config.dwdMaxDownloadBytes} (EDMS_DWD_MAX_DOWNLOAD_BYTES).`,
      );
    }

    return rohdaten;
  }
}
