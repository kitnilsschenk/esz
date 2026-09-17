import { IsDateString, IsUUID } from 'class-validator';

/**
 * `components/schemas/ZaehlerVerortungAnlegen` (stammdaten.openapi.yaml,
 * ADR-0010 §5/D3, `POST .../zaehler/{zaehlerId}/verortung`). `zaehlerId`
 * kommt aus dem Pfad (analog `GeraetZuordnungAnlegenDto`).
 */
export class ZaehlerVerortungAnlegenDto {
  @IsUUID()
  standortId!: string;

  @IsDateString()
  gueltigVon!: string;
}
