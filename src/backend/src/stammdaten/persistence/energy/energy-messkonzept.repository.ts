import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindRows, mapManyRows, mapOneRow } from '../map-row';
import type { Energietraeger } from './energy-zaehler.repository';

/**
 * ADR-0008 §20 (D8) — query-basiertes Repository, NUR `energy.*`. Messkonzept
 * ist versioniert/append-only (Linie 3, ADR-0004 §13.2 Abweichung (e), KEIN
 * `updated_at`): "Editieren" bedeutet ausschließlich eine NEUE Version
 * anzulegen; bestehende Versionen werden NIE verändert.
 */
export interface MesskonzeptHeaderRow {
  readonly id: string;
  readonly endkunde_id: string;
  readonly created_at: string;
}

export interface MesskonzeptHeader {
  readonly id: string;
  readonly endkundeId: string;
  readonly createdAt: string;
}

function mapHeaderRow(row: MesskonzeptHeaderRow): MesskonzeptHeader {
  return { id: row.id, endkundeId: row.endkunde_id, createdAt: row.created_at };
}

const HEADER_COLUMNS = 'id, endkunde_id, created_at';

export interface MesskonzeptVersionRow {
  readonly id: string;
  readonly messkonzept_id: string;
  readonly version_nr: number;
  readonly typ: string;
  readonly systemgrenze: string;
  readonly systembeschreibung: string;
  readonly bereinigungsverfahren: string;
  readonly messgeraete_wahl: string;
  readonly geraeteerkennungs_verfahren: string;
  readonly aenderungsgrund: string | null;
  readonly anzeige_status: string | null;
  readonly gueltig_von: string;
  readonly gueltig_bis: string | null;
  readonly created_at: string;
}

export type MesskonzeptTyp = 'vereinfacht' | 'standard' | 'alternativ';

export interface MesskonzeptVersion {
  readonly id: string;
  readonly messkonzeptId: string;
  readonly versionNr: number;
  readonly typ: MesskonzeptTyp;
  readonly systemgrenze: string;
  readonly systembeschreibung: string;
  readonly bereinigungsverfahren: string;
  readonly messgeraeteWahl: string;
  readonly geraeteerkennungsVerfahren: string;
  readonly aenderungsgrund: string | null;
  readonly gueltigVon: string;
  readonly gueltigBis: string | null;
  readonly createdAt: string;
}

function toMesskonzeptTyp(value: string): MesskonzeptTyp {
  return value === 'standard' || value === 'alternativ' ? value : 'vereinfacht';
}

function mapVersionRow(row: MesskonzeptVersionRow): MesskonzeptVersion {
  return {
    id: row.id,
    messkonzeptId: row.messkonzept_id,
    versionNr: row.version_nr,
    typ: toMesskonzeptTyp(row.typ),
    systemgrenze: row.systemgrenze,
    systembeschreibung: row.systembeschreibung,
    bereinigungsverfahren: row.bereinigungsverfahren,
    messgeraeteWahl: row.messgeraete_wahl,
    geraeteerkennungsVerfahren: row.geraeteerkennungs_verfahren,
    aenderungsgrund: row.aenderungsgrund,
    gueltigVon: row.gueltig_von,
    gueltigBis: row.gueltig_bis,
    createdAt: row.created_at,
  };
}

const VERSION_COLUMNS =
  'id, messkonzept_id, version_nr, typ, systemgrenze, systembeschreibung, bereinigungsverfahren, ' +
  'messgeraete_wahl, geraeteerkennungs_verfahren, aenderungsgrund, anzeige_status, gueltig_von, gueltig_bis, created_at';

