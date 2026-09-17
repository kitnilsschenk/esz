import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindRows, mapManyRows, mapOneRow } from '../map-row';
import { toIsoDateString } from '../pg-date.util';

/** Eine Baseline-Periode, wie sie aus der Tabelle kommt. */
export interface BaselinePeriodeZeile {
  readonly id: string;
  /** ISO `YYYY-MM-DD`, EINSCHLIESSLICH. */
  readonly von: string;
  /** ISO `YYYY-MM-DD`, AUSSCHLIESSLICH (DB-CHECK `bis > von`; der Lauf filtert `tag < bis`). */
  readonly bis: string;
  readonly menge: number | null;
  readonly einheit: string | null;
}

/** Was der Erfasser je Periode angibt. */
export interface BaselinePeriodeEingabe {
  readonly von: string;
  readonly bis: string;
  readonly menge: number | null;
  readonly einheit: string | null;
}

/** Der fachliche Rahmen der mvet — für Prüfung, Anzeige und Audit-Kontext. */
export interface MvetBaselineKopf {
  readonly energietraeger: string;
  readonly baselineWert: number | null;
  readonly baselineEinheit: string | null;
  /** TB-02 (V0065): die DEKLARIERTE Zahl der Jahresabrechnungen. */
  readonly abrechnungenAnzahl: number | null;
}

interface BaselinePeriodeRow {
  readonly id: string;
  // `date`-Spalten — pg liefert hier ein `Date`-Objekt (lokale Mitternacht),
  // s. Kopf von `pg-date.util.ts`.
  readonly von: unknown;
  readonly bis: unknown;
  readonly menge: string | null;
  readonly einheit: string | null;
}

function mapRow(row: BaselinePeriodeRow): BaselinePeriodeZeile {
  return {
    id: row.id,
    von: toIsoDateString(row.von),
    bis: toIsoDateString(row.bis),
    menge: row.menge === null ? null : Number.parseFloat(row.menge),
    einheit: row.einheit,
  };
}

interface MvetKopfRow {
  readonly energietraeger: string;
  readonly baseline_wert: string | null;
  readonly baseline_einheit: string | null;
  readonly baseline_abrechnungen_anzahl: number | null;
}

function mapKopfRow(row: MvetKopfRow): MvetBaselineKopf {
  return {
    energietraeger: row.energietraeger,
    baselineWert: row.baseline_wert === null ? null : Number.parseFloat(row.baseline_wert),
    baselineEinheit: row.baseline_einheit,
    abrechnungenAnzahl: row.baseline_abrechnungen_anzahl,
  };
}

/**
 * `energy.baseline_periode` (V0019) — die SCHREIBSEITE der
 * Baseline-Bezugszeiträume.
 *
 * **Warum es sie neben `AnalyticsBaselinePeriodeRepository` gibt.** Jenes
 * Repository gehört dem Rechenweg und kann ausschließlich lesen; die Tabelle
 * war deshalb bis hierher nur per SQL zu füllen. Das ist keine Kleinigkeit:
 * Aus diesen Zeiträumen bildet `BerechnungslaufService` GTZ_base als
 * **Mittelwert der Gradtagzahl-Summen je Periode** — den Nenner der
 * Witterungsbereinigung. Wer keine Periode erfassen konnte, hatte für GTZ_base
 * nur den `gtzBaseOverride`, also eine von Hand gesetzte Gradtagzahl. Genau
 * dieser Weg hat in diesem Projekt schon einmal einen falsch parametrierten
 * Bestand erzeugt.
 *
 * Die Trennung Lesen/Schreiben folgt der Modulgrenze: Der Rechenweg liest,
 * die Stammdatenpflege schreibt. Beide sehen dieselbe Tabelle, aber keiner
 * greift in das Modul des anderen.
 */
@Injectable()
export class EnergyBaselinePeriodeRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  /** Die erfassten Perioden, aufsteigend — dieselbe Reihenfolge, in der der Lauf sie liest. */
  async listeFuerMvet(mvetId: string): Promise<BaselinePeriodeZeile[]> {
    const rows: unknown = await this.txHost.tx.query(
      `SELECT id, von, bis, menge, einheit
         FROM energy.baseline_periode
        WHERE mvet_id = $1
        ORDER BY von ASC`,
      [mvetId],
    );
    return mapManyRows(bindRows<BaselinePeriodeRow>(rows), mapRow);
  }

  /** Energieträger und Baseline-Kopfdaten der mvet; `undefined`, wenn es sie nicht gibt. */
  async findeKopf(mvetId: string): Promise<MvetBaselineKopf | undefined> {
    const rows: unknown = await this.txHost.tx.query(
      `SELECT energietraeger, baseline_wert, baseline_einheit, baseline_abrechnungen_anzahl
         FROM energy.messkonzept_version_energietraeger
        WHERE id = $1`,
      [mvetId],
    );
    return mapOneRow(bindRows<MvetKopfRow>(rows), mapKopfRow);
  }

  /**
   * Setzt die Perioden auf GENAU diese Menge und gibt die Anzahl VORHER zurück.
   *
   * **Ersetzen statt einzeln pflegen.** Die Perioden wirken nur gemeinsam: Der
   * Lauf mittelt über alle. Eine einzelne Periode zu ändern hieße, den Nenner
   * zu verschieben, ohne die anderen zu sehen. Ein PUT auf die ganze Menge
   * zeigt beim Bearbeiten immer den vollständigen Satz — und ist idempotent.
   *
   * Löschen und Neuanlegen in EINER Transaktion (der Aufrufer hält sie): Ein
   * Zwischenzustand ohne Perioden würde einen gleichzeitig startenden
   * Berechnungslauf mit `GTZ_BASE_NICHT_ERMITTELBAR` abweisen.
   *
   * Die IDs werden dabei neu vergeben. Das ist unschädlich — auf eine
   * `baseline_periode.id` verweist nichts (kein FK zeigt auf diese Tabelle);
   * der Lauf liest sie über `mvet_id`.
   */
  async setze(mvetId: string, perioden: readonly BaselinePeriodeEingabe[]): Promise<number> {
    const vorher: unknown = await this.txHost.tx.query(
      'SELECT count(*)::int AS anzahl FROM energy.baseline_periode WHERE mvet_id = $1',
      [mvetId],
    );
    const anzahlVorher = (vorher as { anzahl: number }[])[0]?.anzahl ?? 0;

    await this.txHost.tx.query('DELETE FROM energy.baseline_periode WHERE mvet_id = $1', [mvetId]);

    if (perioden.length > 0) {
      // `unnest` mit gleich langen Arrays statt N Einzel-INSERTs — ein
      // Roundtrip, und die Reihenfolge der Arrays haelt die Zeilen zusammen.
      await this.txHost.tx.query(
        `INSERT INTO energy.baseline_periode (id, mvet_id, von, bis, menge, einheit)
         SELECT gen_random_uuid(), $1, v, b, m, e
           FROM unnest($2::date[], $3::date[], $4::numeric[], $5::text[]) AS t(v, b, m, e)`,
        [
          mvetId,
          perioden.map((p) => p.von),
          perioden.map((p) => p.bis),
          perioden.map((p) => p.menge),
          perioden.map((p) => p.einheit),
        ],
      );
    }

    return anzahlVorher;
  }
}
