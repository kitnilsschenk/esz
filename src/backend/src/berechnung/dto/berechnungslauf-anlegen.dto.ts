import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { BerechnungslaufParameterDto } from './berechnungslauf-parameter.dto';

const AUSLOESER_WERTE = ['manuell', 'job', 'nachlauf_korrektur'] as const;

/**
 * `POST /berechnung/laeufe` (`components/schemas/BerechnungslaufAnlegen`,
 * `schemas/openapi/berechnung.openapi.yaml`).
 *
 * `endkundeId` UND `mvetId` sind BEIDE Pflicht (redundant, wie
 * `analytics.berechnungslauf.endkunde_id`/`.energietraeger` selbst — V0019
 * wörtlich: "redundant (B1, ABAC-Filter ohne Join)"): `endkundeId` trägt die
 * ABAC-Ressourcen-Auflösung OHNE zusätzlichen JOIN
 * (`StammdatenResourceAttributesProvider`, s. Policy-Diff), der Service
 * verifiziert server-seitig, dass `mvetId` TATSÄCHLICH zu `endkundeId`
 * gehört (400 bei Abweichung) — genau die im V0019-Kommentar benannte
 * App-Schreibpfad-Konsistenzpflicht.
 *
 * `stationRef`/`grundlastAnteil` sind EXPLIZITE Pflichtparameter (KEINE
 * Laufzeit-Auflösung, D4 "fail-closed-Regel" bzw. B12.1 "g ... expliziter
 * Verfahrensparameter, keine Schätzung im Kern") — s. Design-Entscheidungen
 * in der finalen Antwort dieses Arbeitspakets.
 */
export class BerechnungslaufAnlegenDto {
  @IsUUID()
  endkundeId!: string;

  @IsUUID()
  mvetId!: string;

  /** ISO `YYYY-MM-DD`, erster Kalendertag des ERSTEN Zielmonats. */
  @IsDateString({ strict: true })
  periodeVon!: string;

  /** ISO `YYYY-MM-DD`, EXKLUSIV — erster Kalendertag NACH dem letzten Zielmonat (halboffen). */
  @IsDateString({ strict: true })
  periodeBis!: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  grundlastAnteil!: number;

  /**
   * Eingefrorene Klimastations-Referenz (D4) — s. Design-Entscheidungen.
   *
   * M2 (security-auditor, ADR-0006 Phase 5) — restriktive Zeichen-Whitelist
   * schon JETZT, obwohl der aktive `SyntheticKlimaQuelleAdapter` das Feld
   * ignoriert: der reale DWD-Adapter (Folgepaket) wird `stationRef` in
   * Datei-/URL-Pfade auf `opendata.dwd.de` einsetzen. Ohne Whitelist droht
   * dort Path-Traversal (`../`) / URL-Injection. DWD-Stations-IDs sind
   * alphanumerisch — `[A-Za-z0-9_-]` deckt sie ab.
   */
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'stationRef darf nur A-Z, a-z, 0-9, _ und - enthalten (M2).' })
  stationRef!: string;

  /** Expliziter GTZ_base-Override (Kd/a) — überspringt die Baseline-Perioden/Klima-Herleitung, falls gesetzt. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  gtzBaseOverride?: number;

  /**
   * Expliziter GTZ_norm-Override (Kd/a, langjähriges Stationsmittel,
   * B5/B12.1) — NUR für den Ausweis `baselineNormKwh` (`baselineNormiert()`),
   * geht NIE in `referenzMonat()`/die Einsparrechnung ein. v1 implementiert
   * KEINE automatische Normperioden-Auflösung (WMO-Referenzperiode,
   * `normperiode`-Parameter "fachlich zu bestätigen", B12.1) — ohne dieses
   * Feld bleiben `gtzNorm`/`baselineNormKwh` `null` (DB erlaubt das explizit).
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  gtzNormOverride?: number;

  @IsOptional()
  @IsIn(AUSLOESER_WERTE)
  ausloeser?: (typeof AUSLOESER_WERTE)[number];

  @IsOptional()
  @IsUUID()
  ersetztLaufId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => BerechnungslaufParameterDto)
  parameter?: BerechnungslaufParameterDto;
}
