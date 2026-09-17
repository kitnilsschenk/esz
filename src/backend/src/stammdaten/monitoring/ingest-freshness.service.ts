import { Injectable } from '@nestjs/common';
import { IngestFreshnessRepository } from '../persistence/ingest/ingest-freshness.repository';
import type {
  MesskanalFreshnessEintrag,
  UeberfaelligerKanalEintrag,
} from '../persistence/ingest/ingest-freshness.repository';
import { EnergyZaehlerRepository } from '../persistence/energy/energy-zaehler.repository';
import { paginate } from '../persistence/cursor.util';
import { toSeite } from '../common/seite.dto';
import type { Seite } from '../common/seite.dto';
import { nichtGefunden } from '../common/problem.util';
import { berechneFreshnessSchwelle } from './ingest-freshness.constants';
import type { AusfallListeItem, MesskanalFreshnessItem } from './ingest-freshness.types';

function mapAusfallListeItem(eintrag: UeberfaelligerKanalEintrag): AusfallListeItem {
  return {
    messkanalId: eintrag.messkanalId,
    zaehlerId: eintrag.zaehlerId,
    letzteUebertragung: eintrag.letzteUebertragung,
    ueberfaellig: eintrag.ueberfaellig,
    ausfallStatus: eintrag.ausfallStatus,
    ausfallSeit: eintrag.ausfallSeit,
  };
}

function mapMesskanalFreshnessItem(eintrag: MesskanalFreshnessEintrag): MesskanalFreshnessItem {
  return {
    messkanalId: eintrag.messkanalId,
    letzteUebertragung: eintrag.letzteUebertragung,
    ueberfaellig: eintrag.ueberfaellig,
    ausfallStatus: eintrag.ausfallStatus,
    ausfallSeit: eintrag.ausfallSeit,
  };
}

/**
 * ADR-0005 §27 (D15, TB-04) — Backend-Lücke 2 aus dem Betriebs-UI-Konzept:
 * `ingest.kanal_status`/`ingest.ausfall_vorgang` werden vom Ingest-Worker
 * bereits geschrieben, aber bislang von KEINEM Endpoint gelesen. Zwei
 * Konsumenten, EIN Repository (`IngestFreshnessRepository`):
 *   - `listeUeberfaellig()` — Dashboard-Kachel „Zähler mit Datenausfall"
 *     (`GET /monitoring/ausfaelle`, `read:monitoring`, aggregiert, PII-frei,
 *     Cursor-Pagination — 1:1 Muster `MonitoringService.vollstaendigkeit()`).
 *   - `freshnessJeMesskanal()` — Zähler-Detailseite
 *     (`GET /stammdaten/zaehler/{zaehlerId}/freshness`, ebenfalls
 *     `read:monitoring` — bewusst NICHT `read:verbrauch_detail`, s.
 *     Methoden-Dok).
 */
@Injectable()
export class IngestFreshnessService {
  constructor(
    private readonly freshnessRepository: IngestFreshnessRepository,
    private readonly zaehlerRepository: EnergyZaehlerRepository,
  ) {}

  async listeUeberfaellig(options: { readonly cursor?: string; readonly limit: number }): Promise<Seite<AusfallListeItem>> {
    const schwelle = berechneFreshnessSchwelle();
    const rows = await this.freshnessRepository.listUeberfaellig({
      ...(options.cursor !== undefined ? { cursor: options.cursor } : {}),
      limit: options.limit,
      schwelle,
    });

    // `paginate()` erwartet {createdAt,id} (cursor.util.ts-Konvention) — hier
    // über einen kleinen Adapter auf {createdAt=letzteUebertragung,
    // id=messkanalId} abgebildet, analog `MonitoringService.vollstaendigkeit()`.
    const adaptiert = rows.map((row) => ({ ...row, createdAt: row.letzteUebertragung, id: row.messkanalId }));
    const { daten, naechsterCursor } = paginate(adaptiert, options.limit);
    return toSeite(daten.map(mapAusfallListeItem), naechsterCursor, options.limit);
  }

  /**
   * `read:monitoring` — bewusst NICHT `read:verbrauch_detail`: „wann kam
   * zuletzt etwas an" ist ein Betriebs-Metadatum (Freshness-Zeitstempel),
   * kein Verbrauchsinhalt (kein Messwert wird hier je gelesen) — ein
   * break-glass-Zwang würde schlichtes Betriebsmonitoring praktisch
   * unbenutzbar machen (Arbeitsauftrag, wörtlich). Leere Liste (kein
   * Fehler), wenn der Zähler (noch) keine Messkanäle hat.
   */
  async freshnessJeMesskanal(zaehlerId: string): Promise<MesskanalFreshnessItem[]> {
    const zaehler = await this.zaehlerRepository.findById(zaehlerId);
    if (zaehler === undefined) {
      throw nichtGefunden('Zaehler');
    }

    const schwelle = berechneFreshnessSchwelle();
    const rows = await this.freshnessRepository.findByZaehlerId(zaehlerId, schwelle);
    return rows.map(mapMesskanalFreshnessItem);
  }
}
