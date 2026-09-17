import { IsIn, IsISO8601, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateIf } from 'class-validator';

const ART_WERTE = ['verwendungsnachweis', 'zwischennachweis', 'anfrage_bafa', 'stichprobe'] as const;
const UEBERMITTLUNGSWEG_WERTE = ['bscw_manuell', 'email_geschuetzt', 'api'] as const;
const KORREKTUR_GRUND_CODES = [
  'messwert_korrektur',
  'klima_revision',
  'baseline_korrektur',
  'einflussgroesse_korrektur',
  'verfahren_version_neu',
  'parameter_korrektur',
  'foerderjahr_definition_geaendert',
  'sonstige',
] as const;

/**
 * `POST /nachweis/exporte/{id}/einreichungen` (`create:einreichung`,
 * ADR-0007 D7/B7/B10). `exportId` kommt aus dem Pfad.
 *
 * **Ehrlichkeitsklausel (B7 wörtlich, s. `EinreichungService`-Doc):** dieser
 * Endpoint VERMERKT eine bereits ausgeführte Handlung des Bedieners
 * (manueller BSCW-Upload o. Ä.) — er STELLT sie nicht selbst zu. `belegRef`
 * ist der Slot für eine spätere Empfangsbestätigung (eigenes, hier NICHT
 * gebautes Beleg-ADR).
 *
 * **Korrektur (D7 Punkt 3):** `ersetztEinreichungId` und
 * `korrekturGrundCode` MÜSSEN GEMEINSAM gesetzt oder GEMEINSAM
 * ausgelassen werden (DB-CHECK `ck_einreichung_ersetzt_kohaerenz`,
 * hier bereits an der DTO-Grenze gespiegelt).
 */
export class EinreichungAnlegenDto {
  @IsIn(ART_WERTE)
  art!: (typeof ART_WERTE)[number];

  /** DE-01 „nur auf Anfrage" → Aktenzeichen. */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  anfrageRef?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  empfaenger?: string;

  @IsIn(UEBERMITTLUNGSWEG_WERTE)
  uebermittlungsweg!: (typeof UEBERMITTLUNGSWEG_WERTE)[number];

  /** ISO-8601 UTC-Zeitpunkt der ERKLÄRTEN Übermittlung durch den Bediener (Ehrlichkeitsklausel — s. Klassen-Dok). */
  @IsISO8601({ strict: true })
  uebermitteltAt!: string;

  /** Slot für eine spätere Empfangsbestätigung — KEIN FK (Beleg-ADR, s. Klassen-Dok). */
  @IsOptional()
  @IsUUID()
  belegRef?: string;

  @IsOptional()
  @IsUUID()
  ersetztEinreichungId?: string;

  @ValidateIf((o: EinreichungAnlegenDto) => o.ersetztEinreichungId !== undefined)
  @IsIn(KORREKTUR_GRUND_CODES)
  korrekturGrundCode?: (typeof KORREKTUR_GRUND_CODES)[number];
}
