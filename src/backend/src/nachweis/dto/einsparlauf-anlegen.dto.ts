import { IsIn, IsOptional, IsUUID } from 'class-validator';

const ART_WERTE = ['foerderjahr_nachweis', 'zwischenstand'] as const;
const AUSLOESER_WERTE = ['manuell', 'job', 'korrektur'] as const;

/**
 * `POST /nachweis/einsparlaeufe` (`create:einsparlauf`, ADR-0007 D1/B1/B10 —
 * PORTFOLIOWEITE Aktion, KEIN `endkundeId`-Feld: „wer einen Förderjahr-
 * Nachweis erzeugen darf, sieht das Portfolio").
 *
 * `preflightId` ist EXPLIZIT Pflicht (anders als die B9-Skizze, die nur eine
 * FK-Spalte am Artefakt zeigt, aber offenlässt, WIE der Service den
 * passenden Preflight findet) — Design-Entscheidung, s. finale Antwort
 * dieses Arbeitspakets: der Aufrufer benennt den GENAUEN Preflight-Lauf, auf
 * den sich `art=foerderjahr_nachweis`s Fail-closed-Vorbedingung
 * ("grüner Preflight", D4) bezieht — statt einer impliziten
 * "jüngster-Preflight-für-dieses-Förderjahr"-Auflösung, die bei mehreren
 * Preflight-Wiederholungen (D4: "wiederholbar und idempotent") mehrdeutig
 * wäre.
 */
export class EinsparlaufAnlegenDto {
  @IsUUID()
  foerderjahrId!: string;

  @IsUUID()
  preflightId!: string;

  @IsIn(ART_WERTE)
  art!: (typeof ART_WERTE)[number];

  @IsOptional()
  @IsIn(AUSLOESER_WERTE)
  ausloeser?: (typeof AUSLOESER_WERTE)[number];

  @IsOptional()
  @IsUUID()
  ersetztEinsparlaufId?: string;
}
