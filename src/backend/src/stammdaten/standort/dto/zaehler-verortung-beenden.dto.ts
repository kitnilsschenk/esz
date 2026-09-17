import { IsDateString } from 'class-validator';

/** `components/schemas/ZaehlerVerortungBeenden` (stammdaten.openapi.yaml, ADR-0010 §5/D3). */
export class ZaehlerVerortungBeendenDto {
  @IsDateString()
  gueltigBis!: string;
}
