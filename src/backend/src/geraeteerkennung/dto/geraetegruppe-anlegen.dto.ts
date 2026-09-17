import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/** `POST /geraeteerkennung/gruppen` (TB-05). */
export class GeraetegruppeAnlegenDto {
  @IsUUID(undefined, { message: 'endkundeId muss eine UUID sein.' })
  endkundeId!: string;

  /**
   * Die Bezeichnung ist das, was der Endkunde spaeter in seiner monatlichen
   * Information liest ([Q3] Kap. 6: „getrennt nach jeweiligen Gruppen").
   * Sie sollte deshalb allgemeinverstaendlich sein -- „Beleuchtung", nicht
   * „Abgang 3".
   */
  @IsString()
  @MinLength(2, { message: 'bezeichnung ist zu kurz.' })
  @MaxLength(120)
  bezeichnung!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  beschreibung?: string;
}
