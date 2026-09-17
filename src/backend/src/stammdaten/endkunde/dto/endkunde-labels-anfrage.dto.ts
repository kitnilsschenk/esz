import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

/**
 * Auflage A2 (ADR-0008 D12): **100, nicht 500** wie beim Standort-Batch.
 *
 * Der Standort-Endpunkt liegt unter `/stammdaten/endkunden/{endkundeId}/…`
 * und ist durch die Mandantengrenze gedeckelt — man bekommt die Standorte
 * EINES Kunden. Dieser Endpunkt hat keine solche Obergrenze; er könnte im
 * Grenzfall den gesamten Kundenbestand ausleiten. 100 ist zugleich das
 * `limit`-Maximum aus `.claude/rules/api-contracts.md`, womit gilt:
 * **1 Aufruf = 1 dargestellte Seite = 1 Audit-Event** — genau diese Gleichung
 * macht die Audit-Granularität „je Aufruf" (A6) verhältnismäßig.
 *
 * Korollar K4: Die Gleichung hält nur, solange die aufrufende Seitengröße
 * ≤ 100 bleibt. Wird sie überschritten, entkoppelt sich der Batch von der
 * Darstellung und A3 wie A6 verlieren ihre Grundlage.
 */
const MAX_BATCH_GROESSE = 100;

/**
 * `components/schemas/EndkundeLabelsAnfrage` (stammdaten.openapi.yaml,
 * ADR-0008 D12, `POST /stammdaten/endkunden/labels`).
 *
 * `@ArrayUnique()` ist hier nicht bloß Hygiene (Nebenbefund N2 der
 * `technical-director`-Entscheidung zu K14): Ohne sie könnte ein Client 100
 * identische Ids senden und `anzahl_angefragt` gegenüber `anzahl_endkunden`
 * künstlich aufblähen — das verfälschte genau die Differenz, mit der Auflage
 * A4 nachgewiesen wird.
 */
export class EndkundeLabelsAnfrageDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BATCH_GROESSE)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  endkundeIds!: string[];
}
