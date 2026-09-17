import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { STANDORT_TYP_WERTE } from '../standort.constants';
import type { StandortTyp } from '../standort.constants';

/**
 * `components/schemas/StandortAnlegen` (stammdaten.openapi.yaml, ADR-0010 §5).
 * `bezeichnung` ist PFLICHT (D4: `bezeichnung_enc` existiert auf JEDER Ebene,
 * NOT NULL) — wird feldverschlüsselt nach `identity.standort_pii` geschrieben,
 * NIE zurück in der `create:standort`-Antwort (D5-Trennung, s.
 * `standort.service.ts`). `adresse` ist frei-text (analog `EndkundePiiDto.
 * anschrift`) und nur auf bestimmten Ebenen zulässig (D4, service-seitig
 * geprüft — kein DB-CHECK möglich, energy kennt den Adress-Zustand nicht).
 */
export class StandortAnlegenDto {
  @IsIn(STANDORT_TYP_WERTE)
  typ!: StandortTyp;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortierung?: number;

  @IsString()
  @MinLength(1)
  @MaxLength(512)
  bezeichnung!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  adresse?: string;

  /**
   * Klimastation dieses Standorts (ADR-0010) — z. B. `DWD-04094`.
   *
   * Zeichen-Whitelist wie bei `stationRef` am Berechnungslauf: Der reale
   * DWD-Adapter setzt die Kennung in Datei-/URL-Pfade auf `opendata.dwd.de`
   * ein; ohne Whitelist droht dort Path-Traversal.
   *
   * Leerstring beim Ändern = Station wieder entfernen.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]*$/, { message: 'klimareferenz darf nur A-Z, a-z, 0-9, _ und - enthalten.' })
  klimareferenz?: string;

}
