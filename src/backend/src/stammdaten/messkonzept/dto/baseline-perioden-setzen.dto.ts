import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Die Einheiten, in denen eine Jahresabrechnung eine Menge ausweist.
 *
 * Bewusst GESCHLOSSEN, obwohl `baseline_einheit` an der mvet selbst Freitext
 * ist (`maxLength: 50`). Freitext hieße hier, dass „kwh", „KWh" und „kWh"
 * nebeneinander stünden und niemand die Mengen zweier Perioden vergleichen
 * könnte — und genau dieser Vergleich ist der Sinn der Angabe.
 *
 * Die Liste ist weiter als das, was der Rechenweg verträgt: Er weist alles
 * außer `kWh` mit `BASELINE_EINHEIT_UNGUELTIG` ab („wird in v1 NICHT
 * automatisch umgerechnet"). Das ist kein Widerspruch — die Menge einer
 * Periode geht in KEINE Rechnung ein, sie belegt die Abrechnung. Eine
 * Gasrechnung weist m³ aus, und sie in kWh umzuschreiben, damit das Feld
 * passt, würde den Beleg verfälschen.
 */
export const BASELINE_EINHEITEN = ['kWh', 'MWh', 'GJ', 'm³', 'l', 'kg', 't'] as const;
export type BaselineEinheit = (typeof BASELINE_EINHEITEN)[number];

/**
 * Eine Periode — der Zeitraum EINER Jahresabrechnung.
 *
 * **`bis` ist AUSSCHLIESSLICH.** So steht es in der Tabelle (`CHECK bis > von`)
 * und so liest es der Berechnungslauf (`tag >= von && tag < bis`). Eine
 * Abrechnung über das Kalenderjahr 2023 wird damit als
 * `von=2023-01-01, bis=2024-01-01` erfasst — nicht als `bis=2023-12-31`.
 * Die Antwort der Route trägt zu jeder Periode `tage` und `letzterTag` mit,
 * damit dieser Unterschied nicht erst in der Einsparzahl auffällt.
 */
export class BaselinePeriodeEingabeDto {
  /** ISO `YYYY-MM-DD`, erster Tag des Abrechnungszeitraums (einschließlich). */
  @IsDateString({ strict: true })
  von!: string;

  /** ISO `YYYY-MM-DD`, erster Tag NACH dem Abrechnungszeitraum (ausschließlich). */
  @IsDateString({ strict: true })
  bis!: string;

  /**
   * Die abgerechnete Menge. Optional — für GTZ_base zählt allein der
   * Zeitraum; die Menge ist der Beleg, aus dem die Baseline gemittelt wurde,
   * und macht den Eintrag nachprüfbar.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  menge?: number;

  @IsOptional()
  @IsIn(BASELINE_EINHEITEN, {
    message: `einheit muss eine von: ${BASELINE_EINHEITEN.join(', ')} sein.`,
  })
  einheit?: BaselineEinheit;
}

/**
 * `PUT /stammdaten/messkonzept-energietraeger/{mvetId}/baseline-perioden` —
 * die Bezugszeiträume als MENGE.
 *
 * Ein leeres Array ist zulässig und bedeutet „keine erfasst". Der
 * Berechnungslauf weist dann mit `GTZ_BASE_NICHT_ERMITTELBAR` ab, sofern
 * kein `gtzBaseOverride` gesetzt ist und der Grundlastanteil unter 1 liegt —
 * ein erklärter Fehler statt einer stillen Fehlrechnung.
 */
export class BaselinePeriodenSetzenDto {
  @IsArray()
  // TB-02 erwartet drei Jahresabrechnungen; zwoelf laesst Raum fuer
  // unterjaehrige Abrechnungen und Sonderfaelle, ohne dass ein versehentlich
  // riesiger Body durchgeht.
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => BaselinePeriodeEingabeDto)
  perioden!: BaselinePeriodeEingabeDto[];
}
