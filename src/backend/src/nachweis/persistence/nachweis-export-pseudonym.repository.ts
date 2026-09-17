import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindRows, mapOneRow } from '../../stammdaten/persistence/map-row';

/** Deckungsgleich mit `ck_export_pseudonym_entitaet_typ` (V0025, erweitert um `geraetegruppe` in V0064). */
export type ExportPseudonymEntitaetTyp = 'endkunde' | 'system' | 'messkanal' | 'station' | 'geraetegruppe';

const PRAEFIX: Record<ExportPseudonymEntitaetTyp, string> = {
  endkunde: 'EK',
  system: 'SY',
  messkanal: 'MK',
  station: 'ST',
  // V0064 (TB-05): `energy.geraetegruppe.bezeichnung` ist Freitext und wird
  // wie die Station behandelt (A13) — Klarname nur bei aktenkundiger Anfrage.
  geraetegruppe: 'GG',
};

const LFD_STELLEN = 4;

interface PseudonymRow {
  readonly pseudonym: string;
}
interface EntitaetRefPseudonymRow {
  readonly entitaet_ref: string;
  readonly pseudonym: string;
}

/**
 * ADR-0007 D6/B6, Teil C Auflage A19 — `nachweis.export_pseudonym` ist die
 * EINZIGE Re-Identifikationsbrücke im Exportpfad (Tabellen-Konstruktion
 * statt HMAC-Ableitung, bestätigt O-B13). Diese Klasse ist der EINZIGE Ort
 * im Code, der diese Tabelle berührt — jeder andere Zugriff auf
 * `nachweis.export_pseudonym` wäre ein Regressionsbefund (s.
 * `nachweis-export-pseudonym.repository.spec.ts`, Grep-Test gegen den Rest
 * von `src/backend/src/nachweis/**`).
 *
 * **Laufzeit-Hinweis (bewusst offen benannt, KEINE stillschweigende
 * Annahme):** die dokumentierte Zielrolle ist `edms_nachweis_renderer`
 * (V0025-GRANTs: „einzige Rolle mit SELECT/INSERT auf `export_pseudonym`").
 * Die App verbindet HEUTE (Dev-Stack, `.env` `DATABASE_URL`) als `edms`
 * (Owner-artige Rolle, `Superuser` im Dev-Cluster) über EINE einzige,
 * globale `DataSource` (`common/persistence/database.module.ts`) — es gibt
 * (noch) keine zweite, rollenspezifische Connection-Pool-Verdrahtung.
 * Genau WEIL der gesamte Zugriff auf diese Tabelle in DIESER EINEN Klasse
 * gekapselt ist, ist die künftige Rollen-Verdrahtung (separater
 * `TransactionHost`/`DataSource`-Provider für `edms_nachweis_renderer`,
 * DevOps-Vorhaben außerhalb dieses Pakets) ein EIN-ZEILEN-Wechsel: NUR der
 * hier injizierte `txHost` müsste auf den zweiten Pool zeigen — keine
 * andere Datei im `nachweis`-Modul greift je auf `export_pseudonym` zu.
 *
 * **Race-Sicherheit der `lfd`-Vergabe:** `nachweis.export_pseudonym` ist
 * append-only (REVOKE UPDATE/DELETE, V0025) — die laufende Nummer wird
 * daher über `COUNT(*)` je `entitaet_typ` ermittelt, NICHT über eine
 * Sequenz (die Vergabe ist so selten — ein bis wenige Exporte je
 * Förderjahr, B5 — dass eine Sequenz-Infrastruktur unverhältnismäßig wäre).
 *
 * Gegen zwei GLEICHZEITIGE Erstexporte serialisiert ein
 * `pg_advisory_xact_lock` je `entitaet_typ` (Lock wird am Transaktionsende
 * automatisch freigegeben, kein expliziter Unlock nötig).
 *
 * **Er reicht allein aber NICHT**, und das war ein echter Fehler: Der
 * Aufrufer löst die Entitäten eines Exports mit `Promise.all` auf, also
 * mehrere Aufrufe INNERHALB DERSELBEN Transaktion. Ein Advisory-Lock ist
 * re-entrant — dieselbe Sitzung bekommt ihn beliebig oft sofort — und die
 * Anweisungen der parallelen Aufrufe verschränken sich auf der Verbindung:
 * Erst zählten alle, dann fügten alle ein, alle mit derselben `lfd`. Bei
 * EINEM Messkanal je Typ fiel das nie auf; bei dreien schlägt der Export mit
 * `duplicate key ... export_pseudonym_entitaet_typ_pseudonym_key` fehl.
 *
 * Die Vergabe geschieht deshalb in EINER Anweisung: Zählen und Einfügen
 * lassen sich dann nicht mehr verschränken, weil Anweisungen auf einer
 * Verbindung streng nacheinander laufen.
 */
