import { IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, Min, MinLength, MaxLength, Validate } from 'class-validator';
import type { BetroffenerTyp, QuelleTyp, Rechtsgrundlage } from '../../persistence/einfluss/einfluss-intervall.repository';
import { BETROFFENER_TYP_WERTE, QUELLE_TYP_WERTE, RECHTSGRUNDLAGE_WERTE } from '../einflussgroesse.constants';
import { MonatsanfangConstraint } from './monatsanfang.validator';

/**
 * `components/schemas/EinflussgroesseKorrekturWerte` (verschachtelt in
 * `EinflussgroesseKorrigieren.korrektur`) — die VOLLSTÄNDIGEN Felder der
 * NEUEN Korrektur-Zeile (append-only, "Wert NIE überschreiben", V0020
 * D-UPDATE-SCOPE). `groesseCode` ist BEWUSST NICHT Teil dieses DTOs — eine
 * Korrektur bleibt an derselben Einflussgröße (`groesse_code` wird vom
 * ursprünglichen Intervall GEERBT, `EinflussgroesseService.korrigieren()`);
 * ein Wechsel der Einflussgröße ist keine "Korrektur" im fachlichen Sinn,
 * sondern eine neue Erst-Erfassung (`POST .../einflussgroessen`).
 * `anlassCode` ist EBENFALLS nicht Teil dieses DTOs — der Service setzt ihn
 * HART auf `'korrektur'` (nicht client-wählbar, s. Design-Entscheidungen in
 * der finalen Antwort dieses Arbeitspakets).
 */
export class EinflussgroesseKorrekturWerteDto {
  @IsOptional()
  @IsUUID()
  standortId?: string;

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

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  abwaegungRef?: string;

  @IsOptional()
  @IsDateString()
  art14InformationAt?: string;
}
