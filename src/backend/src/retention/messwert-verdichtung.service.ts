import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { KANAL_BATCH, MesswertVerdichtungRepository } from './persistence/messwert-verdichtung.repository';

/**
 * Die Zeitzone, in der der lokale Kalendertag geschnitten wird.
 *
 * Als Konstante in der ANWENDUNG, nicht im Schema — dieselbe Linie wie bei
 * den Quarantäne-Fristen und der Herzschlag-Schwelle. Der Wert ist derselbe,
 * den ADR-0006 D4 für die Tagesbildung der Berechnung festlegt; er steht hier
 * nur EINMAL, damit Verdichtung und Berechnung nicht auseinanderlaufen
 * können.
 *
 * Jede geschriebene Zeile trägt ihn mit (`measurement.messwert_tag.zeitzone`).
 * Eine spätere Änderung ist deshalb kein stiller Vorgang: Der Lauf erkennt
 * den Bestand unter der alten Zeitzone und verweigert die Arbeit.
 */
export const VERDICHTUNG_ZEITZONE = 'Europe/Berlin';

export interface VerdichtungsLaufErgebnis {
  readonly modus: 'probelauf' | 'ausfuehrung';
  readonly vonTag: string;
  /** Erster NICHT mehr verdichteter Tag (halboffenes Fenster). */
  readonly bisTag: string;
  readonly zeitzone: string;
  /** Messkanäle, die dieser Durchgang angefasst hat. */
  readonly anzahlKanaele: number;
  /** Tageszeilen, die geschrieben wurden (bzw. entstünden). */
  readonly anzahlTageszeilen: number;
  /** Cursor für den nächsten Durchgang — `0`, wenn nichts mehr aussteht. */
  readonly letzterKanalKey: number;
  /** `true`, solange weitere Durchgänge nötig sind. */
  readonly weitere: boolean;
}

export interface VerdichtungsLaufOptionen {
  /** Erster zu verdichtender lokaler Kalendertag, ISO `YYYY-MM-DD`. */
  readonly vonTag: string;
  /** Erster NICHT mehr zu verdichtender Tag, ISO `YYYY-MM-DD` (halboffen). */
  readonly bisTag: string;
  /** Cursor aus dem vorigen Durchgang; `0` beim ersten. */
  readonly nachKanalKey?: number;
  /** Testbarkeit — bestimmt den heutigen lokalen Tag. */
  readonly jetzt?: Date;
}

/** Der heutige lokale Kalendertag in `zeitzone`, ISO `YYYY-MM-DD`. */
function lokalerTag(zeitpunkt: Date, zeitzone: string): string {
  // `en-CA` liefert ISO-Form (YYYY-MM-DD) — der kürzeste Weg zu einem
  // zonenrichtigen Datum ohne zusätzliche Bibliothek.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zeitzone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(zeitpunkt);
}

const ISO_TAG = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Verdichtung der Rohmesswerte auf Tagesgranularität — der **Stufe-B-Bestand**
 * der Retention-Entscheidung O2 (`compliance/dsgvo/retention-matrix.md`).
 *
 * WARUM DIESER LAUF EXISTIERT
 * ---------------------------
 * O2 teilt die Rohmesswerte in zwei Stufen: Die 15-Minuten-Auflösung (Stufe A)
 * endet Förderjahresende + 24 Monate, danach wird auf Tage verdichtet und
 * `drop_chunks` ausgeführt; die Tagesgranularität (Stufe B) läuft auf F2.
 * Die Begründung ist stark: DE-02/TB-09 verlangen Tage, nicht Viertelstunden —
 * und genau die hohe Auflösung ist das Leitrisiko der DSFA (Risiko 3.1, 5×5).
 *
 * **Nur gab es den Stufe-B-Bestand nicht.** Tageswerte existierten
 * ausschliesslich in `analytics.eingang_messwert_tag`, gebunden an den
 * Snapshot eines Berechnungslaufs. Für einen Messkanal oder Zeitraum, der nie
 * Eingang eines Laufes war, gab es keinen. Ein `drop_chunks` in diesem
 * Zustand hätte genau die Granularität vernichtet, die aufzubewahren ist.
 *
 * Dieser Lauf ist deshalb **keine Löschung, sondern deren Vorbedingung.** Er
 * fällt unter das, was das Votum vom 2026-09-07 ausdrücklich aus der
 * Ausführungssperre gelöst hat: reversibel, datenmengenreduzierend, vernichtet
 * keinen Nachweis. Er darf laufen, bevor der Aktenvermerk AW-15 vorliegt —
 * der Stufe-A-`drop_chunks` darf es nicht.
 *
 * DREI SICHERUNGEN
 * ----------------
 * 1. **Kein unvollständiger Tag.** Verdichtet wird nur bis einschliesslich
 *    gestern (lokal). Ein laufender Tag ergäbe einen Tageswert, der zu klein
 *    ist — und der spätere Korrekturlauf müsste ihn überschreiben, was
 *    Sicherung 3 gerade verhindert.
 * 2. **Keine gemischten Zeitzonen.** Steht im Bestand eine Zeile unter einer
 *    anderen Zeitzone, bricht der Lauf ab. Zwei verschieden geschnittene
 *    Tage in derselben Spalte wären nach dem `drop_chunks` nicht mehr
 *    auseinanderzuhalten.
 * 3. **Kein Überschreiben mit dünnerer Basis.** Eine bestehende Tageszeile
 *    wird nur ersetzt, wenn die neue auf mindestens so vielen Rohwerten
 *    beruht (s. Repository). Sonst ersetzte ein Lauf nach teilweisem
 *    `drop_chunks` gute Werte durch Reste.
 *
 * **Der Aufrufer wiederholt**, solange `weitere` gesetzt ist — wie beim
 * Quarantäne-Lauf. Ein Restbestand ist kein Fehler, sondern der nächste
 * Durchgang; die Batch-Grenze hält die Sperren auf `measurement.messwert`
 * kurz, gegen die gleichzeitig der Ingest schreibt.
 */
