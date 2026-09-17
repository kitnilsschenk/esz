import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * `POST /geraeteerkennung/systeme/{systemId}/entbehrlich` ([Q3] Kap. 5).
 *
 * „In Faellen, in denen eine Geraeteerkennung nicht sinnvoll ist,
 * beispielsweise bei Systemen, die nur ein Geraet umfassen, gelten die fuer
 * Geraeteerkennung genannten Anforderungen pauschal als erfuellt."
 */
export class EntbehrlichVermerkenDto {
  @IsBoolean({ message: 'entbehrlich muss ein Wahrheitswert sein.' })
  entbehrlich!: boolean;

  /** Pflicht, sobald `entbehrlich` gesetzt wird -- der Service prueft das. */
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'grund ist zu kurz.' })
  @MaxLength(500)
  grund?: string;
}
