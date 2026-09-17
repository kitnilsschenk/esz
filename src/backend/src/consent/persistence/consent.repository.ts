import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindReturningRows, bindRows, mapManyRows, mapOneRow } from '../../stammdaten/persistence/map-row';
import type {
  BelegArt,
  EinwilligungItem,
  Erfassungsweg,
  Erlaubnismodus,
  Rechtsgrundlage,
  SubjektTyp,
  TextVersionItem,
  ZweckItem,
  ZweckSubjektRegel,
} from '../consent.types';

interface ZweckRow {
  readonly code: string;
  readonly bezeichnung: string;
  readonly beschreibung: string;
}

interface ZweckSubjektRow {
  readonly zweck_code: string;
  readonly subjekt_typ: string;
  readonly rechtsgrundlage: string;
  readonly erlaubnismodus: string;
  readonly verweigerbar: boolean;
  readonly begruendung: string;
}

interface TextVersionRow {
  readonly id: string;
  readonly zweck_code: string;
  readonly fassung: string;
  readonly wortlaut: string;
  readonly wortlaut_sha256: Buffer;
  readonly gueltig_ab: Date | string;
  readonly gueltig_bis: Date | string | null;
}

interface EinwilligungRow {
  readonly id: string;
  readonly subjekt_typ: string;
  readonly subjekt_id: string;
  readonly zweck_code: string;
  readonly text_version_id: string;
  readonly fassung: string;
  readonly rechtsgrundlage: string;
  readonly erfassungsweg: string;
  readonly quelle_ref: string | null;
  readonly widerruf_erfassungsweg: string | null;
  readonly widerruf_quelle_ref: string | null;
  readonly erteilt_at: Date | string;
  readonly widerrufen_at: Date | string | null;
}

export interface TextVersionAnlegenInput {
  readonly id: string;
  readonly zweckCode: string;
  readonly fassung: string;
  readonly wortlaut: string;
  readonly wortlautSha256: Buffer;
  readonly gueltigAb: Date;
}

export interface EinwilligungAnlegenInput {
  readonly id: string;
  readonly subjektTyp: SubjektTyp;
  readonly subjektId: string;
  readonly zweckCode: string;
  readonly textVersionId: string;
  readonly rechtsgrundlage: Rechtsgrundlage;
  /** Zeitpunkt der ERKLAERUNG (A12-27), nicht der Erfassung. */
  readonly erteiltAt: Date;
}

export interface BelegAnlegenInput {
  readonly id: string;
  readonly einwilligungId: string;
  readonly cryptoKeyId: string;
  /** `erteilung` oder `widerruf` — beides ist belegpflichtig (A12-29). */
  readonly art: BelegArt;
  readonly erfassungsweg: Erfassungsweg;
  readonly erfasstAt: Date;
  /** Fundstelle des Dokuments; Pflicht auf allen nicht-digitalen Wegen (A12-28). */
  readonly quelleRef: string | undefined;
  readonly ipEnc: Buffer | undefined;
  readonly userAgentEnc: Buffer | undefined;
}

function alsIso(wert: Date | string): string {
  return wert instanceof Date ? wert.toISOString() : new Date(wert).toISOString();
}

function alsIsoOderNull(wert: Date | string | null): string | null {
  return wert === null ? null : alsIso(wert);
}

function mapEinwilligung(row: EinwilligungRow): EinwilligungItem {
  const widerrufenAt = alsIsoOderNull(row.widerrufen_at);
  return {
    id: row.id,
    subjektTyp: row.subjekt_typ as SubjektTyp,
    subjektId: row.subjekt_id,
    zweckCode: row.zweck_code,
    textVersionId: row.text_version_id,
    fassung: row.fassung,
    rechtsgrundlage: row.rechtsgrundlage as Rechtsgrundlage,
    erfassungsweg: row.erfassungsweg as Erfassungsweg,
    quelleRef: row.quelle_ref,
    widerrufErfassungsweg: row.widerruf_erfassungsweg as Erfassungsweg | null,
    widerrufQuelleRef: row.widerruf_quelle_ref,
    erteiltAt: alsIso(row.erteilt_at),
    widerrufenAt,
    // Der Zustand ist die ABLEITUNG aus dem Ereignis (ADR-0012 §2), nicht
    // eine zweite, getrennt gepflegte Wahrheit.
    wirksam: widerrufenAt === null,
  };
}

/**
 * `COALESCE` statt zweier Abfragen: `consent.einwilligung` trägt zwei
 * nullbare Subjekt-Spalten mit einem CHECK auf genau eine (V0044) — nach
 * außen ist das EIN Subjekt, und die Projektion führt es auch als eines.
 */