export interface MesskonzeptVersionEnergietraegerRow {
  readonly id: string;
  readonly messkonzept_version_id: string;
  readonly energietraeger: string;
  readonly baseline_wert: string | null;
  readonly baseline_einheit: string | null;
  readonly baseline_methode: string | null;
  readonly baseline_begruendung: string | null;
  readonly baseline_beleg_ref: string | null;
  /** V0065 (TB-02) — optional (`?:`) aus demselben Grund wie `energietraeger_substitution` unten. */
  readonly baseline_abrechnungen_anzahl?: number | null;
  readonly baseline_beleg_aktenzeichen?: string | null;
  readonly baseline_beleg_ablageort?: string | null;
  readonly created_at: string;
  /**
   * ADR-0007 B13.4/B14/O-B3b (V0029) — optional (`?:`), damit bestehende
   * Test-Fixtures (Literal-Objekte ohne Spread-Basis) NICHT angefasst werden
   * müssen — an der Laufzeit-Zeile liefert `mapEnergietraegerRow()` das Feld
   * IMMER (nie `undefined`, DB-seitig `NOT NULL DEFAULT false`).
   */
  readonly energietraeger_substitution?: boolean;
}

export interface MesskonzeptVersionEnergietraeger {
  /** `energy.messkonzept_version_energietraeger.id` — Schluessel fuer Berechnungslauf und Systemgrenze. */
  readonly id: string;
  readonly energietraeger: Energietraeger;
  readonly baselineWert: number | null;
  readonly baselineEinheit: string | null;
  readonly baselineMethode: string | null;
  readonly baselineBegruendung: string | null;
  readonly baselineBelegRef: string | null;
  /**
   * TB-02 ([Q3] Kap. 2.1.2, V0065) — der EXTERNE Belegverweis: Zahl der
   * zugrunde liegenden Jahresabrechnungen samt Aktenzeichen und Ablageort.
   * Die Abrechnungen selbst bleiben ausserhalb des Systems (ADR-0006 O4);
   * ein DB-CHECK erzwingt die Begruendung bei weniger als drei.
   */
  readonly baselineAbrechnungenAnzahl: number | null;
  readonly baselineBelegAktenzeichen: string | null;
  readonly baselineBelegAblageort: string | null;
  /**
   * ADR-0007 B13.4/B14/O-B3b (V0029, `energy.messkonzept_version_
   * energietraeger.energietraeger_substitution`) — explizites, vom
   * Betriebs-Team gesetztes Kennzeichen: `true` = für dieses (Endkunde,
   * Energieträger)-Paar liegt ein Energieträger-Wechsel (Substitution) vor.
   * Verdrahtet gegen `nachweis/substitution-erkennung.ts`
   * (`SubstitutionErkennungService`) — s. dortiger Kommentar.
   */
  readonly energietraegerSubstitution: boolean;
}

const ENERGIETRAEGER_WERTE: readonly Energietraeger[] = ['strom', 'waerme', 'kaelte', 'gas', 'oel', 'biomasse'];

function toEnergietraeger(value: string): Energietraeger {
  return ENERGIETRAEGER_WERTE.find((kandidat) => kandidat === value) ?? 'strom';
}

function mapEnergietraegerRow(row: MesskonzeptVersionEnergietraegerRow): MesskonzeptVersionEnergietraeger {
  return {
    id: row.id,
    energietraeger: toEnergietraeger(row.energietraeger),
    baselineWert: row.baseline_wert === null ? null : Number.parseFloat(row.baseline_wert),
    baselineEinheit: row.baseline_einheit,
    baselineMethode: row.baseline_methode,
    baselineBegruendung: row.baseline_begruendung,
    baselineBelegRef: row.baseline_beleg_ref,
    baselineAbrechnungenAnzahl: row.baseline_abrechnungen_anzahl ?? null,
    baselineBelegAktenzeichen: row.baseline_beleg_aktenzeichen ?? null,
    baselineBelegAblageort: row.baseline_beleg_ablageort ?? null,
    energietraegerSubstitution: row.energietraeger_substitution ?? false,
  };
}

const ENERGIETRAEGER_COLUMNS =
  'id, messkonzept_version_id, energietraeger, baseline_wert, baseline_einheit, baseline_methode, ' +
  'baseline_begruendung, baseline_beleg_ref, baseline_abrechnungen_anzahl, baseline_beleg_aktenzeichen, ' +
  'baseline_beleg_ablageort, energietraeger_substitution, created_at';

