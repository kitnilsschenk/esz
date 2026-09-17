import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { validateAuditEnvelope, AuditEnvelopeValidationError } from './audit-envelope.validator';
import type { AppendAuditEventInput } from './audit-envelope.validator';
import type { AuditErgebnis } from '../common/security/audit-ergebnis';

// Re-Export fuer Bestandsimporte (`import { AppendAuditEventInput,
// AuditEnvelopeValidationError } from './audit.service'`) — die eigentliche
// Definition liegt seit V0082 in `audit-envelope.validator.ts` (dort auch von
// `Tb03BefundRepository` verwendet, `einfluss/persistence/`).
export { AuditEnvelopeValidationError };
export type { AppendAuditEventInput };

export interface AppendedAuditEvent {
  readonly eventId: string;
  readonly lane: number;
  readonly tagUtc: string;
  /** `bigint` kommt über `pg` als String zurück — bewusst nicht in `number` gewandelt. */
  readonly seq: string;
  readonly ts: string;
  readonly eventTyp: string;
  readonly ergebnis: AuditErgebnis;
}

interface AuditEventRow {
  readonly event_id: string;
  readonly lane: number;
  readonly tag_utc: string;
  readonly seq: string;
  readonly ts: string;
  readonly event_typ: string;
  readonly ergebnis: string;
}

/**
 * Einziger App-Schreibpfad auf `audit.event` (ADR-0003 §17.1, ADR-0002 §15).
 * Führt GENAU EINEN Aufruf `SELECT * FROM audit.append_event(...)` aus —
 * über den AMBIENTEN, von `TransactionInterceptor`/`nestjs-cls` geöffneten
 * `EntityManager` (`TransactionHost.tx`), NIEMALS über eine eigene Connection
 * (rote Linie 5 bleibt strukturell erzwungen: `edms_app` hat kein
 * INSERT-Recht direkt auf `audit.event`, nur `EXECUTE` auf `append_event`,
 * V0003 GRANTs). Liefert KEIN `ts`/`tag_utc`/`seq`/`prev_hash`/`lane` — das
 * trägt vollständig die DB.
 *
 * `actor_*` werden hier bewusst NICHT aus Client-Input akzeptiert — die
 * Aufrufer (`AuditActionInterceptor`, `AuthService`) leiten sie
 * AUSSCHLIESSLICH aus dem validierten `SecurityContext` ab (rote Linie 1).
 *
 * HTTP-Only-Grenze (`backend-lead`-Votum 3, ADR-0002 §15): dieser Service —
 * über den `AuditActionInterceptor` — deckt NUR HTTP-Request-Pfade ab.
 * Worker-/Cron-/interne Aufrufe (Persona C, ADR-0005 ff.) haben keinen
 * HTTP-Kontext und müssen `append()` EXPLIZIT aufrufen, innerhalb ihrer
 * eigenen `@Transactional()`-Klammer (gleiche Savepoint-Regeln).
 */
@Injectable()
export class AuditService {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  // Arrow-Klassenfeld statt Methode — vermeidet `@typescript-eslint/
  // unbound-method` beim Mocken in Tests (`expect(auditService.append)
  // .toHaveBeenCalledWith(...)`), ohne die Regel zu unterdrücken (s.
  // `access-token-verifier.service.ts`).
  append = async (input: AppendAuditEventInput): Promise<AppendedAuditEvent> => {
    const envelope = validateAuditEnvelope(input);
    const manager = this.txHost.tx;

    // `EntityManager.query(...)` ist bei TypeORM (roh-SQL-Pfad) mit `any`
    // typisiert — die explizite Zuweisung in eine typisierte Variable ist
    // hier LOAD-BEARING (keine Suppression): sie ist die EINZIGE Stelle, an
    // der die Zeilenform von `audit.append_event(...)` auf `AuditEventRow`
    // gebunden wird; ohne sie würde `any` unkontrolliert bis in die
    // öffentliche `AppendedAuditEvent`-Rückgabe durchsickern.
    const rawRows: unknown = await manager.query(
      'SELECT * FROM audit.append_event($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
      [
        envelope.eventTyp,
        envelope.actorTyp,
        envelope.ergebnis,
        envelope.actorSub ?? null,
        envelope.actorRolle ?? null,
        envelope.objektRef ?? null,
        JSON.stringify(envelope.kontext ?? {}),
        envelope.korrelationsId ?? null,
        envelope.eventId ?? null,
        envelope.formatVersion ?? 1,
      ],
    );
    const rows = rawRows as AuditEventRow[];

    const row = rows[0];
    if (row === undefined) {
      throw new Error('audit.append_event(...) hat keine Zeile zurueckgegeben — unerwarteter DB-Zustand.');
    }

    return {
      eventId: row.event_id,
      lane: row.lane,
      tagUtc: row.tag_utc,
      seq: row.seq,
      ts: row.ts,
      eventTyp: row.event_typ,
      ergebnis: row.ergebnis as AuditErgebnis,
    };
  };
}
