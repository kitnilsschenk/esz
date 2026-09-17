import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import type { Energietraeger } from '../../persistence/energy/energy-zaehler.repository';

const ENERGIETRAEGER_WERTE: readonly Energietraeger[] = ['strom', 'waerme', 'kaelte', 'gas', 'oel', 'biomasse'];

/** `components/schemas/EnergietraegerBaseline` (stammdaten.openapi.yaml). */
export class EnergietraegerBaselineDto {
  @IsIn(ENERGIETRAEGER_WERTE)
  energietraeger!: Energietraeger;

  @IsOptional()
  @IsNumber()
  baselineWert?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  baselineEinheit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  baselineMethode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  baselineBegruendung?: string;

  @IsOptional()
  @IsUUID()
  baselineBelegRef?: string;

  /**
   * TB-02 ([Q3] Kap. 2.1.2, V0065) — der EXTERNE Belegverweis.
   *
   * Das Merkblatt verlangt den Mittelwert aus mindestens drei
   * Jahresabrechnungen und bei weniger eine dokumentierte Begründung. Die
   * ANZAHL ist der Wert, an dem diese Regel überhaupt prüfbar wird; ohne sie
   * stand die Pflicht seit V0002 nur als Kommentar im Schema. Ein DB-CHECK
   * erzwingt die Begründung jetzt (`ck_mvet_baseline_begruendung_bei_wenigen_abrechnungen`).
   *
   * Die Abrechnungen selbst bleiben AUSSERHALB des Systems (ADR-0006 O4:
   * „v1 mit externem Aktenzeichen betreiben") — sie sind voller
   * Personendaten, und eine Dokumentenablage wäre ein neues Drittsystem mit
   * eigenem ADR- und Security-Review.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(99)
  baselineAbrechnungenAnzahl?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  baselineBelegAktenzeichen?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  baselineBelegAblageort?: string;

  /**
   * ADR-0007 B13.4/B14/O-B3b (V0029, `energy.messkonzept_version_
   * energietraeger.energietraeger_substitution`) — explizites, vom
   * Betriebs-Team gesetztes Kennzeichen: ein Energieträger-Wechsel
   * (Substitution) liegt vor. Optional, Default `false` (Substitution ist
   * der Ausnahmefall, s. DB-Kommentar). Ein gesetztes Kennzeichen führt im
   * Einspar-Lauf zu `status='ausgeschlossen'` MIT Ausweis (DE-02), NICHT zu
   * einer abweichenden Berechnung (Merkblatt Technik v2.2 Kap. 3).
   */
  @IsOptional()
  @IsBoolean()
  energietraegerSubstitution?: boolean;
}