@Injectable()
export class MesswertVerdichtungService {
  constructor(private readonly repository: MesswertVerdichtungRepository) {}

  /** Zählt die Tageszeilen, die entstünden — schreibt nichts. */
  @Transactional()
  async probelauf(optionen: VerdichtungsLaufOptionen): Promise<VerdichtungsLaufErgebnis> {
    return this.lauf(optionen, false);
  }

  /**
   * Schreibt die Tageszeilen.
   *
   * Anders als beim Quarantäne-Lauf gibt es hier **kein
   * Bestätigungsargument**: Dieser Lauf löscht nichts. Er leitet ab und
   * schreibt hinzu; im schlimmsten Fall entsteht eine Zeile zu viel, die ein
   * korrigierender Lauf ersetzt. Ein Bestätigungsflag würde eine Gefahr
   * suggerieren, die nicht besteht — und Bestätigungen, die nichts bedeuten,
   * nutzen sich ab.
   */
  @Transactional()
  async fuehreAus(optionen: VerdichtungsLaufOptionen): Promise<VerdichtungsLaufErgebnis> {
    return this.lauf(optionen, true);
  }

  private async lauf(
    optionen: VerdichtungsLaufOptionen,
    schreibend: boolean,
  ): Promise<VerdichtungsLaufErgebnis> {
    const jetzt = optionen.jetzt ?? new Date();
    const zeitzone = VERDICHTUNG_ZEITZONE;

    this.pruefeFenster(optionen, jetzt, zeitzone);

    const abweichend = await this.repository.zaehleAbweichendeZeitzone(zeitzone);
    if (abweichend > 0) {
      throw new Error(
        `Der Tagesbestand enthaelt ${abweichend} Zeile(n) unter einer anderen Zeitzone als ` +
          `"${zeitzone}". Ein Tag, der anders geschnitten wurde, bezeichnet einen anderen ` +
          'Zeitraum — die Zeilen sind bewusst neu zu verdichten, nicht stillschweigend ' +
          'fortzuschreiben.',
      );
    }

    const nachKanalKey = optionen.nachKanalKey ?? 0;
    const messkanalKeys = await this.repository.findKanaeleMitRohwerten({
      vonTag: optionen.vonTag,
      bisTag: optionen.bisTag,
      zeitzone,
      nachKanalKey,
      limit: KANAL_BATCH,
    });

    const fenster = {
      messkanalKeys,
      vonTag: optionen.vonTag,
      bisTag: optionen.bisTag,
      zeitzone,
    };

    const anzahlTageszeilen = schreibend
      ? await this.repository.schreibeTageszeilen(fenster)
      : await this.repository.zaehleTageszeilen(fenster);

    return {
      modus: schreibend ? 'ausfuehrung' : 'probelauf',
      vonTag: optionen.vonTag,
      bisTag: optionen.bisTag,
      zeitzone,
      anzahlKanaele: messkanalKeys.length,
      anzahlTageszeilen,
      letzterKanalKey: messkanalKeys[messkanalKeys.length - 1] ?? nachKanalKey,
      // Ein voller Batch heisst: es koennen weitere folgen. Ein Teilbatch
      // heisst: das war der Rest.
      weitere: messkanalKeys.length === KANAL_BATCH,
    };
  }

  private pruefeFenster(optionen: VerdichtungsLaufOptionen, jetzt: Date, zeitzone: string): void {
    if (!ISO_TAG.test(optionen.vonTag) || !ISO_TAG.test(optionen.bisTag)) {
      throw new Error('vonTag und bisTag muessen die Form YYYY-MM-DD haben.');
    }
    if (optionen.vonTag >= optionen.bisTag) {
      throw new Error(
        `Leeres Fenster: vonTag (${optionen.vonTag}) liegt nicht vor bisTag (${optionen.bisTag}). ` +
          'Das Fenster ist halboffen — bisTag ist der erste NICHT mehr verdichtete Tag.',
      );
    }

    // Sicherung 1: Der laufende Tag ist noch nicht vollstaendig.
    const heute = lokalerTag(jetzt, zeitzone);
    if (optionen.bisTag > heute) {
      throw new Error(
        `bisTag (${optionen.bisTag}) reicht ueber den heutigen Tag (${heute}, ${zeitzone}) hinaus. ` +
          'Ein laufender Tag ergaebe einen zu kleinen Tageswert, und die Sicherung gegen ' +
          'Ueberschreiben mit duennerer Basis verhinderte spaeter seine Korrektur.',
      );
    }
  }
}
