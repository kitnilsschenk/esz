import { IsDefined, IsUUID, ValidateIf } from 'class-validator';

/**
 * `components/schemas/StandortVerschieben` (stammdaten.openapi.yaml, ADR-0010
 * §5, `POST .../standorte/{id}/verschieben`) — `neuerParentId: null` bedeutet
 * "an die Wurzel verschieben" (D2.4: nur zulässig, wenn `typ` bereits
 * `liegenschaft`/`gebaeude` ist — service-seitig geprüft). `@IsDefined()`
 * erzwingt PRÄSENZ des Felds (auch als explizites `null`), `@ValidateIf`
 * überspringt die UUID-Prüfung NUR für den `null`-Fall.
 */
export class StandortVerschiebenDto {
  @IsDefined()
  @ValidateIf((_object: unknown, value: unknown) => value !== null)
  @IsUUID()
  neuerParentId!: string | null;
}
