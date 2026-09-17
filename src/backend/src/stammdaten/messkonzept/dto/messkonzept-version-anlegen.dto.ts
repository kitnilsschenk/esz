import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { EnergietraegerBaselineDto } from './energietraeger-baseline.dto';
import type { MesskonzeptTyp } from '../../persistence/energy/energy-messkonzept.repository';

const TYP_WERTE: readonly MesskonzeptTyp[] = ['vereinfacht', 'standard', 'alternativ'];

/**
 * `components/schemas/MesskonzeptVersionAnlegen` (stammdaten.openapi.yaml) —
 * alle 7 TB-01-Pflichtinhalte (append-only, ADR-0008 §13/D1).
 */
export class MesskonzeptVersionAnlegenDto {
  @IsIn(TYP_WERTE)
  typ!: MesskonzeptTyp;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  systemgrenze!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  systembeschreibung!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  bereinigungsverfahren!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  messgeraeteWahl!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  geraeteerkennungsVerfahren!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  aenderungsgrund?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => EnergietraegerBaselineDto)
  energietraeger!: EnergietraegerBaselineDto[];
}
