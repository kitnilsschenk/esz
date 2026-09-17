import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  Validate,
} from 'class-validator';
import type { ValidatorConstraintInterface } from 'class-validator';
import { ValidatorConstraint } from 'class-validator';
import { AUDIT_ERGEBNISSE } from '../../common/security/audit-ergebnis';
import type { AuditErgebnis } from '../../common/security/audit-ergebnis';
import { ACTOR_TYPEN } from '../../common/security/actor-typ';
import type { ActorTyp } from '../../common/security/actor-typ';

/** Skalare, JSONB-kompatible Kontext-Werte (rote Linie 1). */
export type AuditKontextValue = string | number | boolean | null;

const MAX_KONTEXT_KEYS = 32;
const MAX_KONTEXT_KEY_LENGTH = 64;
const MAX_KONTEXT_VALUE_OCTET_LENGTH = 512;

/**
 * Versions-AGNOSTISCHES UUID-Muster (akzeptiert u. a. UUIDv7, ADR-0004 §6:
 * "UUIDv7 bevorzugt"). `class-validator`s eingebautes `@IsUUID()` prüft je
 * nach Version einen festen Regex-Satz, der in älteren Paketversionen
 * UUIDv7 (Versions-Nibble `7`, erst RFC 9562/2024 standardisiert) u. U. NICHT
 * kennt — deshalb hier bewusst ein eigenes, versionsoffenes Muster statt
 * `@IsUUID()` (nur Format, keine Versions-/Variant-Einschränkung).
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Struktur-Validierung des `kontext`-JSONB VOR dem DB-Roundtrip (Defense-in-
 * Depth zusätzlich zum DB-Seal-Trigger, ADR-0003 §13.3): NUR Skalare
 * (`string`/`number`/`boolean`/`null`), keine verschachtelten Objekte/Arrays,
 * Werte-Größen-Cap. Die eigentliche Key-WHITELIST je `event_typ`
 * (`erlaubte_kontext_keys`) kennt nur die DB (Katalog-Tabelle) — die erzwingt
 * ausschließlich der Seal-Trigger; hier wird nur die STRUKTUR abgesichert,
 * damit ein grob falsch geformter Envelope gar nicht erst zur DB geht.
 */
@ValidatorConstraint({ name: 'kontextIsScalarMap', async: false })
class KontextIsScalarMapConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === undefined) {
      return true;
    }

    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return false;
    }

    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > MAX_KONTEXT_KEYS) {
      return false;
    }

    return entries.every(([key, entryValue]) => {
      if (key.length === 0 || key.length > MAX_KONTEXT_KEY_LENGTH) {
        return false;
      }

      if (entryValue === null) {
        return true;
      }

      if (typeof entryValue === 'boolean' || typeof entryValue === 'number') {
        return true;
      }

      if (typeof entryValue === 'string') {
        return Buffer.byteLength(entryValue, 'utf8') <= MAX_KONTEXT_VALUE_OCTET_LENGTH;
      }

      return false;
    });
  }

  defaultMessage(): string {
    return 'kontext muss ein flaches Objekt mit ausschließlich skalaren Werten (string/number/boolean/null) sein.';
  }
}

/**
 * Envelope-DTO für `AuditService.append()` (ADR-0003 §17.1: "Er validiert den
 * Envelope (DTO, `class-validator`, `whitelist`)"). Validiert VOR dem
 * `audit.append_event(...)`-Aufruf.
 *
 * Absichtlich KEINE `ts`/`tag_utc`/`seq`/`prev_hash`/`lane`-Felder — die
 * trägt vollständig die DB (rote Linie 5, ADR-0002 §15).
 */
export class AuditEnvelopeDto {
  /** Katalog-Code (`domaene.objekt.verb`) — Existenz/Aktiv-Status prüft die DB (FK + Trigger). */
  @IsString()
  @MaxLength(200)
  eventTyp!: string;

  @IsIn(ACTOR_TYPEN)
  actorTyp!: ActorTyp;

  @IsIn(AUDIT_ERGEBNISSE)
  ergebnis!: AuditErgebnis;

  /** Opake Keycloak-Principal-ID — NUR aus `SecurityContext`, nie aus Client-Input (rote Linie 1). */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  actorSub?: string;

  /** Nur relevant, wenn der Katalog `rolle_erfassen=true` setzt (§13.4) — DB entscheidet, ob sie landet. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  actorRolle?: string;

  /** Pseudonym/Entity-UUID, KEIN FK (Linie 2). */
  @IsOptional()
  @Matches(UUID_PATTERN)
  objektRef?: string;

  @IsOptional()
  @IsObject()
  @Validate(KontextIsScalarMapConstraint)
  kontext?: Record<string, AuditKontextValue>;

  @IsOptional()
  @Matches(UUID_PATTERN)
  korrelationsId?: string;

  @IsOptional()
  @Matches(UUID_PATTERN)
  eventId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(32767)
  formatVersion?: number;
}
