import { IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { STANDORT_TYP_WERTE } from '../standort.constants';
import type { StandortTyp } from '../standort.constants';

/**
 * `components/schemas/StandortAendern` (stammdaten.openapi.yaml, ADR-0010 §5,
 * PATCH .../standorte/{id}) — STRUKTUR NUR (`typ`/`sortierung`),
 * AUSDRÜCKLICH NICHT `status` (eigene Aktion `stilllegen`, D2.6) und NICHT
 * `bezeichnung`/`adresse` (eigene Aktion `PUT .../pii`, D5-Trennung).
 */
export class StandortAendernDto {
  @IsOptional()
  @IsIn(STANDORT_TYP_WERTE)
  typ?: StandortTyp;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortierung?: number;

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
