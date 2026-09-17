import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

const MAX_BATCH_GROESSE = 500;

/**
 * `components/schemas/StandortLabelsAnfrage` (stammdaten.openapi.yaml,
 * ADR-0010 §5, `POST .../standorte/labels`) — Batch-Entschlüsselung für die
 * Baum-UI. Obergrenze `MAX_BATCH_GROESSE` verhindert unbegrenzte
 * Massen-Entschlüsselung in einem einzigen (dennoch nur EINMAL auditierten,
 * D5) Request.
 */
export class StandortLabelsAnfrageDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BATCH_GROESSE)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  standortIds!: string[];
}