export interface InsertVersionInput {
  readonly id: string;
  readonly messkonzeptId: string;
  readonly versionNr: number;
  readonly typ: MesskonzeptTyp;
  readonly systemgrenze: string;
  readonly systembeschreibung: string;
  readonly bereinigungsverfahren: string;
  readonly messgeraeteWahl: string;
  readonly geraeteerkennungsVerfahren: string;
  readonly aenderungsgrund: string | null;
  readonly gueltigVon: string;
}

export interface InsertEnergietraegerInput {
  readonly id: string;
  readonly messkonzeptVersionId: string;
  readonly energietraeger: Energietraeger;
  readonly baselineWert: number | null;
  readonly baselineEinheit: string | null;
  readonly baselineMethode: string | null;
  readonly baselineBegruendung: string | null;
  readonly baselineBelegRef: string | null;
  /** TB-02 (V0065) — externer Belegverweis, s. `MesskonzeptVersionEnergietraeger`. */
  readonly baselineAbrechnungenAnzahl: number | null;
  readonly baselineBelegAktenzeichen: string | null;
  readonly baselineBelegAblageort: string | null;
  /** ADR-0007 B13.4/B14/O-B3b (V0029) — Default `false` liegt beim AUFRUFER (Service), nicht hier (Persistenz-Layer bleibt explizit, keine versteckten Defaults). */
  readonly energietraegerSubstitution: boolean;
}

