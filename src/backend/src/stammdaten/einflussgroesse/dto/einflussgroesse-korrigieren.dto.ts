import { Type } from 'class-transformer';
import { IsOptional, ValidateNested, Validate } from 'class-validator';
import { EinflussgroesseKorrekturWerteDto } from './einflussgroesse-korrektur.dto';
import { MonatsanfangConstraint } from './monatsanfang.validator';

/**
 * `components/schemas/EinflussgroesseKorrigieren` (`PATCH .../einflussgroessen/{id}`,
 * ADR-0006 Teil B, B10, V0020 D-UPDATE-SCOPE). `gueltigBisMonat` schließt
 * das ADRESSIERTE Intervall (die EINZIGE erlaubte UPDATE-Spalte,
 * spaltenscharfer GRANT) — PFLICHT bei JEDEM Aufruf dieser Route (s.
 * Design-Entscheidungen in der finalen Antwort dieses Arbeitspakets: "und/
 * oder neue Korrektur-Zeile" bedeutet HIER "das Schließen ist immer Teil des
 * Aufrufs, die neue Zeile ist optional", NICHT "beides ist optional" — ein
 * Aufruf, der WEDER schließt NOCH korrigiert, wäre kein Korrektur-Vorgang).
 * `korrektur` (optional) legt zusätzlich, in DERSELBEN Transaktion, eine
 * NEUE Zeile an (append-only).
 */
export class EinflussgroesseKorrigierenDto {
  @Validate(MonatsanfangConstraint)
  gueltigBisMonat!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => EinflussgroesseKorrekturWerteDto)
  korrektur?: EinflussgroesseKorrekturWerteDto;
}
