import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindReturningRows, bindRows, mapOneRow, mapManyRows } from '../map-row';
import { decodeCursor } from '../cursor.util';

/**
 * ADR-0008 §20 (D8) — query-basiertes Repository, NUR `energy.*`
 * (Namensraum-Trennung, kein cross-namespace-JOIN zu `identity.*`, Linie 5).
 */
export interface EndkundeRow {
  readonly id: string;
  readonly verarbeitungs_status: string;
  readonly consent_status: string;
  readonly consent_text_version: string | null;
  readonly consent_ref_id: string | null;
  readonly von_wiss_auswertung_ausgenommen: boolean;
  readonly endkundengruppe?: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  // ADR-0007 Teil C, Auflage A11 (V0024-Schema-Delta) — NEU, additiv. Optional
  // (`?:`), damit bestehende Test-Fixtures (10+ *.spec.ts, Literal-Objekte
  // ohne Spread-Basis) NICHT angefasst werden müssen — an der Laufzeit-Zeile
  // liefert `mapRow()` beide Felder IMMER (nie `undefined`, nur ggf. `null`).
  readonly einschraenkung_grund_code?: string | null;
  readonly gesperrt_seit?: string | null;
  readonly neuerhebung_fortsetzen?: boolean | null;
}

export type VerarbeitungsStatus = 'aktiv' | 'gesperrt' | 'geloescht';
export type ConsentStatus = 'aktiv' | 'fehlt' | 'widerrufen';

export interface Endkunde {
  readonly id: string;
  readonly verarbeitungsStatus: VerarbeitungsStatus;
  readonly consentStatus: ConsentStatus;
  readonly consentTextVersion: string | null;
  readonly vonWissAuswertungAusgenommen: boolean;
  /**
   * Endkundengruppe/Branche (V0074) fuer den LK-Nachweis. Freitext —
   * die maßgebliche Werteliste des BAFA-LK-Formulars liegt dem Repo nicht
   * vor (s. Migrations-Kommentar).
   */
  readonly endkundengruppe: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  /**
   * ADR-0007 Teil C, Auflage A11 (V0024) — Art.-18-Einschränkungsgrund
   * (geschlossene Liste `art18_1a_richtigkeit`|`art18_1b_unrechtmaessig`|
   * `art18_1c_rechtsverteidigung_betroffener`|`art18_1d_widerspruch`),
   * ausschließlich bei `verarbeitungsStatus==='gesperrt'` gesetzt (DB-CHECK).
   * Optional (`?:`), s. `EndkundeRow`-Kommentar — an der Laufzeit-Zeile
   * IMMER vorhanden (`string | null`, nie `undefined`).
   */
  readonly einschraenkungGrundCode?: string | null;
  readonly gesperrtSeit?: string | null;
  /**
   * Auflage C-8 (V0087) — bei Sperrgrund lit. b / lit. d die ausdrueckliche
   * Entscheidung, ob WEITER ERHOBEN wird; sonst `null`. Das Ingest-Gate liest
   * genau diese Spalte. Optional wie die beiden Felder darueber, aus
   * demselben Grund (Test-Fixtures ohne Spread-Basis); `mapRow()` liefert sie
   * an der Laufzeit-Zeile immer als `boolean | null`.
   */
  readonly neuerhebungFortsetzen?: boolean | null;
}

/**
 * FAIL-CLOSED (Review-Fund 2026-08-26, V0029 Teil 3): bildete bis dahin JEDEN
 * unbekannten Wert still auf `'aktiv'` ab. Genau diese Spalte traegt die
 * Art.-18-Sperre, und die Pruefung lautet `verarbeitungs_status !== 'aktiv'`
 * (A10 im Service, `trg_berechnungslauf_endkunde_sperre` in V0023) — ein
 * Tippfehler oder Fremdwert haette einen GESPERRTEN Endkunden als AKTIV
 * erscheinen lassen und die Sperre lautlos ausgehebelt. Das ist die falsche
 * Ausfallrichtung fuer eine Betroffenenrechts-Kontrolle.
 *
 * Seit V0029 verhindert `ck_endkunde_verarbeitungs_status` einen solchen Wert
 * bereits in der DB; dieser Wurf ist die zweite, unabhaengige Linie (Muster
 * A6/A19: nie auf EINE Kontrolle verlassen). Wirft er trotzdem, ist die
 * Datenbank in einem Zustand, den das Schema ausschliesst — dann ist ein
 * lauter Fehler richtig und ein stiller `'aktiv'`-Fallback falsch.
 */
