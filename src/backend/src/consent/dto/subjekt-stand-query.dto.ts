import { IsIn, IsUUID } from 'class-validator';
import { SUBJEKT_TYPEN } from '../consent.types';
import type { SubjektTyp } from '../consent.types';

/** `GET /consent/einwilligungen` — Stand EINES Subjekts (ADR-0012 B1). */
export class SubjektStandQueryDto {
  @IsIn(SUBJEKT_TYPEN, { message: `subjektTyp muss einer von ${SUBJEKT_TYPEN.join(', ')} sein.` })
  subjektTyp!: SubjektTyp;

  @IsUUID(undefined, { message: 'subjektId muss eine UUID sein.' })
  subjektId!: string;
}
