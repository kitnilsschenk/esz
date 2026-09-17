import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AuditEnvelopeDto } from './dto/audit-envelope.dto';
import type { AuditKontextValue } from './dto/audit-envelope.dto';
import type { ActorTyp } from '../common/security/actor-typ';
import type { AuditErgebnis } from '../common/security/audit-ergebnis';

export interface AppendAuditEventInput {
  readonly eventTyp: string;
  readonly actorTyp: ActorTyp;
  readonly ergebnis: AuditErgebnis;
  readonly actorSub?: string;
  readonly actorRolle?: string;
  readonly objektRef?: string;
  readonly kontext?: Record<string, AuditKontextValue>;
  readonly korrelationsId?: string;
  readonly eventId?: string;
  readonly formatVersion?: number;
}

/** Envelope hat den Struktur-Check (class-validator) NICHT bestanden — s. `AuditEnvelopeDto`. */
export class AuditEnvelopeValidationError extends Error {
  constructor(public readonly issues: readonly string[]) {
    super(`Audit-Envelope ungueltig: ${issues.join('; ')}`);
  }
}

/**
 * Zustandslose Kern-Validierung des Audit-Envelopes — extrahiert aus
 * `AuditService.append()` (Security-Review-Nachbesserung zu V0079, V0082).
 *
 * WARUM EXTRAHIERT: `AuditService` fährt diese Prüfung über den ambienten
 * `TransactionHost` (App-Verbindung `edms_app`, HTTP-Request-Pfade,
 * `AuditActionInterceptor`/`AuthService`). `Tb03BefundRepository`
 * (`einfluss/persistence/`) braucht DIESELBE Struktur-Prüfung auf einer
 * ZWEITEN, eigenen Verbindung (Rolle `edms_einfluss_erkennung`) — A19(b)
 * verlangt Befund und Audit-Ereignis in DERSELBEN Transaktion, und eine
 * Transaktion kann nicht über zwei Verbindungen reichen (deshalb kein
 * `AuditService`/`TransactionHost` dort). Vor V0082 rief der Erkennungslauf
 * `pool.query(...)` roh auf und umging damit `AuditEnvelopeDto` vollständig —
 * ein Envelope, der von der HTTP-Fassung abweicht, wäre dort unbemerkt
 * geblieben. `validateSync`/`plainToInstance` sind zustandslos und ohne
 * HTTP-/TransactionHost-Bindung — sie lassen sich verlustfrei an EINEN Ort
 * ziehen, den beide Aufrufer teilen, statt die Prüfregel zweimal zu pflegen.
 *
 * Wirft `AuditEnvelopeValidationError` bei Verstoß, sonst die validierte
 * DTO-Instanz.
 */
export function validateAuditEnvelope(input: AppendAuditEventInput): AuditEnvelopeDto {
  const instance = plainToInstance(AuditEnvelopeDto, input);
  const errors = validateSync(instance, { whitelist: true, forbidNonWhitelisted: true });

  if (errors.length > 0) {
    const issues = errors.map(
      (error) => `${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`,
    );
    throw new AuditEnvelopeValidationError(issues);
  }

  return instance;
}
