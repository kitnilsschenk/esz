import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { GERAET_REVERSE_FENSTER_STUNDEN } from '../../../auth/policy/geraet-reverse.constants';

const REVERSE_AUFGELOEST_EVENT_TYP = 'geraet_zuordnung.stammdaten.reverse_aufgeloest';

/**
 * SA-1-Fix (Security-Review Phase 5, TOCTOU-Race in der SEC-5-Velocity/
 * Quota-Kontrolle) — fester, projektweit eindeutiger Namensraum (erstes
 * Schlüssel-Argument von `pg_advisory_xact_lock(key1 int, key2 int)`) für
 * die Quota-Serialisierung je `actor_sub`, s. Klassen-Dok. Wert ist die
 * ASCII-Kodierung von "GRVQ" (Geraet-Reverse-Quota) als int4 — rein
 * mnemonisch, KEINE fachliche Bedeutung, dient nur der Kollisionsvermeidung
 * gegenüber künftigen, ANDEREN Advisory-Lock-Verwendungen im Code (aktuell
 * die einzige im Repository).
 */
const GERAET_REVERSE_QUOTA_LOCK_NAMESPACE = 0x47525651; // 'GRVQ', int4-sicher (1_196_578_385 < 2^31-1)

interface AnzahlRow {
  readonly anzahl: number;
}

/**
 * ADR-0005 §26.4 SEC-5 (d) — Velocity/Quota je Subjekt, OHNE neuen State/
 * neue Tabelle: der Audit-Trail (`audit.event`) ist die Quelle der Wahrheit.
 * Zählt die ERFOLGREICHEN (`ergebnis='ok'`) `geraet_zuordnung.stammdaten.
 * reverse_aufgeloest`-Ereignisse des anfragenden `actor_sub` im gleitenden
 * `GERAET_REVERSE_FENSTER_STUNDEN`-Fenster — bewusst NUR `ok` (nicht auch
 * `denied`/`error`): ein abgelehnter Versuch (falsches Ticket-Format,
 * fehlender Zweck, ...) soll die Quota nicht zusätzlich strafen; "höchstens
 * N AUFLÖSUNGEN" meint tatsächlich erfolgreich durchgeführte Reverse-
 * Auflösungen (ADR-0005 §26.4 SEC-5 Punkt 4 — Velocity/Quota).
 *
 * SA-1-FIX (Security-Review Phase 5, TOCTOU-Race, vom User zur sofortigen
 * Behebung freigegeben): die reine `SELECT count(*) ... ergebnis='ok' ...`-
 * Zählung ALLEIN ist KEIN Schutz gegen Parallelität — sie liest
 * ausschließlich bereits COMMITTETE Audit-Zeilen; der eigene Audit-Eintrag
 * der laufenden Anfrage wird aber erst NACH `next.handle()` durch den
 * `AuditActionInterceptor` geschrieben — innerhalb DERSELBEN ambienten
 * Transaktion, die `TransactionInterceptor` für die GESAMTE Request-
 * Pipeline öffnet (Guard → `TransactionInterceptor` [BEGIN] →
 * `AuditActionInterceptor` → `PolicyInterceptor` [ruft diesen Provider/
 * dieses Repository auf] → Controller → Service → zurück durch
 * `AuditActionInterceptor.emit()` [Audit-INSERT] → `TransactionInterceptor`
 * [COMMIT]). Feuert derselbe `actor_sub` N Anfragen PARALLEL (je eigene
 * ambiente Transaktion), sehen ALLE denselben alten, noch nicht durch
 * Konkurrenz-Commits erhöhten Zählerstand — die Quota war durch
 * Parallelität umgehbar (kompromittiertes/böswilliges `geraete-support`-
 * Konto hätte beliebig viele DevEUIs auf einmal reverse-auflösen können).
 *
 * Fix: `pg_advisory_xact_lock(namespace, hashtext(actor_sub))` VOR der
 * Zählung, auf DERSELBEN Verbindung/Transaktion (`txHost.tx`), die auch
 * Decrypt (Service) UND Audit-Append (`AuditActionInterceptor`, NACH
 * `next.handle()`) trägt. Ein transaktionsgebundener Advisory-Lock wird
 * automatisch bei COMMIT ODER ROLLBACK der ambienten Transaktion
 * freigegeben — KEIN explizites Unlock nötig, KEIN Leck bei Exceptions.
 * Das serialisiert GENAU den vom Auditor verlangten Kontrollfluss "Check +
 * Decrypt + Audit-Append" je `actor_sub`: eine zweite, parallele Anfrage
 * DESSELBEN Subjekts blockiert an `pg_advisory_xact_lock`, bis die
 * ambiente Transaktion der ersten Anfrage committet (und damit deren
 * Audit-Zeile für die nächste Zählung sichtbar ist) — kein Doppel-Zählen
 * desselben Standes mehr möglich. Verschiedene `actor_sub` blockieren sich
 * NICHT gegenseitig (unterschiedliche Lock-Keys, zweites Argument).
 *
 * Bewusst KEINE neue Migration/kein dediziertes Zähler-Register (Alternative
 * (b) aus dem Audit, verworfen): das wäre eine zusätzliche, `SELECT ... FOR
 * UPDATE`-geschützte Tabelle mit eigenem Schema, eigener Retention-/PII-
 * Betrachtung und eigenem Migrations-/Compliance-Review (`database-lead`/
 * `compliance-director`) für einen Fix, den ein bereits vorhandenes,
 * migrationsfreies Postgres-Primitive (Advisory-Lock — kein TSL-Feature,
 * s. `.claude/rules/dependencies.md`) ebenso wasserdicht schließt UND bei
 * dem der Audit-Trail alleinige Quelle der Wahrheit bleibt (kein zweiter,
 * potenziell divergierender Zähler-State).
 *
 * `edms_app` hat bereits `GRANT SELECT ON audit.event` (V0003) — KEINE neue
 * Migration/kein neues Grant nötig für dieses Query. `pg_advisory_xact_lock`
 * ist eine eingebaute Systemfunktion (kein Objekt-Grant erforderlich).
 *
 * Performance-Hinweis (dokumentiert, kein v1-Blocker, UNVERÄNDERT durch
 * diesen Fix, separat zu behebende Migration — NICHT Teil dieses Fixes):
 * `audit.event` trägt aktuell KEINEN Index auf `(event_typ, actor_sub, ts)`
 * — bei einem synthetic-only/niedrigfrequenten Reverse-Auflösungs-Volumen
 * (seltener Support-/Diagnosefall, ADR-0005 §26.4) unkritisch; ein
 * künftiger `/add-migration`-Auftrag könnte einen solchen Index ergänzen,
 * falls das Volumen real steigt.
 */