@Injectable()
export class EnergyMesskonzeptRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  async findHeaderByEndkundeId(endkundeId: string): Promise<MesskonzeptHeader | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${HEADER_COLUMNS} FROM energy.messkonzept WHERE endkunde_id = $1 ORDER BY created_at ASC LIMIT 1`,
      [endkundeId],
    );

    return mapOneRow(bindRows<MesskonzeptHeaderRow>(rawRows), mapHeaderRow);
  }

  async insertHeader(input: { readonly id: string; readonly endkundeId: string }): Promise<MesskonzeptHeader> {
    const rawRows: unknown = await this.txHost.tx.query(
      `INSERT INTO energy.messkonzept (id, endkunde_id) VALUES ($1, $2) RETURNING ${HEADER_COLUMNS}`,
      [input.id, input.endkundeId],
    );

    const result = mapOneRow(bindRows<MesskonzeptHeaderRow>(rawRows), mapHeaderRow);
    if (result === undefined) {
      throw new Error('energy.messkonzept-INSERT hat keine Zeile zurueckgegeben — unerwarteter DB-Zustand.');
    }

    return result;
  }

  async findMaxVersionNr(messkonzeptId: string): Promise<number> {
    const rawRows: unknown = await this.txHost.tx.query(
      'SELECT max(version_nr) AS max_version_nr FROM energy.messkonzept_version WHERE messkonzept_id = $1',
      [messkonzeptId],
    );
    const rows = bindRows<{ readonly max_version_nr: number | string | null }>(rawRows);
    const raw = rows[0]?.max_version_nr ?? null;
    if (raw === null) {
      return 0;
    }
    return typeof raw === 'number' ? raw : Number.parseInt(raw, 10);
  }

  /** Schließt die aktuell gültige Version (`gueltig_bis IS NULL`) — append-only, KEIN Editieren (Linie 3). */
  async closeCurrentVersion(messkonzeptId: string, gueltigBis: string): Promise<void> {
    await this.txHost.tx.query(
      `UPDATE energy.messkonzept_version SET gueltig_bis = $2
        WHERE messkonzept_id = $1 AND gueltig_bis IS NULL`,
      [messkonzeptId, gueltigBis],
    );
  }

  async insertVersion(input: InsertVersionInput): Promise<MesskonzeptVersion> {
    const rawRows: unknown = await this.txHost.tx.query(
      `INSERT INTO energy.messkonzept_version
         (id, messkonzept_id, version_nr, typ, systemgrenze, systembeschreibung, bereinigungsverfahren,
          messgeraete_wahl, geraeteerkennungs_verfahren, aenderungsgrund, gueltig_von)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING ${VERSION_COLUMNS}`,
      [
        input.id,
        input.messkonzeptId,
        input.versionNr,
        input.typ,
        input.systemgrenze,
        input.systembeschreibung,
        input.bereinigungsverfahren,
        input.messgeraeteWahl,
        input.geraeteerkennungsVerfahren,
        input.aenderungsgrund,
        input.gueltigVon,
      ],
    );

    const result = mapOneRow(bindRows<MesskonzeptVersionRow>(rawRows), mapVersionRow);
    if (result === undefined) {
      throw new Error('energy.messkonzept_version-INSERT hat keine Zeile zurueckgegeben — unerwarteter DB-Zustand.');
    }

    return result;
  }

  async insertEnergietraeger(input: InsertEnergietraegerInput): Promise<MesskonzeptVersionEnergietraeger> {
    const rawRows: unknown = await this.txHost.tx.query(
      // V0028 (ADR-0007 A12/O-B3b, Mandantentreue): `endkunde_id` ist seit
      // V0028 NOT NULL und Ziel eines zusammengesetzten FK
      // `(id, endkunde_id)`, damit die n:m-Zuordnung mvet x System die
      // Mandantentreue DEKLARATIV erzwingen kann (Muster ADR-0010/V0017).
      //
      // Der Wert wird BEWUSST in SQL aus derselben Kette abgeleitet, die der
      // FK prueft (messkonzept_version -> messkonzept -> endkunde), statt ihn
      // als Parameter entgegenzunehmen: ein Aufrufer koennte einen falschen
      // Endkunden uebergeben, und der Fehler faele erst spaeter an der
      // Zuordnungstabelle auf. So ist die Redundanz per Konstruktion
      // konsistent. `INSERT ... SELECT` liefert KEINE Zeile, wenn die
      // `messkonzept_version_id` nicht existiert — der bestehende
      // `result === undefined`-Pfad unten faengt das fail-closed ab (vorher
      // haette der FK auf `messkonzept_version_id` geworfen; beides ist ein
      // Fehler, nur die Fehlerform aendert sich).
      `INSERT INTO energy.messkonzept_version_energietraeger
         (id, messkonzept_version_id, energietraeger, baseline_wert, baseline_einheit, baseline_methode,
          baseline_begruendung, baseline_beleg_ref, baseline_abrechnungen_anzahl,
          baseline_beleg_aktenzeichen, baseline_beleg_ablageort, energietraeger_substitution, endkunde_id)
       SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, mk.endkunde_id
         FROM energy.messkonzept_version mv
         JOIN energy.messkonzept mk ON mk.id = mv.messkonzept_id
        WHERE mv.id = $2
       RETURNING ${ENERGIETRAEGER_COLUMNS}`,
      [
        input.id,
        input.messkonzeptVersionId,
        input.energietraeger,
        input.baselineWert,
        input.baselineEinheit,
        input.baselineMethode,
        input.baselineBegruendung,
        input.baselineBelegRef,
        input.baselineAbrechnungenAnzahl,
        input.baselineBelegAktenzeichen,
        input.baselineBelegAblageort,
        input.energietraegerSubstitution,
      ],
    );

    const result = mapOneRow(bindRows<MesskonzeptVersionEnergietraegerRow>(rawRows), mapEnergietraegerRow);
    if (result === undefined) {
      throw new Error(
        'energy.messkonzept_version_energietraeger-INSERT hat keine Zeile zurueckgegeben — unerwarteter DB-Zustand.',
      );
    }

    return result;
  }

  async listEnergietraeger(messkonzeptVersionId: string): Promise<MesskonzeptVersionEnergietraeger[]> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${ENERGIETRAEGER_COLUMNS} FROM energy.messkonzept_version_energietraeger
        WHERE messkonzept_version_id = $1 ORDER BY created_at ASC`,
      [messkonzeptVersionId],
    );

    return mapManyRows(bindRows<MesskonzeptVersionEnergietraegerRow>(rawRows), mapEnergietraegerRow);
  }

  async findVersionByNr(messkonzeptId: string, versionNr: number): Promise<MesskonzeptVersion | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${VERSION_COLUMNS} FROM energy.messkonzept_version WHERE messkonzept_id = $1 AND version_nr = $2`,
      [messkonzeptId, versionNr],
    );

    return mapOneRow(bindRows<MesskonzeptVersionRow>(rawRows), mapVersionRow);
  }

  /** Liste, NEUESTE ZUERST (Contract-Vorgabe) — Cursor = letzte gesehene `version_nr`. */
  async listVersions(
    messkonzeptId: string,
    options: { readonly cursorVersionNr?: number; readonly limit: number },
  ): Promise<MesskonzeptVersion[]> {
    const conditions = ['messkonzept_id = $1'];
    const params: unknown[] = [messkonzeptId];

    if (options.cursorVersionNr !== undefined) {
      params.push(options.cursorVersionNr);
      conditions.push(`version_nr < $${String(params.length)}`);
    }

    params.push(options.limit + 1);

    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${VERSION_COLUMNS} FROM energy.messkonzept_version
        WHERE ${conditions.join(' AND ')}
        ORDER BY version_nr DESC
        LIMIT $${String(params.length)}`,
      params,
    );

    return mapManyRows(bindRows<MesskonzeptVersionRow>(rawRows), mapVersionRow);
  }

  /**
   * ADR-0007 B13.4/B14/O-B3b — Substitutions-Erkennung (FJ-06), reale
   * Prüfung anstelle des vormaligen `istSubstitutionsfall()`-Stubs
   * (`nachweis/substitution-erkennung.ts`). Liest das Kennzeichen der
   * AKTUELLEN Messkonzept-Version (`gueltig_bis IS NULL`) für den
   * angefragten Energieträger — B14/D-EBENE (V0029-Migrationskopf):
   * Substitution wirkt PAARWEISE je (Endkunde, Energieträger), und `mvet`
   * IST exakt diese Paar-Entität (1 Zeile je Energieträger einer
   * Messkonzept-Version). Liefert `false`, wenn KEINE aktuelle mvet-Zeile für
   * diesen Energieträger existiert (kein Merkmal bekannt ⇒ kein
   * Substitutionsfall bekannt — identische Fallback-Semantik wie der
   * vormalige Stub, NICHT „unbekannt = Substitution").
   *
   * `energietraeger: string` (NICHT das engere `Energietraeger`-Literal-Union)
   * — dieselbe bewusste Entscheidung wie beim vormaligen Stub
   * (`istSubstitutionsfall(_endkundeId: string, _energietraeger: string)`):
   * die Aufrufer (`PreflightService`/`EinsparlaufService`) erhalten
   * `paar.energietraeger` bereits als ungeprüften `text`-Spaltenwert
   * (`analytics.berechnungslauf.energietraeger`, `ScopePaar.energietraeger:
   * string`) — eine Engführung hier würde nur eine Coercion an DIESER Stelle
   * erzwingen, ohne zusätzliche Typsicherheit zu gewinnen.
   */
  async findAktuelleSubstitution(endkundeId: string, energietraeger: string): Promise<boolean> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT mvet.energietraeger_substitution
         FROM energy.messkonzept_version_energietraeger mvet
         JOIN energy.messkonzept_version mv ON mv.id = mvet.messkonzept_version_id
         JOIN energy.messkonzept mk ON mk.id = mv.messkonzept_id
        WHERE mk.endkunde_id = $1
          AND mv.gueltig_bis IS NULL
          AND mvet.energietraeger = $2`,
      [endkundeId, energietraeger],
    );
    return mapOneRow(bindRows<{ readonly energietraeger_substitution: boolean }>(rawRows), (row) => row.energietraeger_substitution) ?? false;
  }
}
