import { IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, Min, MinLength, MaxLength, Validate } from 'class-validator';
import type { BetroffenerTyp, QuelleTyp, Rechtsgrundlage } from '../../persistence/einfluss/einfluss-intervall.repository';
import { ANLASS_CODE_WERTE, BETROFFENER_TYP_WERTE, QUELLE_TYP_WERTE, RECHTSGRUNDLAGE_WERTE } from '../einflussgroesse.constants';
import type { AnlassCode } from '../einflussgroesse.constants';
import { MonatsanfangConstraint } from './monatsanfang.validator';

/**
 * `components/schemas/EinflussgroesseErfassen` (`POST .../systeme/{systemId}/einflussgroessen`,
 * ADR-0006 Teil B, B8/B10). `endkundeId` ist BEWUSST NICHT Teil dieses DTOs
 * (RL-B1 — wird server-seitig aus `systemId -> energy.system.endkunde_id`
 * abgeleitet, `EinflussgroesseService.erfassen()`).
 *
 * `groesseCode` wird NICHT statisch (`@IsIn`) gegen die fünf aktuell
 * geseedeten Katalog-Codes geprüft — der Katalog ist DB-governt und
 * erweiterbar OHNE Code-Änderung (`EinflussKatalogRepository.findByCode()`
 * im Service, 400 bei unbekanntem/inaktivem Code). Die `wert_art`-Konsistenz
 * (numerisch->wertNum XOR codiert->wertCode) ist GENAUSO dynamisch (hängt
 * vom Katalog-Eintrag ab) und daher ebenfalls Service-Sache, NICHT DTO-Sache
 * — s. Design-Entscheidungen in der finalen Antwort dieses Arbeitspakets.
 */
export class EinflussgroesseErfassenDto {
  @IsOptional()
  @IsUUID()
  standortId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  groesseCode!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  wertNum?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  wertCode?: string;

  @Validate(MonatsanfangConstraint)
  gueltigAbMonat!: string;

  @IsOptional()
  @Validate(MonatsanfangConstraint)
  gueltigBisMonat?: string;

  @IsIn(BETROFFENER_TYP_WERTE)
  betroffenerTyp!: BetroffenerTyp;

  @IsIn(QUELLE_TYP_WERTE)
  quelleTyp!: QuelleTyp;

  @IsIn(RECHTSGRUNDLAGE_WERTE)
  rechtsgrundlage!: Rechtsgrundlage;

  /** Verweis auf die dokumentierte Interessenabwägung (LIA) — Pflicht bei `betroffenerTyp=anschlussnutzer` (Art. 14, V0020 CHECK). */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  abwaegungRef?: string;

  /** Zeitpunkt der Art.-14-Information — Pflicht bei `betroffenerTyp=anschlussnutzer` (V0020 CHECK). */
  @IsOptional()
  @IsDateString()
  art14InformationAt?: string;

  @IsOptional()
  @IsIn(ANLASS_CODE_WERTE)
  anlassCode?: AnlassCode;
}
