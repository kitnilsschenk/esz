import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { QuarantaeneRetentionRepository } from './persistence/quarantaene-retention.repository';
import { AuditService } from '../audit/audit.service';
import { SyntheticOnlyConfigService } from '../stammdaten/synthetic/synthetic-only.config';

/**
 * Der Ereigniscode aus V0048 — WORTGLEICH mit dem dort eingetragenen Katalog.
 *
 * V0048 hat den Typ angelegt und im Datei-Kopf vermerkt, der Emitter entstehe
 * „im selben Commit". Er entstand nicht: Bis 2026-09-07 gab es die
 * Katalogzeile, aber keine Stelle, die sie schrieb — ein Loeschlauf haette
 * keine Spur hinterlassen. Nachgetragen mit dem Retention-Runner, der den
 * Lauf ueberhaupt erst startbar macht.
 */
export const QUARANTAENE_RETENTION_EVENT = 'ingest.quarantaene.retention_lauf';

/**
 * Fristen aus dem `compliance-director`-Votum vom 2026-09-05, Punkt 3.
 *
 * Sie stehen als benannte Konstanten in der ANWENDUNG, nicht im Schema —
 * dieselbe Begründung wie bei der Herzschlag-Schwelle (ADR-0011 O8): Ein
 * Schwellenwert in einem DB-Constraint wäre ohne Migration nicht
 * korrigierbar, und eine Frist ist eine Größe, die sich mit einer
 * Neubewertung ändern kann.
 */
export const NULLUNG_NACH_TAGEN = 30;
export const LOESCHUNG_NACH_TAGEN = 90;

/**
 * Absolute Obergrenze, ausnahmslos. Ein Ausfall-Vorgang, der nach einem Jahr
 * offen ist, ist ein Organisationsproblem — kein Aufbewahrungsgrund.
 */
export const OBERGRENZE_TAGE = 365;

export interface RetentionLaufErgebnis {
  readonly modus: 'probelauf' | 'ausfuehrung';
  readonly anzahlGenullt: number;
  readonly anzahlGeloescht: number;
  /** Zeilen, die wegen eines offenen Ausfall-Vorgangs stehen blieben. */
  readonly uebersprungenOffenerVorgang: number;
  readonly stichtagNullung: string;
  readonly stichtagLoeschung: string;
}

function stichtag(jetzt: Date, tage: number): Date {
  return new Date(jetzt.getTime() - tage * 24 * 60 * 60 * 1000);
}

/**
 * Retention über `ingest.eingang_quarantaene` (Votum 2026-09-05, Punkt 3).
 *
 * **Zwei Fristen an einer Tabelle**, und das ist kein Overengineering: Der
 * `deveui_blind_index` ist ein über alle Uplinks eines Geräts stabiles,
 * personenbeziehbares Korrelat mit einem Zweck, dessen Halbwertszeit in Tagen
 * gemessen wird („welche Quelle fällt gerade auf?"). Der Rest der Zeile trägt
 * den Trendwert und ist ohne ihn nicht mehr personenbeziehbar. Deshalb stirbt
 * die Spalte vor der Zeile.
 *
 * **Probelauf ist der Standard.** `fuehreAus()` verlangt ein ausdrückliches
 * Argument. Ein Löschjob, den man versehentlich scharf schalten kann, ist
 * kein Probelauf — dieselbe Linie, die das Votum für alle Retention-Jobs
 * gezogen hat (A-O6.2).
 *
 * **Nicht unter der A-O6-Sperre.** Die Fristen hier hängen nicht an der
 * F2-Arbeitsfrist und damit nicht am Zuwendungsbescheid; dieser Lauf darf
 * scharf betrieben werden, bevor A-O6 verifiziert ist (Auflage Q.6).
 */
@Injectable()
export class QuarantaeneRetentionService {
  constructor(
    private readonly repository: QuarantaeneRetentionRepository,
    private readonly auditService: AuditService,
    private readonly syntheticOnlyConfig: SyntheticOnlyConfigService,
  ) {}

  /**
   * Zählt, was ein Lauf täte — und ändert nichts.
   *
   * Der Probelauf ist nicht bloß eine Bequemlichkeit: Bevor zum ersten Mal
   * gelöscht wird, muss jemand sehen können, WIE VIEL gelöscht würde. Eine
   * unerwartet große Zahl ist ein Befund, kein Grund weiterzumachen.
   */
  @Transactional()
  async probelauf(jetzt: Date = new Date()): Promise<RetentionLaufErgebnis> {
    return this.lauf(jetzt, false);
  }