function toVerarbeitungsStatus(value: string): VerarbeitungsStatus {
  if (value === 'aktiv' || value === 'gesperrt' || value === 'geloescht') {
    return value;
  }
  throw new Error(
    `energy.endkunde.verarbeitungs_status traegt den unbekannten Wert '${value}' — ` +
      'Schema-Verletzung (ck_endkunde_verarbeitungs_status, V0029). Fail-closed statt stiller ' +
      "Abbildung auf 'aktiv', weil diese Spalte die Art.-18-Sperre traegt.",
  );
}

function toConsentStatus(value: string): ConsentStatus {
  return value === 'aktiv' || value === 'widerrufen' ? value : 'fehlt';
}

function mapRow(row: EndkundeRow): Endkunde {
  return {
    id: row.id,
    verarbeitungsStatus: toVerarbeitungsStatus(row.verarbeitungs_status),
    consentStatus: toConsentStatus(row.consent_status),
    consentTextVersion: row.consent_text_version,
    vonWissAuswertungAusgenommen: row.von_wiss_auswertung_ausgenommen,
    endkundengruppe: row.endkundengruppe ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    einschraenkungGrundCode: row.einschraenkung_grund_code ?? null,
    gesperrtSeit: row.gesperrt_seit ?? null,
    neuerhebungFortsetzen: row.neuerhebung_fortsetzen ?? null,
  };
}

const SELECT_COLUMNS =
  'id, verarbeitungs_status, consent_status, consent_text_version, consent_ref_id, ' +
  'von_wiss_auswertung_ausgenommen, endkundengruppe, created_at, updated_at, einschraenkung_grund_code, gesperrt_seit, neuerhebung_fortsetzen';

export interface ListPageOptions {
  readonly cursor?: string;
  readonly limit: number;
}