@Injectable()
export class NachweisExportPseudonymRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  /**
   * Vergabe EINMALIG bei Erstexport, danach unveränderlich (D6). Schreibpfad
   * — NUR bei der Export-ERZEUGUNG verwenden, NIE bei der
   * Download-Verifikation (s. `findeBestehende()`).
   */
  async findeOderErstelle(entitaetTyp: ExportPseudonymEntitaetTyp, entitaetRef: string): Promise<string> {
    await this.txHost.tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [entitaetTyp]);

    const bestehendeRows: unknown = await this.txHost.tx.query(
      'SELECT pseudonym FROM nachweis.export_pseudonym WHERE entitaet_typ = $1 AND entitaet_ref = $2',
      [entitaetTyp, entitaetRef],
    );
    const bestehend = mapOneRow(bindRows<PseudonymRow>(bestehendeRows), (r) => r.pseudonym);
    if (bestehend !== undefined) {
      return bestehend;
    }

    // Zaehlen UND Einfuegen in EINER Anweisung — s. Klassenkopf. Zwei
    // getrennte Anweisungen liessen sich zwischen parallelen Aufrufen
    // derselben Transaktion verschraenken, und alle bekaemen dieselbe `lfd`.
    const insertRows: unknown = await this.txHost.tx.query(
      `INSERT INTO nachweis.export_pseudonym (entitaet_typ, entitaet_ref, pseudonym)
       SELECT $1, $2,
              $3 || '-' || lpad(
                ((SELECT count(*) FROM nachweis.export_pseudonym WHERE entitaet_typ = $1) + 1)::text,
                $4::int, '0')
       ON CONFLICT (entitaet_typ, entitaet_ref) DO NOTHING
       RETURNING pseudonym`,
      [entitaetTyp, entitaetRef, PRAEFIX[entitaetTyp], LFD_STELLEN],
    );
    const result = mapOneRow(bindRows<PseudonymRow>(insertRows), (r) => r.pseudonym);
    if (result !== undefined) {
      return result;
    }

    // `DO NOTHING` liefert keine Zeile, wenn die Entitaet zwischen der Lese-
    // und der Schreibanweisung bereits ein Pseudonym bekommen hat. Dann gibt
    // es eines — nur eben nicht von diesem Aufruf.
    const nachtraeglichRows: unknown = await this.txHost.tx.query(
      'SELECT pseudonym FROM nachweis.export_pseudonym WHERE entitaet_typ = $1 AND entitaet_ref = $2',
      [entitaetTyp, entitaetRef],
    );
    const nachtraeglich = mapOneRow(bindRows<PseudonymRow>(nachtraeglichRows), (r) => r.pseudonym);
    if (nachtraeglich === undefined) {
      throw new Error('nachweis.export_pseudonym-INSERT hat keine Zeile zurueckgegeben — unerwarteter DB-Zustand.');
    }
    return nachtraeglich;
  }

  /**
   * Reiner LESE-Pfad (Batch) — für die Download-Verifikation (`GET .../dateien/{dateiname}`):
   * zu diesem Zeitpunkt MÜSSEN alle Entitäten bereits ein Pseudonym besitzen
   * (bei der Erzeugung vergeben) — ein fehlender Eintrag ist ein struktureller
   * Fehler, kein GET darf NEUE Pseudonyme allozieren (Lese-Routen mutieren nicht).
   */
  async findeBestehende(entitaetTyp: ExportPseudonymEntitaetTyp, entitaetRefs: readonly string[]): Promise<Map<string, string>> {
    if (entitaetRefs.length === 0) {
      return new Map();
    }
    const rows: unknown = await this.txHost.tx.query(
      'SELECT entitaet_ref, pseudonym FROM nachweis.export_pseudonym WHERE entitaet_typ = $1 AND entitaet_ref = ANY($2)',
      [entitaetTyp, [...entitaetRefs]],
    );
    const alle = bindRows<EntitaetRefPseudonymRow>(rows);
    return new Map(alle.map((r) => [r.entitaet_ref, r.pseudonym]));
  }
}
