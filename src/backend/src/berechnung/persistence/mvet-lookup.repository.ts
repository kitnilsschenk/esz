import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindRows, mapManyRows, mapOneRow } from '../../stammdaten/persistence/map-row';
import type { Energietraeger } from '../../stammdaten/persistence/energy/energy-zaehler.repository';

/**
 * ADR-0006 B1 — löst `energy.messkonzept_version_energietraeger` (mvet) ZU
 * `endkundeId`/`energietraeger` auf (JOIN-Kette `mvet -> messkonzept_version
 * -> messkonzept -> endkunde_id`, exakt der in
 * `migrations/V0019__analytics_berechnungslauf_schema.sql` dokumentierte
 * "App-Invariante": "endkunde_id/energietraeger sind aus mvet_id herleitbar
 * ... die Redundanz ist gewollt (B1), ihre Konsistenz zu mvet_id
 * sicherzustellen ist App-Schreibpfad-Scope"). EIGENES, schlankes
 * Repository statt Erweiterung von `EnergyMesskonzeptRepository` (dessen
 * bestehende `MesskonzeptVersionEnergietraeger`-Projektion trägt bewusst
 * KEIN `id`/`messkonzeptVersionId` — eine Erweiterung hätte den
 * Stammdaten-Vertrag angefasst, den dieses Paket laut Arbeitsauftrag NICHT
 * ändern soll).
 *
 * Bewusst KEIN cross-namespace-JOIN nach `identity` (Linie 2/D8) — alle drei
 * beteiligten Tabellen liegen in `energy`.
 */
export interface MvetInfo {
  readonly id: string;
  readonly endkundeId: string;
  readonly energietraeger: Energietraeger;
  readonly baselineWertKwh: number | null;
  readonly baselineEinheit: string | null;
  /**
   * Messkonzept-Typ der zugehörigen Version (V0002, Merkblatt Technik Kap. 2).
   * Bis V0076 wurde er NIE gelesen — jeder Lauf rechnete das vereinfachte
   * Verfahren, gleich was hier stand. Seit V0076 entscheidet er, ob die
   * Baseline-Koeffizienten gesetzt oder an die Vermessung angepasst werden.
   */
  readonly messkonzeptTyp: MesskonzeptTyp;
}

/** Merkblatt Technik v2.2 Kap. 2 — die drei zulässigen Messkonzepte. */
export type MesskonzeptTyp = 'vereinfacht' | 'standard' | 'alternativ';

const MESSKONZEPT_TYP_WERTE: readonly MesskonzeptTyp[] = ['vereinfacht', 'standard', 'alternativ'];

/**
 * Unbekannte Werte fallen auf `vereinfacht` zurück, nicht auf `standard`: Der
 * vereinfachte Pfad braucht keine Vermessung und keine Anpassung — er ist der
 * Weg, der mit den wenigsten Annahmen auskommt. Ein unlesbares Etikett darf
 * nicht dazu führen, dass eine Anpassung gerechnet und als belegt ausgewiesen
 * wird. Die DB-Seite ist ohnehin durch einen CHECK gedeckt.
 */
export function toMesskonzeptTyp(value: string): MesskonzeptTyp {
  return MESSKONZEPT_TYP_WERTE.find((kandidat) => kandidat === value) ?? 'vereinfacht';
}

interface MvetInfoRow {
  readonly id: string;
  readonly endkunde_id: string;
  readonly energietraeger: string;
  readonly baseline_wert: string | null;
  readonly baseline_einheit: string | null;
  readonly typ: string;
}

const ENERGIETRAEGER_WERTE: readonly Energietraeger[] = ['strom', 'waerme', 'kaelte', 'gas', 'oel', 'biomasse'];

function toEnergietraeger(value: string): Energietraeger {
  return ENERGIETRAEGER_WERTE.find((kandidat) => kandidat === value) ?? 'strom';
}

