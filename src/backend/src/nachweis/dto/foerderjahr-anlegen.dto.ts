import { IsDateString, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

const DEFINITION_QUELLE_WERTE = ['kalenderjahr', 'bewilligungszeitraum'] as const;

/**
 * `POST /nachweis/foerderjahre` (`create:foerderjahr`, ADR-0007 B4/O1/O-B1).
 * `vonMonat`/`bisMonat` MÜSSEN Monatsanfänge sein (Service-seitige Prüfung,
 * `nachweis.foerderjahr`-DB-CHECKs `ck_foerderjahr_von_monat_erster`/
 * `ck_foerderjahr_bis_monat_erster` sind der Backstop) — BEIDE INKLUSIV
 * (anders als `BerechnungslaufAnlegenDto.periodeBis`, dort EXKLUSIV, s.
 * `nachweis/zeit.util.ts`-Kopfkommentar).
 */
export class FoerderjahrAnlegenDto {
  /** z. B. `FJ-2027` — `nachweis.foerderjahr.code`, UNIQUE. */
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'code darf nur A-Z, a-z, 0-9, _ und - enthalten.' })
  code!: string;

  /** Aktenzeichen/Bescheid-Bezug (Slot, KEIN FK, B9). */
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  vorhabenRef!: string;

  /** Projektjahr 1..5 (TB-05-kompatibel, B9 `CHECK (nummer >= 1)`). */
  @IsInt()
  @Min(1)
  @Max(20)
  nummer!: number;

  /** ISO `YYYY-MM-DD`, Monatserster — INKLUSIVER Förderjahres-Beginn. */
  @IsDateString({ strict: true })
  vonMonat!: string;

  /** ISO `YYYY-MM-DD`, Monatserster — INKLUSIVES Förderjahres-Ende. */
  @IsDateString({ strict: true })
  bisMonat!: string;

  /**
   * Der taggenaue Beginn (inklusiv) — optional, seit V0070.
   *
   * Ein Förderjahr aus einem Bewilligungsbescheid beginnt selten am
   * Monatsersten. Kap. 9.1 des Technischen Merkblatts v2.2 verlangt, die
   * Einsparung zeitanteilig zu ermitteln, wenn der relevante Zeitraum kleiner
   * ist als das Förderjahr — ohne taggenaue Grenzen ließe sich das nur durch
   * Runden auf Monatsgrenzen abbilden, was den Nachweiszeitraum um Wochen
   * verschiebt.
   *
   * Fehlt die Angabe, gilt wie bisher das volle Monatsfenster. `vonTag` und
   * `bisTag` sind wechselseitig Pflicht und müssen in den Monaten liegen, die
   * `vonMonat`/`bisMonat` nennen (der Service prüft das).
   */
  @IsOptional()
  @IsDateString({ strict: true })
  vonTag?: string;

  /** ISO `YYYY-MM-DD` — erster Tag NACH dem Förderjahr (EXKLUSIV, anders als `bisMonat`). */
  @IsOptional()
  @IsDateString({ strict: true })
  bisTag?: string;

  @IsIn(DEFINITION_QUELLE_WERTE)
  definitionQuelle!: (typeof DEFINITION_QUELLE_WERTE)[number];

  @IsOptional()
  @IsString()
  @MaxLength(128)
  bescheidRef?: string;
}