@Injectable()
export class GeraetReverseQuotaRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  /**
   * SA-1-Fix: sperrt je `actor_sub` (transaktionsgebunden, s. Klassen-Dok)
   * VOR der Zählung. Aufrufreihenfolge bewusst (1) sperren, DANN (2)
   * zählen — ein Aufrufer, der die Sperre erhält, sieht dadurch immer den
   * zum Sperrzeitpunkt aktuellsten, konsistenten Zählerstand aller bereits
   * committeten Konkurrenzanfragen desselben Subjekts.
   */
  async sperreUndZaehleErfolgreicheAufloesungenImFenster(actorSub: string): Promise<number> {
    await this.txHost.tx.query(`SELECT pg_advisory_xact_lock($1, hashtext($2))`, [
      GERAET_REVERSE_QUOTA_LOCK_NAMESPACE,
      actorSub,
    ]);

    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT count(*)::int AS anzahl
         FROM audit.event
        WHERE event_typ = $1
          AND actor_sub = $2
          AND ergebnis = 'ok'
          AND ts >= now() - make_interval(hours => $3::int)`,
      [REVERSE_AUFGELOEST_EVENT_TYP, actorSub, GERAET_REVERSE_FENSTER_STUNDEN],
    );

    const rows = rawRows as AnzahlRow[];
    return rows[0]?.anzahl ?? 0;
  }
}
