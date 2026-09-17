import { IsIn, IsUUID } from 'class-validator';
import { SUBJEKT_TYPEN } from '../consent.types';
import type { SubjektTyp } from '../consent.types';

/** `GET /consent/widersprueche?subjektTyp=&subjektId=` (Auflage AW-27). */
export class WiderspruchQueryDto {
  @IsIn(SUBJEKT_TYPEN, { message: `subjektTyp muss einer von ${SUBJEKT_TYPEN.join(', ')} sein.` })
  subjektTyp!: SubjektTyp;

  @IsUUID(undefined, { message: 'subjektId muss eine UUID sein.' })
  subjektId!: string;
}