  /**
   * Führt den Lauf tatsächlich aus.
   *
   * @param bestaetigt MUSS `true` sein. Das Argument existiert, damit ein
   *   versehentlicher Aufruf nicht löscht — derselbe Gedanke wie das
   *   `--yes`-Flag des Migrations-Runners.
   */
  @Transactional()
  async fuehreAus(bestaetigt: boolean, jetzt: Date = new Date()): Promise<RetentionLaufErgebnis> {
    if (!bestaetigt) {
      throw new Error(
        'QuarantaeneRetentionService.fuehreAus() ohne Bestaetigung aufgerufen — ' +
          'ein Loeschlauf ist ein bewusster Schritt, kein Standardverhalten.',
      );
    }
    return this.lauf(jetzt, true);
  }

  private async lauf(jetzt: Date, schreibend: boolean): Promise<RetentionLaufErgebnis> {
    const stichtagNullung = stichtag(jetzt, NULLUNG_NACH_TAGEN);
    const stichtagLoeschung = stichtag(jetzt, LOESCHUNG_NACH_TAGEN);
    const obergrenze = stichtag(jetzt, OBERGRENZE_TAGE);

    // Zuerst zählen, dann handeln — in DERSELBEN Transaktion. Sonst meldete
    // der Lauf eine Zahl, die zwischen Zählung und Ausführung schon nicht
    // mehr stimmt.
    const uebersprungen = await this.repository.zaehleUebersprungeneWegenOffenemVorgang(
      stichtagLoeschung,
      obergrenze,
    );

    if (!schreibend) {
      const [genullt, geloescht] = await Promise.all([
        this.repository.zaehleNullungsKandidaten(stichtagNullung),
        this.repository.zaehleLoeschKandidaten(stichtagLoeschung, obergrenze),
      ]);
      return {
        modus: 'probelauf',
        anzahlGenullt: genullt,
        anzahlGeloescht: geloescht,
        uebersprungenOffenerVorgang: uebersprungen,
        stichtagNullung: stichtagNullung.toISOString(),
        stichtagLoeschung: stichtagLoeschung.toISOString(),
      };
    }

    // REIHENFOLGE: erst nullen, dann löschen. Umgekehrt wäre es nicht falsch,
    // aber die Zahlen wären irreführend — die gelöschten Zeilen zählten dann
    // nicht mehr als genullt, obwohl ihr Korrelat sehr wohl verschwunden ist.
    const anzahlGenullt = await this.repository.nulleBlindIndex(stichtagNullung);
    const anzahlGeloescht = await this.repository.loescheZeilen(stichtagLoeschung, obergrenze);

    const ergebnis: RetentionLaufErgebnis = {
      modus: 'ausfuehrung',
      anzahlGenullt,
      anzahlGeloescht,
      uebersprungenOffenerVorgang: uebersprungen,
      stichtagNullung: stichtagNullung.toISOString(),
      stichtagLoeschung: stichtagLoeschung.toISOString(),
    };

    await this.protokolliere(ergebnis);
    return ergebnis;
  }

  /**
   * Q.3 — ein Audit-Ereignis JE LAUF, nicht je Zeile.
   *
   * In DERSELBEN Transaktion wie die Loeschung (`@Transactional` auf
   * `fuehreAus`): Ein Lauf, der loescht und dabei sein Protokoll verliert,
   * waere schlimmer als einer, der beides nicht tut — die Zeilen waeren fort
   * und niemand koennte sagen, wann und warum.
   *
   * `actorTyp: 'system'` ist hier der richtige Wert und keine Notloesung: Der
   * Lauf hat keinen Token-Kontext (er startet ueber den Retention-Runner,
   * nicht ueber HTTP), und genau dafuer ist der Wert vorgesehen — ein
   * interner, nicht-HTTP-Emittent (`common/security/actor-typ.ts`).
   *
   * Der Kontext folgt der Whitelist aus V0048 und enthaelt BEWUSST keine
   * Kennungen, Blind-Indizes oder Topics: Ein Loeschprotokoll, das die
   * geloeschten Korrelate auffuehrt, hebt die Loeschung wieder auf.
   */
  private async protokolliere(ergebnis: RetentionLaufErgebnis): Promise<void> {
    await this.auditService.append({
      eventTyp: QUARANTAENE_RETENTION_EVENT,
      actorTyp: 'system',
      actorSub: 'retention-runner',
      ergebnis: 'ok',
      kontext: {
        // Pflicht-Tag der Kontext-Whitelist (V0048).
        synthetic: this.syntheticOnlyConfig.syntheticOnly,
        modus: ergebnis.modus,
        anzahl_genullt: ergebnis.anzahlGenullt,
        anzahl_geloescht: ergebnis.anzahlGeloescht,
        uebersprungen_offener_vorgang: ergebnis.uebersprungenOffenerVorgang,
        stichtag_nullung: ergebnis.stichtagNullung,
        stichtag_loeschung: ergebnis.stichtagLoeschung,
      },
    });
  }
}