const EINWILLIGUNG_SPALTEN = `e.id,
       e.subjekt_typ,
       COALESCE(e.endkunde_id, e.anschlussnutzer_id) AS subjekt_id,
       e.zweck_code,
       e.text_version_id,
       tv.fassung,
       e.rechtsgrundlage,
       b.erfassungsweg,
       b.quelle_ref,
       bw.erfassungsweg AS widerruf_erfassungsweg,
       bw.quelle_ref    AS widerruf_quelle_ref,
       e.erteilt_at,
       e.widerrufen_at`;

/**
 * Der Erfassungsweg steht im BELEG (`identity.einwilligung_beleg`), nicht an
 * der Fachzeile — er ist die einzige Angabe von dort, die auch ohne
 * Entschlüsselung auskommt und für die Betriebssicht gebraucht wird
 * („digital oder auf Papier?"). Ein `INNER JOIN`: Jede Einwilligung MUSS
 * einen Beleg haben; eine ohne wäre nach Art. 7 Abs. 1 DSGVO wertlos, und
 * ein `LEFT JOIN` würde diesen Fehler still zu einem `null` verharmlosen
 * statt ihn sichtbar zu machen.
 */
const EINWILLIGUNG_FROM = `FROM consent.einwilligung e
         JOIN consent.text_version tv ON tv.id = e.text_version_id
         JOIN identity.einwilligung_beleg b
           ON b.einwilligung_id = e.id AND b.art = 'erteilung'
         LEFT JOIN identity.einwilligung_beleg bw
           ON bw.einwilligung_id = e.id AND bw.art = 'widerruf'`;

/**
 * Lese- und Schreibzugriffe der Einwilligungsverwaltung (ADR-0012 B1).
 *
 * Fasst `consent.*` und `identity.einwilligung_beleg` zusammen, weil beide
 * Seiten in DERSELBEN Transaktion entstehen müssen: Eine Fachzeile ohne
 * Beleg wäre eine Einwilligung ohne Nachweis, ein Beleg ohne Fachzeile ein
 * Nachweis für nichts.
 */
