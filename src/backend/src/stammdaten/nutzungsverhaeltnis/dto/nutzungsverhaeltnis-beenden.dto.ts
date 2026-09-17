import { IsDateString } from 'class-validator';

/** `components/schemas/NutzungsverhaeltnisBeenden` (stammdaten.openapi.yaml). */
export class NutzungsverhaeltnisBeendenDto {
  @IsDateString()
  gueltigBis!: string;
}