@Injectable()
export class EnergyEndkundeRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  async insert(input: {
    readonly id: string;
    readonly vonWissAuswertungAusgenommen: boolean;
    readonly endkundengruppe?: string | null;
  }): Promise<Endkunde> {
    const rawRows: unknown = await this.txHost.tx.query(
      `INSERT INTO energy.endkunde (id, von_wiss_auswertung_ausgenommen, endkundengruppe)
       VALUES ($1, $2, $3)
       RETURNING ${SELECT_COLUMNS}`,
      [input.id, input.vonWissAuswertungAusgenommen, input.endkundengruppe ?? null],
    );

    const result = mapOneRow(bindRows<EndkundeRow>(rawRows), mapRow);
    if (result === undefined) {
      throw new Error('energy.endkunde-INSERT hat keine Zeile zurueckgegeben — unerwarteter DB-Zustand.');
    }

    return result;
  }

  async findById(id: string): Promise<Endkunde | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(`SELECT ${SELECT_COLUMNS} FROM energy.endkunde WHERE id = $1`, [
      id,
    ]);

    return mapOneRow(bindRows<EndkundeRow>(rawRows), mapRow);
  }

  /**
   * Batch-Variante fuer die Label-Aufloesung (ADR-0008 D12, Auflage A4):
   * Liefert die energy-seitigen Saetze zu einer Id-Menge -- PII-frei, aber MIT
   * `verarbeitungsStatus`, denn genau der entscheidet je Datensatz, ob die
   * `PiiProjektionsPolicy` die Entschluesselung ueberhaupt erlaubt.
   *
   * Nicht existierende Ids fallen STILL heraus (keine Fehlermeldung, kein
   * Existenz-Leak) -- dasselbe Muster wie
   * `EnergyStandortRepository.findManyByIdsAndEndkunde`. Eine Mandantengrenze
   * gibt es hier bewusst NICHT: der Endkunde IST der Mandant.
   */
  async findManyByIds(ids: readonly string[]): Promise<Endkunde[]> {
    if (ids.length === 0) {
      return [];
    }

    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SELECT_COLUMNS} FROM energy.endkunde WHERE id = ANY($1::uuid[])`,
      [ids],
    );

    return mapManyRows(bindRows<EndkundeRow>(rawRows), mapRow);
  }

  async listPage(options: ListPageOptions): Promise<Endkunde[]> {
    const params: unknown[] = [];
    let whereClause = '';

    const decoded = options.cursor !== undefined ? decodeCursor(options.cursor) : undefined;
    if (decoded !== undefined) {
      params.push(decoded.createdAt, decoded.id);
      whereClause = 'WHERE (created_at > $1::timestamptz OR (created_at = $1::timestamptz AND id > $2::uuid))';
    }

    params.push(options.limit + 1);
    const limitParamIndex = params.length;

    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SELECT_COLUMNS} FROM energy.endkunde ${whereClause}
        ORDER BY created_at ASC, id ASC
        LIMIT $${String(limitParamIndex)}`,
      params,
    );

    return mapManyRows(bindRows<EndkundeRow>(rawRows), mapRow);
  }

  /**
   * Die Branche setzen oder loeschen (V0074).
   *
   * `null` loescht sie ausdruecklich — anders als bei den PII-Feldern gibt es
   * hier nichts zu maskieren, und eine irrtuemlich gesetzte Branche muss
   * wieder wegkoennen. Der DB-CHECK verhindert den Leerstring, damit nicht
   * zwei Zustaende ("nicht erfasst" und "leer erfasst") nebeneinander stehen.
   */
  async updateEndkundengruppe(id: string, value: string | null): Promise<Endkunde | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `UPDATE energy.endkunde SET endkundengruppe = $2
        WHERE id = $1
        RETURNING ${SELECT_COLUMNS}`,
      [id, value],
    );

    return mapOneRow(bindReturningRows<EndkundeRow>(rawRows), mapRow);
  }

  async updateVonWissAuswertungAusgenommen(id: string, value: boolean): Promise<Endkunde | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `UPDATE energy.endkunde SET von_wiss_auswertung_ausgenommen = $2
        WHERE id = $1
        RETURNING ${SELECT_COLUMNS}`,
      [id, value],
    );

    return mapOneRow(bindReturningRows<EndkundeRow>(rawRows), mapRow);
  }

  /** Art. 18 (Sperre) — IDEMPOTENT. */
  /**
   * Art.-18-Sperre MIT Pflicht-Grund (ADR-0007 A11.1/A11.3, C8-Folgeauftrag).
   *
   * `einschraenkung_grund_code` und `gesperrt_seit` werden gemeinsam in EINEM
   * Statement gesetzt — `ck_endkunde_einschraenkung_kohaerenz` (V0024) laesst
   * beide nur zusammen zu (entweder beide NULL, oder beide gesetzt UND
   * `verarbeitungs_status='gesperrt'`). Der Zeitstempel kommt aus `now()`,
   * NICHT vom Aufrufer (A11.3: kein Rueckdatieren).
   *
   * Der `WHERE ... = 'aktiv'`-Guard bleibt bewusst erhalten: er ist die
   * Garantie, dass ein bereits gesetzter Grund durch diesen Pfad NIEMALS
   * ueberschrieben wird (A11.2). Anders als frueher ist ein Nicht-Treffer hier
   * aber KEIN stiller Idempotenz-Fall mehr — der Aufrufer
   * (`EndkundeService.sperren()`) hat den Vorzustand bereits gelesen und
   * entscheidet ueber 200 (gleicher Grund) bzw. 409 (abweichender Grund,
   * fehlender Grund, Status `geloescht`). `undefined` heisst hier schlicht
   * „nicht (mehr) `aktiv`" und ist dort abschliessend behandelt.
   */
  async markGesperrt(
    id: string,
    grund: string,
    neuerhebungFortsetzen: boolean | null,
  ): Promise<Endkunde | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `UPDATE energy.endkunde
          SET verarbeitungs_status = 'gesperrt',
              einschraenkung_grund_code = $2,
              gesperrt_seit = now(),
              -- Auflage C-8: im SELBEN Statement wie der Grund. Der CHECK
              -- ck_*_neuerhebung_entschieden (V0087) laesst bei lit. b/d
              -- nichts anderes zu -- und genau so soll es sein: Grund und
              -- Erhebungs-Entscheidung sind EIN Vorgang, kein Nachtrag.
              neuerhebung_fortsetzen = $3
        WHERE id = $1 AND verarbeitungs_status = 'aktiv'
        RETURNING ${SELECT_COLUMNS}`,
      [id, grund, neuerhebungFortsetzen],
    );

    return mapOneRow(bindReturningRows<EndkundeRow>(rawRows), mapRow);
  }

  /**
   * Aufhebung der Art.-18-Einschraenkung (ADR-0007 A11.7/A11.10).
   *
   * Status, Grund UND `gesperrt_seit` werden in EINEM Statement
   * zurueckgesetzt — der Kohaerenz-CHECK `ck_endkunde_einschraenkung_kohaerenz` (V0024) laesst nichts anderes
   * zu: Grund gesetzt ERZWINGT `verarbeitungs_status='gesperrt'`. Wer nur den
   * Status aendert, laeuft in einen Constraint-Fehler; wer den CHECK dafuer
   * lockert, hebelt genau die Garantie aus, die den Grund an die
   * Einschraenkung bindet.
   *
   * Der `WHERE ... = 'gesperrt'`-Guard haelt die Richtung fest: NUR
   * `gesperrt -> aktiv`. `undefined` heisst „war nicht (mehr) gesperrt" und
   * wird vom Aufrufer entschieden (`entscheideAufhebung()`), nicht hier still
   * quittiert.
   *
   * FOLGE, die bewusst in Kauf genommen wird: nach diesem UPDATE ist in
   * `energy.endkunde` KEINE Spur des Art.-18-Vorgangs mehr vorhanden. Die
   * Spalte ist fluechtiger Zustand, nicht Historie — deshalb tragen die
   * Audit-Zeile (V0036) und `energy.einschraenkung_unterrichtung` (V0035) den
   * Nachweis.
   */
  async markEntsperrt(id: string): Promise<Endkunde | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `UPDATE energy.endkunde
          SET verarbeitungs_status = 'aktiv',
              einschraenkung_grund_code = NULL,
              gesperrt_seit = NULL,
              -- C-8: mit dem Grund verschwindet die Entscheidung. Sie gehoert
              -- zu GENAU DIESER Einschraenkung; ein stehengebliebenes false
              -- wuerde die naechste Sperre mit einem Wert vorbelegen, den
              -- niemand fuer sie getroffen hat (Lehre aus Regression G-1).
              neuerhebung_fortsetzen = NULL
        WHERE id = $1 AND verarbeitungs_status = 'gesperrt'
        RETURNING ${SELECT_COLUMNS}`,
      [id],
    );

    return mapOneRow(bindReturningRows<EndkundeRow>(rawRows), mapRow);
  }

  /**
   * Art. 17 (Krypto-Shredding) — der finale Fach-Schritt der Löschung.
   * IDEMPOTENT: das WHERE-Guard `verarbeitungs_status <> 'geloescht'`
   * verhindert einen zweiten Durchlauf der begleitenden Identity-Schritte
   * (`EndkundeService.shred()` ruft diese Methode NUR auf, nachdem es den
   * aktuellen Status bereits selbst als "noch nicht geloescht" festgestellt
   * hat — s. dortiger Idempotenz-Kommentar).
   */
  /**
   * Art. 17 (Krypto-Shredding) — der finale Fach-Schritt.
   *
   * REGRESSION G-1 (behoben 2026-08-28): die A11-Spalten `einschraenkung_
   * grund_code`/`gesperrt_seit` MUESSEN hier mitgenullt werden. Der
   * Kohaerenz-CHECK `ck_endkunde_einschraenkung_kohaerenz` (V0024) verlangt,
   * dass ein gesetzter Grund `verarbeitungs_status='gesperrt'` impliziert —
   * ein Statuswechsel nach `geloescht` OHNE Nullen verletzt ihn und endete in
   * einem unbehandelten 500. Der Fall war vor der A11-Umsetzung unerreichbar
   * (die Spalten waren immer NULL) und ist damit eine Regression dieses
   * Auftrags, kein Altbestand.
   *
   * Fachlich ist das Nullen NICHT bloss eine CHECK-Beruhigung: Art. 17
   * ueberholt Art. 18. Nach vollzogener Loeschung gibt es nichts mehr
   * einzuschraenken — eine fortbestehende Einschraenkungsangabe an einem
   * geloeschten Subjekt waere eine Aussage ueber einen Vorgang, den es nicht
   * mehr gibt. Der Nachweis bleibt: der Grund steht in der Audit-Zeile des
   * Sperr-Ereignisses (V0032/V0033), und die Loeschung in ihrer eigenen.
   *
   * Der Weg `gesperrt -> geloescht` ist der praktische Normalfall, nicht der
   * Sonderfall: wer eine Einschraenkung erwirkt hat, verlangt danach oft die
   * Loeschung.
   */
  async markGeloescht(id: string): Promise<Endkunde | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `UPDATE energy.endkunde
          SET verarbeitungs_status = 'geloescht',
              einschraenkung_grund_code = NULL,
              gesperrt_seit = NULL,
              -- C-8: mit dem Grund verschwindet die Entscheidung. Sie gehoert
              -- zu GENAU DIESER Einschraenkung; ein stehengebliebenes false
              -- wuerde die naechste Sperre mit einem Wert vorbelegen, den
              -- niemand fuer sie getroffen hat (Lehre aus Regression G-1).
              neuerhebung_fortsetzen = NULL
        WHERE id = $1 AND verarbeitungs_status <> 'geloescht'
        RETURNING ${SELECT_COLUMNS}`,
      [id],
    );

    const updated = mapOneRow(bindReturningRows<EndkundeRow>(rawRows), mapRow);
    if (updated !== undefined) {
      return updated;
    }

    return this.findById(id);
  }
}