@Injectable()
export class ConsentRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  async findZwecke(): Promise<ZweckItem[]> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT code, bezeichnung, beschreibung FROM consent.zweck ORDER BY code ASC`,
    );

    return mapManyRows(bindRows<ZweckRow>(rawRows), (row) => ({
      code: row.code,
      bezeichnung: row.bezeichnung,
      beschreibung: row.beschreibung,
    }));
  }

  /**
   * Die Rechtsgrundlagen-Matrix fuer EINE Subjektart (V0047, A12-1).
   *
   * Aus ihr bestimmt der Service die Rechtsgrundlage — der Aufrufer waehlt
   * sie nicht mehr. Dieselbe Tabelle ist zugleich das Ziel des
   * zusammengesetzten Fremdschluessels an `consent.einwilligung`: Anwendung
   * und Datenbank lesen damit aus derselben Zeile, und ein Auseinanderlaufen
   * ist strukturell ausgeschlossen.
   */
  async findMatrixFuerSubjektTyp(subjektTyp: SubjektTyp): Promise<ZweckSubjektRegel[]> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT zweck_code, subjekt_typ, rechtsgrundlage, erlaubnismodus, verweigerbar, begruendung
         FROM consent.zweck_subjekt
        WHERE subjekt_typ = $1
        ORDER BY zweck_code ASC`,
      [subjektTyp],
    );

    return mapManyRows(bindRows<ZweckSubjektRow>(rawRows), (row) => ({
      zweckCode: row.zweck_code,
      subjektTyp: row.subjekt_typ as SubjektTyp,
      rechtsgrundlage: row.rechtsgrundlage as Rechtsgrundlage,
      erlaubnismodus: row.erlaubnismodus as Erlaubnismodus,
      verweigerbar: row.verweigerbar,
      begruendung: row.begruendung,
    }));
  }

  async findTextVersionen(zweckCode?: string): Promise<TextVersionItem[]> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT id, zweck_code, fassung, wortlaut, wortlaut_sha256, gueltig_ab, gueltig_bis
         FROM consent.text_version
        WHERE ($1::text IS NULL OR zweck_code = $1)
        ORDER BY zweck_code ASC, gueltig_ab DESC`,
      [zweckCode ?? null],
    );

    return mapManyRows(bindRows<TextVersionRow>(rawRows), (row) => ({
      id: row.id,
      zweckCode: row.zweck_code,
      fassung: row.fassung,
      wortlaut: row.wortlaut,
      wortlautSha256: row.wortlaut_sha256.toString('hex'),
      gueltigAb: alsIso(row.gueltig_ab),
      gueltigBis: alsIsoOderNull(row.gueltig_bis),
    }));
  }

  /**
   * Die zum Zeitpunkt `stichtag` gültige Fassung eines Zwecks. Ohne sie kann
   * nicht eingewilligt werden — man kann nicht einer Erklärung zustimmen,
   * die es nicht gibt.
   */
  async findGueltigeTextVersion(zweckCode: string, stichtag: Date): Promise<TextVersionItem | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT id, zweck_code, fassung, wortlaut, wortlaut_sha256, gueltig_ab, gueltig_bis
         FROM consent.text_version
        WHERE zweck_code = $1
          AND gueltig_ab <= $2
          AND (gueltig_bis IS NULL OR gueltig_bis > $2)`,
      [zweckCode, stichtag],
    );

    return mapOneRow(bindRows<TextVersionRow>(rawRows), (row) => ({
      id: row.id,
      zweckCode: row.zweck_code,
      fassung: row.fassung,
      wortlaut: row.wortlaut,
      wortlautSha256: row.wortlaut_sha256.toString('hex'),
      gueltigAb: alsIso(row.gueltig_ab),
      gueltigBis: alsIsoOderNull(row.gueltig_bis),
    }));
  }

  async insertTextVersion(input: TextVersionAnlegenInput): Promise<TextVersionItem> {
    const rawRows: unknown = await this.txHost.tx.query(
      `INSERT INTO consent.text_version (id, zweck_code, fassung, wortlaut, wortlaut_sha256, gueltig_ab)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, zweck_code, fassung, wortlaut, wortlaut_sha256, gueltig_ab, gueltig_bis`,
      [input.id, input.zweckCode, input.fassung, input.wortlaut, input.wortlautSha256, input.gueltigAb],
    );

    const ergebnis = mapOneRow(bindRows<TextVersionRow>(rawRows), (row) => ({
      id: row.id,
      zweckCode: row.zweck_code,
      fassung: row.fassung,
      wortlaut: row.wortlaut,
      wortlautSha256: row.wortlaut_sha256.toString('hex'),
      gueltigAb: alsIso(row.gueltig_ab),
      gueltigBis: alsIsoOderNull(row.gueltig_bis),
    }));

    if (ergebnis === undefined) {
      throw new Error('consent.text_version-INSERT hat keine Zeile zurueckgegeben — unerwarteter DB-Zustand.');
    }
    return ergebnis;
  }

  /**
   * Schliesst die bisher offene Fassung desselben Zwecks GENAU an
   * `gueltigAb` — sonst schlüge die EXCLUDE-Constraint zu (überlappende
   * Gültigkeit). Zwei Zeitscheiben ohne Lücke, ohne Overlap; dasselbe
   * Muster wie die temporale Verortung in ADR-0010 D3.
   */
  async schliesseOffeneTextVersion(zweckCode: string, gueltigBis: Date): Promise<void> {
    await this.txHost.tx.query(
      `UPDATE consent.text_version
          SET gueltig_bis = $2
        WHERE zweck_code = $1
          AND gueltig_bis IS NULL`,
      [zweckCode, gueltigBis],
    );
  }

  async findEinwilligungenFuerSubjekt(subjektTyp: SubjektTyp, subjektId: string): Promise<EinwilligungItem[]> {
    const spalte = subjektTyp === 'endkunde' ? 'e.endkunde_id' : 'e.anschlussnutzer_id';
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${EINWILLIGUNG_SPALTEN}
         ${EINWILLIGUNG_FROM}
        WHERE ${spalte} = $1
        ORDER BY e.erteilt_at DESC, e.id DESC`,
      [subjektId],
    );

    return mapManyRows(bindRows<EinwilligungRow>(rawRows), mapEinwilligung);
  }

  async findEinwilligungById(id: string): Promise<EinwilligungItem | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${EINWILLIGUNG_SPALTEN} ${EINWILLIGUNG_FROM} WHERE e.id = $1`,
      [id],
    );

    return mapOneRow(bindRows<EinwilligungRow>(rawRows), mapEinwilligung);
  }

  /**
   * Schreibt NUR die Fachzeile. Der Beleg folgt in `insertBeleg()` — beide
   * Aufrufe gehören in dieselbe Transaktion (der Service hält sie zusammen).
   */
  async insertEinwilligung(input: EinwilligungAnlegenInput): Promise<string> {
    const endkundeId = input.subjektTyp === 'endkunde' ? input.subjektId : null;
    const anschlussnutzerId = input.subjektTyp === 'anschlussnutzer' ? input.subjektId : null;

    await this.txHost.tx.query(
      `INSERT INTO consent.einwilligung
         (id, subjekt_typ, endkunde_id, anschlussnutzer_id, zweck_code, text_version_id, rechtsgrundlage, erteilt_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.id,
        input.subjektTyp,
        endkundeId,
        anschlussnutzerId,
        input.zweckCode,
        input.textVersionId,
        input.rechtsgrundlage,
        input.erteiltAt,
      ],
    );

    return input.id;
  }

  async insertBeleg(input: BelegAnlegenInput): Promise<void> {
    await this.txHost.tx.query(
      `INSERT INTO identity.einwilligung_beleg
         (id, einwilligung_id, crypto_key_id, art, erfassungsweg, erfasst_at, quelle_ref, ip_enc, user_agent_enc)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        input.id,
        input.einwilligungId,
        input.cryptoKeyId,
        input.art,
        input.erfassungsweg,
        input.erfasstAt,
        input.quelleRef ?? null,
        input.ipEnc ?? null,
        input.userAgentEnc ?? null,
      ],
    );
  }

  /**
   * Auflage C-10 — zaehlt die Zaehler DIESES Subjekts, fuer die aktuell KEINE
   * Rechtsgrundlage besteht.
   *
   * EIN Funktionsaufruf, EINE Zahl. Die Enumeration der Zaehler steckt seit
   * V0090 in `consent.zaehle_zaehler_ohne_rechtsgrundlage()` — und das ist
   * kein Geschmacksurteil, sondern die Korrektur eines Befunds aus dem
   * `database-lead`-Review (2026-09-17): Vorher stand sie hier als SQL und
   * las `energy.zaehler`, `energy.system` und `energy.nutzungsverhaeltnis`
   * direkt. Auf keine dieser Tabellen hat die Anwendungsrolle `edms_app`
   * irgendein Recht — verifiziert:
   *
   *     SET ROLE edms_app; SELECT ... FROM energy.zaehler ...
   *     ERROR:  permission denied for table zaehler
   *
   * Dass es trotzdem lief, lag allein daran, dass Entwicklung und Test als
   * `edms` verbinden, und `edms` ist Superuser. Die Auflage waere am Tag der
   * Umstellung auf das eigene Rollenmodell ausgefallen.
   *
   * Die Funktion fragt intern dieselbe Gate-Funktion, die auch der
   * Ingest-Worker fragt. Die Versuchung waere, die Bedingung hier noch einmal
   * als SQL zu formulieren — sie ist ja bekannt. Dann gaebe es zwei
   * Formulierungen derselben Regel, und die Zahl im Audit-Log belegte im
   * Zweifel die Wirkung, die der Widerruf NICHT hatte.
   *
   * Ueber die Rollengrenze geht damit die ANTWORT, nicht die Datenbasis —
   * dasselbe Prinzip, aus dem das Gate ueberhaupt existiert. Und eine Zahl
   * statt einer Zaehlerliste ist zugleich das, was A12-13 verlangt: Das
   * Audit-Log soll die Wirkung belegen, nicht ein zweites
   * Bestandsverzeichnis werden.
   */
  async zaehleZaehlerOhneRechtsgrundlage(subjektTyp: SubjektTyp, subjektId: string): Promise<number> {
    const rawRows: unknown = await this.txHost.tx.query(
      'SELECT consent.zaehle_zaehler_ohne_rechtsgrundlage($1, $2) AS anzahl',
      [subjektTyp, subjektId],
    );

    const zeilen = bindRows<{ readonly anzahl: number }>(rawRows);
    return zeilen[0]?.anzahl ?? 0;
  }

  /**
   * Setzt `widerrufen_at` — und NUR, solange es noch NULL ist.
   *
   * Das `AND widerrufen_at IS NULL` ist kein Detail: Ohne es würde ein
   * zweiter Widerruf den Zeitpunkt des ersten überschreiben und damit die
   * Aussage verfälschen, ab wann die Verarbeitung unrechtmäßig wurde. Der
   * Rückgabewert sagt, ob tatsächlich etwas widerrufen wurde.
   */
  async widerrufeEinwilligung(id: string, widerrufenAt: Date): Promise<boolean> {
    const rawRows: unknown = await this.txHost.tx.query(
      `UPDATE consent.einwilligung
          SET widerrufen_at = $2
        WHERE id = $1
          AND widerrufen_at IS NULL
       RETURNING id`,
      [id, widerrufenAt],
    );

    // `bindReturningRows`, NICHT `bindRows`: TypeORM liefert fuer UPDATE ein
    // Tupel [rows, rowCount] (s. `map-row.ts`). Mit `bindRows` war `rows[0]`
    // das ZEILEN-ARRAY, `row.id` folglich `undefined` — dieser Rueckgabewert
    // war IMMER `false`, und der Widerruf einer Einwilligung schlug fehl.
    // Art. 7 Abs. 3 DSGVO verlangt, dass der Widerruf so einfach ist wie die
    // Erteilung; er war ueberhaupt nicht moeglich.
    return mapOneRow(bindReturningRows<{ readonly id: string }>(rawRows), (row) => row.id) !== undefined;
  }
}
