import { IsOptional, IsUUID, Matches } from 'class-validator';

/**
 * `POST /monitoring/ingest/herkunft` (ADR-0011 B2/D3).
 *
 * Die vier Kennungen sind UUIDs — die beiden ChirpStack-seitigen, weil der
 * Netzserver sie so vergibt, die beiden EDMS-seitigen nach V0002-Konvention.
 * Ein Formfehler wird hier abgewiesen und nicht erst von der Datenbank: Ein
 * `22P02 invalid input syntax for type uuid` waere fuer den Aufrufer keine
 * Auskunft.
 *
 * OHNE Versionsangabe (`@IsUUID()`, wie ueberall sonst im Stammdaten-Pfad):
 * `@IsUUID('4')` wuerde die EDMS-eigenen Kennungen ABLEHNEN — die sind nach
 * V0002-Konvention UUIDv7. Und ueber die Version, in der ein FREMDER
 * Netzserver seine Kennungen vergibt, hat das EDMS ohnehin nicht zu
 * befinden.
 *
 * Die FACHLICHEN Invarianten (eine Application nur einmal, ein Tenant nur ein
 * Endkunde, Standort gehoert dem Endkunden) werden hier bewusst NICHT
 * geprueft. Sie sind Constraints in V0042, und dort gehoeren sie hin: eine
 * Vorab-Pruefung im Anwendungscode waere eine zweite Wahrheit, die unter
 * Nebenlaeufigkeit nicht haelt.
 */
export class HerkunftMappingAnlegenDto {
  /**
   * Optional: ohne Angabe uebernimmt der Service die Kennung dieses
   * Deployments (`EDMS_INGEST_QUELLE_CODE`, Default `standard`). Bei genau
   * einem Netzserver muss sie damit niemand tippen; ab dem zweiten ist sie
   * die Angabe, die den Unterschied macht.
   * Form 1:1 aus `ck_herkunft_mapping_quelle_code_form` (V0042) gespiegelt.
   */
  @IsOptional()
  @Matches(/^[a-z0-9][a-z0-9_-]{0,62}$/, {
    message: 'quelleCode darf nur a-z, 0-9, _ und - enthalten (erstes Zeichen alphanumerisch, hoechstens 63 Zeichen).',
  })
  quelleCode?: string;

  @IsUUID(undefined, { message: 'chirpstackTenantId muss eine UUID sein (Mandanten-Kennung des Netzservers).' })
  chirpstackTenantId!: string;

  @IsUUID(undefined, { message: 'chirpstackApplicationId muss eine UUID sein (Application-Kennung des Netzservers).' })
  chirpstackApplicationId!: string;

  @IsUUID(undefined, { message: 'endkundeId muss eine UUID sein.' })
  endkundeId!: string;

  @IsUUID(undefined, { message: 'standortId muss eine UUID sein.' })
  standortId!: string;
}
