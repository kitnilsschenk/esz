import { IsUUID } from 'class-validator';

/**
 * `GET /berechnung/parametervorschlag?endkundeId=&mvetId=`
 *
 * Beide Kennungen sind Pflicht — genau wie am Lauf selbst, und aus demselben
 * Grund: Der Vorschlag gilt für ein (Endkunde, Messkonzept-Energieträger)-
 * Paar, nicht für einen Kunden. Ein Kunde mit Strom UND Wärme bekommt zwei
 * völlig verschiedene Grundlastanteile.
 */
export class ParametervorschlagQueryDto {
  @IsUUID()
  endkundeId!: string;

  @IsUUID()
  mvetId!: string;
}