function mapRow(row: MvetInfoRow): MvetInfo {
  return {
    id: row.id,
    endkundeId: row.endkunde_id,
    energietraeger: toEnergietraeger(row.energietraeger),
    baselineWertKwh: row.baseline_wert === null ? null : Number.parseFloat(row.baseline_wert),
    baselineEinheit: row.baseline_einheit,
    messkonzeptTyp: toMesskonzeptTyp(row.typ),
  };
}

@Injectable()
export class MvetLookupRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  async findById(mvetId: string): Promise<MvetInfo | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT mvet.id, mk.endkunde_id, mvet.energietraeger, mvet.baseline_wert, mvet.baseline_einheit, mv.typ
         FROM energy.messkonzept_version_energietraeger mvet
         JOIN energy.messkonzept_version mv ON mv.id = mvet.messkonzept_version_id
         JOIN energy.messkonzept mk ON mk.id = mv.messkonzept_id
        WHERE mvet.id = $1`,
      [mvetId],
    );

    return mapOneRow(bindRows<MvetInfoRow>(rawRows), mapRow);
  }

  /**
   * V0028 — n:m-Zuordnung `energy.messkonzept_version_energietraeger_system`
   * (Leserichtung 1, "alle Systeme einer mvet", bedient über das führende
   * PK-Präfix `mvet_id`, kein Zusatzindex nötig). Startet für JEDES
   * Bestands-`mvet` LEER (V0028 "Übergangszustand") — der Aufrufer
   * (`BerechnungslaufService`) behandelt ein leeres Ergebnis als "kein
   * Einflussgrößen-Snapshot für diesen Lauf" (D7/A5, Regelfall in v1, s.
   * dortiger Kommentar), NICHT als Fehler. `edms_app` hat `SELECT` auf diese
   * Tabelle bereits seit V0028 (kein neuer Grant nötig).
   */
  async listSystemIdsByMvetId(mvetId: string): Promise<string[]> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT system_id FROM energy.messkonzept_version_energietraeger_system WHERE mvet_id = $1`,
      [mvetId],
    );
    return mapManyRows(bindRows<{ readonly system_id: string }>(rawRows), (row) => row.system_id);
  }

  /**
   * Klimastationen der Standorte, an denen die Systeme dieser mvet hängen
   * (ADR-0010 `energy.standort.klimareferenz`, V0074 `system.standort_id`).
   *
   * Das ist der Ort, an dem die Station FACHLICH hingehört: Sie gehört zum
   * Objekt, nicht zum einzelnen Rechenlauf. Bis 2026-09-16 gab es diesen Weg
   * nicht — die Station kam allein aus dem Lauf-Parameter, und ADR-0006 C10.1
   * zeigt, was das kostet (eine Station 220 km neben dem Objekt, jahrelang
   * unbemerkt, weil es keinen Ort gab, an dem die richtige hätte stehen
   * können).
   *
   * Der Lauf löst die Station weiterhin NICHT zur Laufzeit auf (D4
   * „fail-closed-Regel": eingefrorene `stationRef` je Lauf). Diese Abfrage
   * bedient ausschliesslich den VORSCHLAG — der Bediener sieht, was zum
   * Standort hinterlegt ist, und übernimmt es bewusst.
   *
   * Bleibt im Namensraum `energy` (D8).
   */
  async listeKlimareferenzenFuerMvet(mvetId: string): Promise<string[]> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT DISTINCT st.klimareferenz
         FROM energy.messkonzept_version_energietraeger_system mvs
         JOIN energy.system sy ON sy.id = mvs.system_id
         JOIN energy.standort st ON st.id = sy.standort_id
        WHERE mvs.mvet_id = $1
          AND st.klimareferenz IS NOT NULL
          AND st.status = 'aktiv'
        ORDER BY st.klimareferenz`,
      [mvetId],
    );
    return mapManyRows(bindRows<{ readonly klimareferenz: string }>(rawRows), (row) => row.klimareferenz);
  }
}
